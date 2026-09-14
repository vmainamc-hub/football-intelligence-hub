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
function consensus(es: EngineOutput[]): EngineOutput {
  const u = es.filter((e) => e.probabilities),
    w = (e: EngineOutput) =>
      Math.max(0.2, Math.min(1.8, (e.quality / 100) * (0.55 + e.confidence / 200))),
    tw = u.reduce((s, e) => s + w(e), 0) || 1,
    H = u.reduce((s, e) => s + e.probabilities!.home * w(e), 0) / tw,
    D = u.reduce((s, e) => s + e.probabilities!.draw * w(e), 0) / tw,
    A = u.reduce((s, e) => s + e.probabilities!.away * w(e), 0) / tw,
    dis = avg(
      u.map(
        (e) =>
          Math.abs(e.probabilities!.home - H) +
          Math.abs(e.probabilities!.draw - D) +
          Math.abs(e.probabilities!.away - A),
      ),
    );
  return {
    id: "CONSENSUS",
    name: "Weighted Multi-Model Consensus",
    version: "consensus-v5",
    signal: dis < 0.18 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(Math.max(0, 1 - dis) * 100),
    quality: Math.round(Math.max(50, Math.min(98, 60 + u.length * 2))),
    probabilities: { home: H, draw: D, away: A },
    values: { agreement: 1 - dis, conflict: dis, models: u.length },
    evidence: [
      `${u.length} probability engines contributed with quality/confidence weighting.`,
      `Cross-model disagreement ${(dis * 100).toFixed(1)}%.`,
    ],
    limitations: u.length < 5 ? ["Fewer than five probability models are available."] : [],
  };
}
export function analyzeActiveAuthoritatively(
  f: MatchRow,
  rows: MatchRow[],
): AuthoritativeMatchAnalysis {
  const base = analyzeAuthoritatively(f, rows),
    advanced = runAdvancedEngines(f, rows) as unknown as EngineOutput[],
    core = base.engines.filter((e) => e.id !== "CONSENSUS"),
    initial = [...core, ...advanced],
    con = consensus(initial),
    sim = simulationEngineOutput(
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
    ),
    engines = [...initial, con, sim.engine],
    p = con.probabilities!,
    top = Math.max(p.home, p.draw, p.away),
    conflict = Number(con.values.conflict),
    quality = Math.round(
      Math.max(20, Math.min(98, avg(initial.map((e) => e.quality)) * 0.62 + (1 - conflict) * 38)),
    );
  let decision: AuthoritativeMatchAnalysis["decision"] = "NO STRONG EDGE";
  if (f.hg !== undefined && f.ag !== undefined) decision = base.decision;
  else if (quality < 38) decision = "INSUFFICIENT INTELLIGENCE";
  else if (conflict >= 0.2 && top - Math.min(p.home, p.draw, p.away) < 0.22)
    decision = "HIGH MODEL CONFLICT";
  else if (p.home === top && top >= 0.52) decision = "HOME EDGE";
  else if (p.away === top && top >= 0.52) decision = "AWAY EDGE";
  else if (p.draw === top && top >= 0.4) decision = "DRAW LEAN";
  const confidence = Math.round(
      Math.max(
        0,
        Math.min(100, 0.4 + (1 - conflict) * 0.34 + Math.abs(top - 1 / 3) * 0.95 + quality / 500),
      ) * 100,
    ),
    warnings = [...new Set([...base.warnings, ...engines.flatMap((e) => e.limitations)])],
    ledger = [
      ...base.evidenceLedger,
      ...advanced.flatMap((e) =>
        e.evidence.map((s, i) => ({
          id: `${e.id}-${i}`,
          source: "DERIVED_MODEL" as const,
          statement: s,
          quality: e.quality,
        })),
      ),
    ];
  return {
    ...base,
    analysisVersion: "gfi-authoritative-v6",
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
      analysisVersion: "gfi-authoritative-v6",
      activeEngineFamilies: ACTIVE_ENGINE_FAMILIES,
      simulation: sim.summary,
      evidenceLedger: ledger,
    },
  };
}
