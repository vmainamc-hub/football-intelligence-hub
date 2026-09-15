import type { MatchRow } from "./intelligence";
import type { EngineOutput, AuthoritativeMatchAnalysis } from "./authoritative";
import { analyzeAuthoritatively } from "./authoritative";
import { runAdvancedEngines } from "./advanced-engines";
import { simulationEngineOutput } from "./simulation-engine";

export const ACTIVE_ENGINE_FAMILIES = [
  "FORM",
  "GOALS",
  "VENUE",
  "TOTALS",
  "BTTS",
  "CONSISTENCY",
  "H2H",
  "DATA_QUALITY",
  "ELO",
  "BAYES_STRENGTH",
  "DIXON_COLES",
  "NEG_BINOMIAL",
  "MOMENTUM",
  "LOGISTIC_REGRESSION",
  "CONSENSUS",
  "SIMULATION",
] as const;

const avg = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function consensus(core: EngineOutput[], advanced: EngineOutput[]): EngineOutput {
  const probabilityModels = (models: EngineOutput[]) => models.filter((e) => e.probabilities);
  const weightedAverage = (models: EngineOutput[]) => {
    const usable = probabilityModels(models);
    const weight = (e: EngineOutput) =>
      Math.max(0.2, Math.min(1.8, (e.quality / 100) * (0.55 + e.confidence / 200)));
    const total = usable.reduce((s, e) => s + weight(e), 0) || 1;
    return {
      home: usable.reduce((s, e) => s + e.probabilities!.home * weight(e), 0) / total,
      draw: usable.reduce((s, e) => s + e.probabilities!.draw * weight(e), 0) / total,
      away: usable.reduce((s, e) => s + e.probabilities!.away * weight(e), 0) / total,
      models: usable.length,
    };
  };
  const coreAvg = weightedAverage(core);
  const advancedAvg = weightedAverage(advanced);
  const coreWeight = coreAvg.models ? 0.6 : 0;
  const advancedWeight = advancedAvg.models ? 0.4 : 0;
  const totalGroupWeight = coreWeight + advancedWeight || 1;
  const H = (coreAvg.home * coreWeight + advancedAvg.home * advancedWeight) / totalGroupWeight;
  const D = (coreAvg.draw * coreWeight + advancedAvg.draw * advancedWeight) / totalGroupWeight;
  const A = (coreAvg.away * coreWeight + advancedAvg.away * advancedWeight) / totalGroupWeight;
  const u = [...probabilityModels(core), ...probabilityModels(advanced)];
  const dis = avg(
    u.map(
      (e) =>
        0.5 *
        (Math.abs(e.probabilities!.home - H) +
          Math.abs(e.probabilities!.draw - D) +
          Math.abs(e.probabilities!.away - A)),
    ),
  );
  return {
    id: "CONSENSUS",
    name: "Weighted Multi-Model Consensus",
    version: "consensus-v6.1",
    signal: dis < 0.12 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(Math.max(0, 1 - dis) * 100),
    quality: Math.round(Math.max(52, Math.min(97, 58 + Math.min(18, u.length * 1.4)))),
    probabilities: { home: H, draw: D, away: A },
    values: {
      agreement: 1 - dis,
      conflict: dis,
      models: u.length,
      coreWeight,
      advancedWeight,
    },
    evidence: [
      `${u.length} probability engines contributed using quality/confidence weighting.`,
      `Core families carry ${Math.round(coreWeight * 100)}% of the vote; correlated advanced families carry ${Math.round(advancedWeight * 100)}%.`,
      `Cross-model disagreement ${(dis * 100).toFixed(1)}% after normalized weighting.`,
    ],
    limitations: u.length < 5 ? ["Fewer than five probability models are available."] : [],
  };
}

