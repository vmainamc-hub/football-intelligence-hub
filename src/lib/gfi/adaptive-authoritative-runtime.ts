import type { MatchRow } from "./intelligence";
import type { EngineOutput, AuthoritativeMatchAnalysis } from "./authoritative";
import { analyzeActiveAuthoritatively as baseAnalyze } from "./authoritative-runtime";
import { buildAdaptiveSnapshot } from "./adaptive-regime";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const poisson = (lambda: number, k: number) => {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
};
const oneX2 = (lh: number, la: number) => {
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = poisson(lh, i) * poisson(la, j);
    if (i > j) h += p;
    else if (i === j) d += p;
    else a += p;
  }
  const z = h + d + a || 1;
  return { home: h / z, draw: d / z, away: a / z };
};

export function analyzeAdaptiveAuthoritatively(fixture: MatchRow, rows: MatchRow[]): AuthoritativeMatchAnalysis {
  const base = baseAnalyze(fixture, rows);
  const asOf = fixture.date;
  const home = buildAdaptiveSnapshot(fixture.home, rows, "home", asOf);
  const away = buildAdaptiveSnapshot(fixture.away, rows, "away", asOf);

  const homeLambda = clamp(home.goalsFor / Math.max(1, home.played) * 0.62 + away.goalsAgainst / Math.max(1, away.played) * 0.38, 0.4, 3.6);
  const awayLambda = clamp(away.goalsFor / Math.max(1, away.played) * 0.62 + home.goalsAgainst / Math.max(1, home.played) * 0.38, 0.3, 3.3);
  const adaptiveProb = oneX2(homeLambda, awayLambda);

  const baseP = base.probabilities;
  const regimeWeight = clamp(0.46 + Math.max(home.adaptive?.regimeShiftScore ?? 0, away.adaptive?.regimeShiftScore ?? 0) * 0.18, 0.46, 0.64);
  const p = {
    home: baseP.home * (1 - regimeWeight) + adaptiveProb.home * regimeWeight,
    draw: baseP.draw * (1 - regimeWeight) + adaptiveProb.draw * regimeWeight,
    away: baseP.away * (1 - regimeWeight) + adaptiveProb.away * regimeWeight,
  };
  const z = p.home + p.draw + p.away || 1;
  p.home /= z; p.draw /= z; p.away /= z;

  const totalMean = clamp(homeLambda + awayLambda, 1.2, 5.5);
  const over = (line: number) => {
    let sum = 0;
    for (let k = 0; k <= Math.floor(line); k++) sum += poisson(totalMean, k);
    return clamp(1 - sum);
  };
  const bttsYes = clamp((1 - Math.exp(-homeLambda)) * (1 - Math.exp(-awayLambda)));

  const adaptiveEngine: EngineOutput = {
    id: "MOMENTUM",
    name: "Adaptive Recency + Regime",
    version: "arrm-v1",
    signal: Math.max(home.adaptive?.regimeShiftScore ?? 0, away.adaptive?.regimeShiftScore ?? 0) >= 0.35 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.42 + Math.abs(p.home - p.away) * 0.7 + (home.played + away.played) / 120) * 100),
    quality: Math.round(clamp(0.48 + Math.min(1, (home.played + away.played) / 24) * 0.38) * 100),
    probabilities: p,
    values: {
      lambdaHome: homeLambda,
      lambdaAway: awayLambda,
      expectedGoals: totalMean,
      homePPG: home.points / Math.max(1, home.played),
      awayPPG: away.points / Math.max(1, away.played),
      homeEffectiveSample: home.adaptive?.effectiveSample ?? home.played,
      awayEffectiveSample: away.adaptive?.effectiveSample ?? away.played,
      homeRegimeShift: home.adaptive?.regimeShiftScore ?? 0,
      awayRegimeShift: away.adaptive?.regimeShiftScore ?? 0,
      homeHalfLifeDays: home.adaptive?.halfLifeDays ?? 120,
      awayHalfLifeDays: away.adaptive?.halfLifeDays ?? 120,
      homeOpponentStrength: home.adaptive?.opponentStrength ?? 1,
      awayOpponentStrength: away.adaptive?.opponentStrength ?? 1,
    },
    evidence: [
      `${home.team}: adaptive ${home.adaptive?.regimeStatus ?? "STABLE"}, half-life ${home.adaptive?.halfLifeDays ?? 120}d, effective sample ${home.adaptive?.effectiveSample ?? home.played}.`,
      `${away.team}: adaptive ${away.adaptive?.regimeStatus ?? "STABLE"}, half-life ${away.adaptive?.halfLifeDays ?? 120}d, effective sample ${away.adaptive?.effectiveSample ?? away.played}.`,
      `Recent evidence is weighted exponentially; current-season and venue matches receive additional weight, while opponent strength adjusts contribution.`,
    ],
    limitations: [
      "Adaptive regime is a quantitative recency layer, not an independent news or lineup source.",
      ...(Math.max(home.adaptive?.shrinkagePct ?? 0, away.adaptive?.shrinkagePct ?? 0) >= 35 ? ["Sparse samples are shrunk toward league/global priors."] : []),
    ],
  };

  const engines = base.engines.filter((e) => e.id !== "MOMENTUM");
  engines.push(adaptiveEngine);
  const goals = engines.find((e) => e.id === "GOALS");
  if (goals) {
    goals.values = { ...goals.values, lambdaHome: homeLambda, lambdaAway: awayLambda, expectedGoals: totalMean, adaptiveRegime: 1 };
    goals.version = `${goals.version}-arrm`;
  }
  const totals = engines.find((e) => e.id === "TOTALS");
  if (totals) {
    totals.values = { ...totals.values, expectedGoals: totalMean, over0.5: over(0.5), over1.5: over(1.5), over2.5: over(2.5), over3.5: over(3.5) };
    totals.version = `${totals.version}-arrm`;
  }
  const btts = engines.find((e) => e.id === "BTTS");
  if (btts) {
    btts.values = { ...btts.values, yes: bttsYes, no: 1 - bttsYes };
    btts.version = `${btts.version}-arrm`;
  }

  const evidenceLedger = [...base.evidenceLedger, ...adaptiveEngine.evidence.map((statement, i) => ({ id: `ARRM-${i}`, source: "DERIVED_MODEL" as const, statement, quality: adaptiveEngine.quality }))];
  const top = Math.max(p.home, p.draw, p.away);
  const leader = p.home === top ? "home" : p.draw === top ? "draw" : "away";
  const predictedScore = (() => {
    let best = "1-1", bestP = 0;
    for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) {
      const q = poisson(homeLambda, h) * poisson(awayLambda, a);
      if (q > bestP) { bestP = q; best = `${h}-${a}`; }
    }
    return best;
  })();

  const reasoning = {
    ...(base.aiReasoningPacket ?? {}),
    adaptiveRecencyRegime: adaptiveEngine.values,
    adaptivePolicy: "ARRM: recency decay + regime shift + current-season/venue weighting + opponent-strength adjustment + Bayesian-style shrinkage.",
  };

  return {
    ...base,
    home,
    away,
    probabilities: p,
    totals: { ...base.totals, "over0.5": over(0.5), "over1.5": over(1.5), "over2.5": over(2.5), "over3.5": over(3.5) },
    btts: { yes: bttsYes, no: 1 - bttsYes },
    engines,
    evidenceLedger,
    modelConvergence: Math.max(0, Math.min(1, Number(base.modelConvergence ?? 0) * 0.7 + (adaptiveEngine.confidence / 100) * 0.3)),
    predictedScore,
    predictedScoreState: (home.adaptive?.effectiveSample ?? 0) + (away.adaptive?.effectiveSample ?? 0) >= 8 ? "EVIDENCE_BACKED" : "PRIOR_BASED",
    predictedScoreNote: "Scoreline and probabilities incorporate the Adaptive Recency + Regime Engine; sparse evidence is shrunk toward the prior.",
    evidence: [...base.evidence, `ARRM active: ${home.adaptive?.regimeStatus ?? "STABLE"} / ${away.adaptive?.regimeStatus ?? "STABLE"}; half-lives ${home.adaptive?.halfLifeDays ?? 120}d / ${away.adaptive?.halfLifeDays ?? 120}d.`],
    evidenceMetrics: base.evidenceMetrics ? { ...base.evidenceMetrics, directHomeEvidence: home.adaptive?.effectiveSample ?? home.played, directAwayEvidence: away.adaptive?.effectiveSample ?? away.played } : undefined,
    consensus: { ...base.consensus, home: p.home, draw: p.draw, away: p.away, leader },
    finalPrediction: base.finalPrediction,
    aiReasoningPacket: reasoning,
    analysisVersion: "gfi-authoritative-v10-arrm",
    deploymentFingerprint: base.deploymentFingerprint ? { ...base.deploymentFingerprint, analysisVersion: "gfi-authoritative-v10-arrm", engineId: "gfi-ensemble-authoritative-v10-arrm" } : undefined,
  };
}