export function analyzeActiveAuthoritatively(
  f: MatchRow,
  rows: MatchRow[],
): AuthoritativeMatchAnalysis {
  const base = analyzeAuthoritatively(f, rows);
  const advanced = runAdvancedEngines(f, rows) as unknown as EngineOutput[];
  const core = base.engines.filter((e) => e.id !== "CONSENSUS");
  const initial = [...core, ...advanced];
  const con = consensus(core, advanced);
  const sim = simulationEngineOutput(
    {
      ...base,
      engines: initial,
      consensus: {
        home: con.probabilities!.home,
        draw: con.probabilities!.draw,
        away: con.probabilities!.away,
        agreement: Number(con.values.agreement),
        conflict: Number(con.values.conflict),
        leader: "none",
      },
    } as AuthoritativeMatchAnalysis,
    10000,
  );
  const engines = [...initial, con, sim.engine];
  const p = con.probabilities!;
  const top = Math.max(p.home, p.draw, p.away);
  const conflict = Number(con.values.conflict);
  const rawQuality = avg(initial.map((e) => e.quality));
  const quality = Math.round(Math.max(20, Math.min(98, rawQuality * 0.78 + 78 * 0.22)));
  const totalSample = base.home.played + base.away.played;

  let decision: AuthoritativeMatchAnalysis["decision"] = "NO STRONG EDGE";
  if (totalSample < 8 || quality < 38) decision = "INSUFFICIENT INTELLIGENCE";
  else if (conflict >= 0.24 && top < 0.5) decision = "HIGH MODEL CONFLICT";
  else if (p.home === top && top >= 0.5 && conflict < 0.24) decision = "HOME EDGE";
  else if (p.away === top && top >= 0.5 && conflict < 0.24) decision = "AWAY EDGE";
  else if (p.draw === top && top >= 0.4 && conflict < 0.24) decision = "DRAW LEAN";

  const confidence = Math.round(
    clamp(0.42 + (1 - conflict) * 0.34 + Math.abs(top - 1 / 3) * 0.9 + quality / 500) * 100,
  );
  const warnings = [...new Set([...base.warnings, ...engines.flatMap((e) => e.limitations)])];
  const ledger = [
    ...base.evidenceLedger,
    ...advanced.flatMap((e) =>
      e.evidence.map((statement, i) => ({
        id: `${e.id}-${i}`,
        source: "DERIVED_MODEL" as const,
        statement,
        quality: e.quality,
      })),
    ),
  ];

  return {
    ...base,
    probabilities: { home: p.home, draw: p.draw, away: p.away },
    analysisVersion: "gfi-authoritative-v6.2",
    engines,
    evidenceLedger: ledger,
    consensus: {
      home: p.home,
      draw: p.draw,
      away: p.away,
      agreement: Number(con.values.agreement),
      conflict,
      leader: top < 0.42 ? "none" : p.home === top ? "home" : p.draw === top ? "draw" : "away",
    },
    quality,
    confidence,
    decision,
    verdict: decision,
    warnings,
    evidence: ledger.slice(0, 16).map((e) => e.statement),
    finalPrediction:
      decision === "HOME EDGE"
        ? `${base.home.team} win`
        : decision === "AWAY EDGE"
          ? `${base.away.team} win`
          : decision === "DRAW LEAN"
            ? "Draw"
            : base.finalPrediction,
    aiReasoningPacket: {
      ...base.aiReasoningPacket,
      analysisVersion: "gfi-authoritative-v6.2",
      activeEngineFamilies: ACTIVE_ENGINE_FAMILIES,
      aiRole: "EXPLAINABLE_MULTI_MODEL_SYNTHESIS",
      aiStatus:
        "The authoritative prediction is produced by a deterministic statistical ensemble with explicit evidence weighting, conflict control and simulation validation. No external generative AI model is silently overriding the result.",
      decisionReason:
        decision === "HIGH MODEL CONFLICT"
          ? "Model disagreement is materially high and no 1X2 outcome reaches the strengthened edge threshold."
          : decision === "NO STRONG EDGE"
            ? "No 1X2 outcome reaches the edge threshold; actionable mainstream markets are evaluated separately."
            : decision === "INSUFFICIENT INTELLIGENCE"
              ? "The evidence sample is too small or weak for an authoritative result."
              : "A 1X2 outcome clears the authoritative probability and conflict thresholds.",
      simulation: sim.summary,
      evidenceLedger: ledger,
    },
  };
}
