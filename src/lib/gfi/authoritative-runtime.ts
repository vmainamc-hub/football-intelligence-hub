import type { MatchRow } from "./intelligence";
import type { EngineOutput, AuthoritativeMatchAnalysis } from "./authoritative";
import { analyzeAuthoritatively, buildAuthoritativeMarketCandidates } from "./authoritative";
import { runAdvancedEngines } from "./advanced-engines";
import { simulationEngineOutput } from "./simulation-engine";
import { buildAdaptiveSnapshot } from "./adaptive-regime";
import { deriveConsensusActionability } from "./actionability";

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
const poisson = (lambda: number, k: number) => {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
};
const oneX2 = (lh: number, la: number) => {
  let h = 0,
    d = 0,
    a = 0;
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 10; j++) {
      const p = poisson(lh, i) * poisson(la, j);
      if (i > j) h += p;
      else if (i === j) d += p;
      else a += p;
    }
  const z = h + d + a || 1;
  return { home: h / z, draw: d / z, away: a / z };
};

function consensus(core: EngineOutput[], advanced: EngineOutput[]): EngineOutput {
  const u = [...core, ...advanced].filter(
    (e) =>
      e.probabilities &&
      e.id !== "CONSENSUS" &&
      e.id !== "SIMULATION" &&
      e.id !== "DATA_QUALITY" &&
      e.id !== "MARKET" &&
      e.id !== "MOMENTUM",
  );
  const weight = (e: EngineOutput) => clamp(e.quality / 100, 0.15, 1.25);
  const total = u.reduce((s, e) => s + weight(e), 0) || 1;
  const H = u.reduce((s, e) => s + e.probabilities!.home * weight(e), 0) / total;
  const D = u.reduce((s, e) => s + e.probabilities!.draw * weight(e), 0) / total;
  const A = u.reduce((s, e) => s + e.probabilities!.away * weight(e), 0) / total;
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
    name: "Evidence-weighted Consensus",
    version: "consensus-v8",
    signal: dis < 0.12 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(clamp(1 - dis) * 100),
    quality: Math.round(avg(u.map((e) => e.quality))),
    probabilities: { home: H, draw: D, away: A },
    values: { agreement: 1 - dis, conflict: dis, models: u.length, independentModels: u.length },
    evidence: [
      `${u.length} independent probability-producing model families contributed.`,
      `Weights are based on evidence-adjusted model quality; outcome probability is not used as confidence.`,
      `Cross-model probability dispersion: ${(dis * 100).toFixed(1)}%.`,
    ],
    limitations:
      u.length < 5 ? ["Fewer than five independent probability-producing engines are available."] : [],
  };
}

function globalPrior(rows: MatchRow[]) {
  const z = rows.filter((x) => x.hg !== undefined && x.ag !== undefined);
  if (!z.length)
    return { home: 0.44, draw: 0.27, away: 0.29, lh: 1.35, la: 1.1, total: 2.45, n: 0 };
  let h = 0,
    d = 0,
    a = 0;
  for (const x of z) {
    if (x.hg! > x.ag!) h++;
    else if (x.hg === x.ag) d++;
    else a++;
  }
  const n = z.length;
  return {
    home: h / n,
    draw: d / n,
    away: a / n,
    lh: avg(z.map((x) => x.hg!)) || 1.35,
    la: avg(z.map((x) => x.ag!)) || 1.1,
    total: avg(z.map((x) => x.hg! + x.ag!)) || 2.45,
    n,
  };
}

function sparseRepair(
  base: AuthoritativeMatchAnalysis,
  rows: MatchRow[],
): AuthoritativeMatchAnalysis {
  const teamSample = base.home.played + base.away.played;
  if (teamSample > 0) return base;
  const g = globalPrior(rows),
    p = oneX2(g.lh, g.la);
  const engines = base.engines.map((e) => {
    if (e.id === "FORM")
      return {
        ...e,
        version: "form-sparse-prior-v2",
        probabilities: p,
        quality: 25,
        confidence: 25,
        signal: "LIMITATION" as const,
        values: { ...e.values, priorMatches: g.n },
      };
    if (e.id === "GOALS")
      return {
        ...e,
        version: "goals-global-prior-v2",
        probabilities: p,
        values: { ...e.values, lambdaHome: g.lh, lambdaAway: g.la, expectedGoals: g.total },
        quality: 25,
        confidence: 25,
        signal: "LIMITATION" as const,
        limitations: [...e.limitations, "No direct team sample; global prior only."],
      };
    if (e.id === "TOTALS") {
      const over = (line: number) =>
        1 - [...Array(Math.floor(line) + 1)].reduce((s, _, k) => s + poisson(g.total, k), 0);
      return {
        ...e,
        version: "totals-global-prior-v2",
        values: {
          ...e.values,
          expectedGoals: g.total,
          "over0.5": over(0.5),
          "over1.5": over(1.5),
          "over2.5": over(2.5),
          "over3.5": over(3.5),
        },
        quality: 25,
        confidence: 25,
        signal: "LIMITATION" as const,
        limitations: [...e.limitations, "No direct team sample; global prior only."],
      };
    }
    if (e.id === "BTTS") {
      const yes = (1 - Math.exp(-g.lh)) * (1 - Math.exp(-g.la));
      return {
        ...e,
        version: "btts-global-prior-v2",
        values: { ...e.values, yes, no: 1 - yes },
        quality: 25,
        confidence: 25,
        signal: "LIMITATION" as const,
        limitations: [...e.limitations, "No direct team sample; global prior only."],
      };
    }
    if (e.id === "VENUE")
      return {
        ...e,
        version: "venue-global-prior-v2",
        probabilities: p,
        values: { ...e.values, homeVenueWinRate: g.home },
        quality: 25,
        confidence: 25,
        signal: "LIMITATION" as const,
      };
    if (e.probabilities)
      return {
        ...e,
        version: `${e.id.toLowerCase()}-global-prior-v2`,
        probabilities: p,
        quality: 25,
        confidence: 25,
        signal: "LIMITATION" as const,
        limitations: [...e.limitations, "No direct team sample; global prior only."],
      };
    if (e.id === "DATA_QUALITY")
      return {
        ...e,
        quality: 20,
        confidence: 20,
        signal: "LIMITATION" as const,
        values: { ...e.values, completedMatches: 0, globalPriorMatches: g.n },
      };
    return e;
  });
  return { ...base, engines, probabilities: p };
}

function calibrateEngineQuality(
  engines: EngineOutput[],
  teamSample: number,
  globalN: number,
): EngineOutput[] {
  const teamFactor = 0.25 + 0.75 * Math.min(1, teamSample / 30);
  const globalFactor = 0.85 + 0.15 * Math.min(1, globalN / 300);
  return engines.map((e) => {
    const q = Math.round(clamp((e.quality / 100) * teamFactor * globalFactor) * 100);
    const c = Math.round(clamp((e.confidence / 100) * (0.35 + 0.65 * teamFactor)) * 100);
    return {
      ...e,
      quality: q,
      confidence: c,
      values: { ...e.values, evidenceTeamSample: teamSample, evidenceGlobalMatches: globalN },
    };
  });
}

export function analyzeActiveAuthoritatively(
  f: MatchRow,
  rows: MatchRow[],
): AuthoritativeMatchAnalysis {
  const base = sparseRepair(analyzeAuthoritatively(f, rows), rows);
  const globalN = rows.filter((x) => x.hg !== undefined && x.ag !== undefined).length;
  const teamSample = base.home.played + base.away.played;
  const core = calibrateEngineQuality(
    base.engines.filter((e) => e.id !== "CONSENSUS"),
    teamSample,
    globalN,
  );
  const advanced = calibrateEngineQuality(
    runAdvancedEngines(f, rows) as unknown as EngineOutput[],
    teamSample,
    globalN,
  );
  const con = consensus(core, advanced);
  const initial = [...core, ...advanced, con];
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
  const simEngine = {
    ...sim.engine,
    quality: Math.round(sim.engine.quality * 0.25),
    confidence: Math.round(sim.engine.confidence * 0.35),
    limitations: [
      ...sim.engine.limitations,
      "Derived from the consensus goal/scoring assumptions; not counted as an independent vote.",
    ],
  };

  const asOf = f.date ? f.date : rows.reduce((latest, m) => (m.date > latest ? m.date : latest), "0000-00-00");
  const homeAdaptive = buildAdaptiveSnapshot(f.home, rows, "home", asOf, f.away);
  const awayAdaptive = buildAdaptiveSnapshot(f.away, rows, "away", asOf, f.home);

  // Competition goal priors from rows, otherwise standard baseline (1.35 home, 1.15 away)
  let compHomeG = 1.35;
  let compAwayG = 1.15;
  const scoredRows = rows.filter((r) => typeof r.hg === "number" && typeof r.ag === "number");
  if (scoredRows.length >= 6) {
    const totalHg = scoredRows.reduce((s, r) => s + (r.hg ?? 0), 0);
    const totalAg = scoredRows.reduce((s, r) => s + (r.ag ?? 0), 0);
    compHomeG = clamp(totalHg / scoredRows.length, 0.9, 2.2);
    compAwayG = clamp(totalAg / scoredRows.length, 0.7, 1.8);
  }

  // Bayesian shrinkage: sparse observations shrink to competition priors rather than collapsing to minimum clamps
  const hN = homeAdaptive.played;
  const aN = awayAdaptive.played;
  const kPrior = 3; // pseudo-observations

  const rawHomeFor = hN > 0 ? homeAdaptive.goalsFor / hN : compHomeG;
  const rawAwayAgainst = aN > 0 ? awayAdaptive.goalsAgainst / aN : compHomeG;
  const shrunkHomeFor = (rawHomeFor * hN + compHomeG * kPrior) / (hN + kPrior);
  const shrunkAwayAgainst = (rawAwayAgainst * aN + compHomeG * kPrior) / (aN + kPrior);

  const rawAwayFor = aN > 0 ? awayAdaptive.goalsFor / aN : compAwayG;
  const rawHomeAgainst = hN > 0 ? homeAdaptive.goalsAgainst / hN : compAwayG;
  const shrunkAwayFor = (rawAwayFor * aN + compAwayG * kPrior) / (aN + kPrior);
  const shrunkHomeAgainst = (rawHomeAgainst * hN + compAwayG * kPrior) / (hN + kPrior);

  const homeLambda = clamp(
    shrunkHomeFor * 0.62 + shrunkAwayAgainst * 0.38,
    0.60,
    3.6,
  );
  const awayLambda = clamp(
    shrunkAwayFor * 0.62 + shrunkHomeAgainst * 0.38,
    0.50,
    3.4,
  );
  const adaptiveProb = oneX2(homeLambda, awayLambda);

  const maxShift = Math.max(homeAdaptive.adaptive?.regimeShiftScore ?? 0, awayAdaptive.adaptive?.regimeShiftScore ?? 0);
  const regimeWeight = clamp(0.48 + maxShift * 0.18, 0.45, 0.66);

  const conP = con.probabilities!;
  const p = {
    home: conP.home * (1 - regimeWeight) + adaptiveProb.home * regimeWeight,
    draw: conP.draw * (1 - regimeWeight) + adaptiveProb.draw * regimeWeight,
    away: conP.away * (1 - regimeWeight) + adaptiveProb.away * regimeWeight,
  };
  const zP = p.home + p.draw + p.away || 1;
  p.home /= zP;
  p.draw /= zP;
  p.away /= zP;

  const totalMean = clamp(homeLambda + awayLambda, 1.5, 5.5);
  const over = (line: number) => {
    let sum = 0;
    for (let k = 0; k <= Math.floor(line); k++) sum += poisson(totalMean, k);
    return clamp(1 - sum);
  };
  const bttsYes = clamp((1 - Math.exp(-homeLambda)) * (1 - Math.exp(-awayLambda)));

  const adaptiveEngine: EngineOutput = {
    id: "MOMENTUM",
    name: "Adaptive Recency + Regime (ARRM)",
    version: "arrm-v1",
    signal: maxShift >= 0.32 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.40 + Math.abs(p.home - p.away) * 0.65 + teamSample / 120) * 100),
    quality: Math.round(clamp(0.45 + Math.min(1, teamSample / 24) * 0.40) * 100),
    probabilities: p,
    values: {
      lambdaHome: homeLambda,
      lambdaAway: awayLambda,
      expectedGoals: totalMean,
      homePPG: homeAdaptive.points / Math.max(1, homeAdaptive.played),
      awayPPG: awayAdaptive.points / Math.max(1, awayAdaptive.played),
      homeRawSample: homeAdaptive.adaptive?.rawSample ?? homeAdaptive.played,
      awayRawSample: awayAdaptive.adaptive?.rawSample ?? awayAdaptive.played,
      homeEffectiveSample: homeAdaptive.adaptive?.effectiveSample ?? homeAdaptive.played,
      awayEffectiveSample: awayAdaptive.adaptive?.effectiveSample ?? awayAdaptive.played,
      homeRegimeShift: homeAdaptive.adaptive?.regimeShiftScore ?? 0,
      awayRegimeShift: awayAdaptive.adaptive?.regimeShiftScore ?? 0,
      homeRegimeStatus: homeAdaptive.adaptive?.regimeStatus ?? "STABLE",
      awayRegimeStatus: awayAdaptive.adaptive?.regimeStatus ?? "STABLE",
      homeHalfLifeDays: homeAdaptive.adaptive?.halfLifeDays ?? 120,
      awayHalfLifeDays: awayAdaptive.adaptive?.halfLifeDays ?? 120,
      homeOpponentStrength: homeAdaptive.adaptive?.opponentStrength ?? 1,
      awayOpponentStrength: awayAdaptive.adaptive?.opponentStrength ?? 1,
      homeShrinkagePct: homeAdaptive.adaptive?.shrinkagePct ?? 0,
      awayShrinkagePct: awayAdaptive.adaptive?.shrinkagePct ?? 0,
      homeRecencyWeightPct: homeAdaptive.adaptive?.recencyWeightPct ?? 0,
      awayRecencyWeightPct: awayAdaptive.adaptive?.recencyWeightPct ?? 0,
      homeCurrentSeasonSharePct: homeAdaptive.adaptive?.currentSeasonSharePct ?? 0,
      awayCurrentSeasonSharePct: awayAdaptive.adaptive?.currentSeasonSharePct ?? 0,
      homeVenueSharePct: homeAdaptive.adaptive?.venueSharePct ?? 0,
      awayVenueSharePct: awayAdaptive.adaptive?.venueSharePct ?? 0,
    },
    evidence: [
      `${f.home}: adaptive ${homeAdaptive.adaptive?.regimeStatus ?? "STABLE"}, half-life ${homeAdaptive.adaptive?.halfLifeDays ?? 120}d, raw sample ${homeAdaptive.adaptive?.rawSample ?? homeAdaptive.played}, effective sample ${homeAdaptive.adaptive?.effectiveSample ?? homeAdaptive.played}.`,
      `${f.away}: adaptive ${awayAdaptive.adaptive?.regimeStatus ?? "STABLE"}, half-life ${awayAdaptive.adaptive?.halfLifeDays ?? 120}d, raw sample ${awayAdaptive.adaptive?.rawSample ?? awayAdaptive.played}, effective sample ${awayAdaptive.adaptive?.effectiveSample ?? awayAdaptive.played}.`,
      "ARRM dynamically applies exponential recency decay, continuous dynamic memory, current-season & venue bonuses, opponent-strength calibration, and Bayesian shrinkage.",
    ],
    limitations: [
      "ARRM is an evidence-weighting mathematical layer; it does not fabricate missing historical data or news.",
      ...(Math.max(homeAdaptive.adaptive?.shrinkagePct ?? 0, awayAdaptive.adaptive?.shrinkagePct ?? 0) >= 35
        ? ["Small samples are shrunk toward league/global baselines."]
        : []),
    ],
  };

  const engines = [...initial.filter((e) => e.id !== "MOMENTUM"), adaptiveEngine, simEngine];
  const goalsEngine = engines.find((e) => e.id === "GOALS");
  if (goalsEngine) {
    goalsEngine.values = {
      ...goalsEngine.values,
      lambdaHome: homeLambda,
      lambdaAway: awayLambda,
      expectedGoals: totalMean,
      adaptiveRegime: 1,
    };
    goalsEngine.version = `${goalsEngine.version}-arrm`;
  }
  const totalsEngine = engines.find((e) => e.id === "TOTALS");
  if (totalsEngine) {
    totalsEngine.values = {
      ...totalsEngine.values,
      expectedGoals: totalMean,
      "over0.5": over(0.5),
      "over1.5": over(1.5),
      "over2.5": over(2.5),
      "over3.5": over(3.5),
    };
    totalsEngine.version = `${totalsEngine.version}-arrm`;
  }
  const bttsEngine = engines.find((e) => e.id === "BTTS");
  if (bttsEngine) {
    bttsEngine.values = {
      ...bttsEngine.values,
      yes: bttsYes,
      no: 1 - bttsYes,
    };
    bttsEngine.version = `${bttsEngine.version}-arrm`;
  }

  const teamCoverage = clamp(teamSample / 30),
    globalCoverage = clamp(globalN / 300),
    engineCoverage = clamp(initial.filter((e) => e.probabilities).length / 14);
  const agreement = Number(con.values.agreement),
    conflict = Number(con.values.conflict);
  const quality = Math.round(
    clamp(0.2 + 0.6 * teamCoverage + 0.12 * globalCoverage + 0.08 * engineCoverage) * 100,
  );
  const confidence = Math.round(
    clamp(0.2 + 0.45 * teamCoverage + 0.15 * globalCoverage + 0.2 * agreement) * 100,
  );
  const top = Math.max(p.home, p.draw, p.away),
    spread = top - Math.min(p.home, p.draw, p.away);
  let decision: AuthoritativeMatchAnalysis["decision"];
  if (teamSample < 8) decision = "INSUFFICIENT INTELLIGENCE";
  else if (conflict >= 0.24 && spread < 0.18) decision = "HIGH MODEL CONFLICT";
  else if (top >= 0.52 && conflict < 0.2)
    decision = p.home === top ? "HOME EDGE" : p.away === top ? "AWAY EDGE" : "DRAW LEAN";
  else if (p.draw === top && top >= 0.4 && conflict < 0.2) decision = "DRAW LEAN";
  else decision = "NO STRONG EDGE";
  const risk: AuthoritativeMatchAnalysis["risk"] =
    decision === "INSUFFICIENT INTELLIGENCE"
      ? "VERY HIGH"
      : confidence < 40
        ? "VERY HIGH"
        : confidence < 55
          ? "HIGH"
          : confidence < 70
            ? "MODERATE"
            : "LOW";
  const robustnessScore = Math.round(clamp((quality / 100) * 0.55 + agreement * 0.45) * 100);
  const robustness = {
    score: robustnessScore,
    label: (robustnessScore >= 78
      ? "ROBUST"
      : robustnessScore >= 62
        ? "STABLE"
        : robustnessScore >= 45
          ? "FRAGILE"
          : "UNSTABLE") as AuthoritativeMatchAnalysis["robustness"]["label"],
  };
  const ledger: AuthoritativeMatchAnalysis["evidenceLedger"] = base.evidenceLedger.concat(
    advanced.flatMap((e) =>
      e.evidence.map((statement, i) => ({
        id: `${e.id}-${i}`,
        source: "DERIVED_MODEL" as const,
        statement,
        quality: e.quality,
      })),
    ),
    adaptiveEngine.evidence.map((statement, i) => ({
      id: `ARRM-${i}`,
      source: "DERIVED_MODEL" as const,
      statement,
      quality: adaptiveEngine.quality,
    })),
  );

  const predictedScore = (() => {
    let best = "1-1",
      bp = 0;
    for (let h = 0; h <= 8; h++)
      for (let a = 0; a <= 8; a++) {
        const q = poisson(homeLambda, h) * poisson(awayLambda, a);
        if (q > bp) {
          bp = q;
          best = `${h}-${a}`;
        }
      }
    return best;
  })();

  const totalValues = {
    "over0.5": over(0.5),
    "over1.5": over(1.5),
    "over2.5": over(2.5),
    "over3.5": over(3.5),
  };
  const yes = bttsYes;

  const dnbHome = p.home / Math.max(0.0001, p.home + p.away);
  const dnbAway = p.away / Math.max(0.0001, p.home + p.away);

  const candidates: AuthoritativeMatchAnalysis["predictions"] = [
    { market: "HOME", label: `${base.home.team} win`, probability: p.home, strength: Math.max(0, (p.home - 0.40) / 0.60) },
    { market: "DRAW", label: "Draw", probability: p.draw, strength: Math.max(0, (p.draw - 0.27) / 0.73) },
    { market: "AWAY", label: `${base.away.team} win`, probability: p.away, strength: Math.max(0, (p.away - 0.40) / 0.60) },
    { market: "DOUBLE CHANCE", label: `${base.home.team} or Draw (1X)`, probability: p.home + p.draw, strength: Math.max(0, (p.home + p.draw - 0.67) / 0.33) },
    { market: "DOUBLE CHANCE", label: `Draw or ${base.away.team} (X2)`, probability: p.draw + p.away, strength: Math.max(0, (p.draw + p.away - 0.67) / 0.33) },
    { market: "DOUBLE CHANCE", label: `${base.home.team} or ${base.away.team} (12)`, probability: p.home + p.away, strength: Math.max(0, (p.home + p.away - 0.67) / 0.33) },
    { market: "DRAW NO BET", label: `${base.home.team} DNB`, probability: dnbHome, strength: Math.max(0, (dnbHome - 0.50) / 0.50) },
    { market: "DRAW NO BET", label: `${base.away.team} DNB`, probability: dnbAway, strength: Math.max(0, (dnbAway - 0.50) / 0.50) },
    { market: "OVER 1.5", label: "Over 1.5", probability: totalValues["over1.5"], strength: Math.max(0, (totalValues["over1.5"] - 0.74) / 0.26) },
    { market: "UNDER 1.5", label: "Under 1.5", probability: 1 - totalValues["over1.5"], strength: Math.max(0, (1 - totalValues["over1.5"] - 0.26) / 0.74) },
    { market: "OVER 2.5", label: "Over 2.5", probability: totalValues["over2.5"], strength: Math.max(0, (totalValues["over2.5"] - 0.50) / 0.50) },
    { market: "UNDER 2.5", label: "Under 2.5", probability: 1 - totalValues["over2.5"], strength: Math.max(0, (1 - totalValues["over2.5"] - 0.50) / 0.50) },
    { market: "OVER 3.5", label: "Over 3.5", probability: totalValues["over3.5"], strength: Math.max(0, (totalValues["over3.5"] - 0.28) / 0.72) },
    { market: "UNDER 3.5", label: "Under 3.5", probability: 1 - totalValues["over3.5"], strength: Math.max(0, (1 - totalValues["over3.5"] - 0.72) / 0.28) },
    { market: "BTTS", label: "BTTS — YES", probability: yes, strength: Math.max(0, (yes - 0.50) / 0.50) },
    { market: "BTTS", label: "BTTS — NO", probability: 1 - yes, strength: Math.max(0, (1 - yes - 0.50) / 0.50) },
  ]
    .filter((x) => Number.isFinite(x.probability))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  const marketCandidateResults = buildAuthoritativeMarketCandidates(
    p,
    totalValues,
    { yes, no: 1 - yes },
    base.home.team,
    base.away.team,
    base.evidenceState ?? (teamSample === 0 ? "PRIOR-BASED" : teamSample < 8 ? "LIMITED EVIDENCE" : "VERIFIED"),
    teamSample,
    base.asymmetricEvidence,
    confidence,
    conflict,
  );

  const sparseWarning =
    teamSample === 0
      ? `No direct historical match was matched to either team in the assembled context. Probabilities use an explicit global prior (${globalN} completed rows), not a low-goal fallback.`
      : teamSample < 8
        ? `Only ${teamSample} direct team observations were matched; the model remains available for analysis, but epistemic confidence is limited.`
        : undefined;
  const warnings = [
    ...new Set(
      [...base.warnings, ...engines.flatMap((e) => e.limitations), sparseWarning].filter(
        Boolean,
      ) as string[],
    ),
  ];

  const provisionalAnalysis: AuthoritativeMatchAnalysis = {
    ...base,
    home: homeAdaptive,
    away: awayAdaptive,
    analysisVersion: "gfi-authoritative-v10-arrm",
    engines,
    evidenceLedger: ledger,
    probabilities: p,
    totals: { ...base.totals, ...totalValues },
    btts: { yes, no: 1 - yes },
    quality,
    confidence,
    decision,
    verdict: decision,
    finalPrediction: "",
    predictedScore,
    predictedScoreState:
      (homeAdaptive.adaptive?.effectiveSample ?? 0) + (awayAdaptive.adaptive?.effectiveSample ?? 0) >= 8
        ? "EVIDENCE_BACKED"
        : "PRIOR_BASED",
    predictedScoreNote:
      "Scoreline and probabilities incorporate the Adaptive Recency + Regime Engine; sparse evidence is shrunk toward the prior.",
    predictions: candidates,
    marketCandidates: marketCandidateResults.candidates,
    valueAnalysis: marketCandidateResults.valueAnalysis,
    contradictionAnalysis: marketCandidateResults.contradiction,
    qualification: marketCandidateResults.qualification,
    warnings,
    consensus: {
      home: p.home,
      draw: p.draw,
      away: p.away,
      agreement,
      conflict,
      leader: top < 0.42 ? "none" : p.home === top ? "home" : p.draw === top ? "draw" : "away",
    },
    robustness,
    risk,
    aiReasoningPacket: {
      ...base.aiReasoningPacket,
      analysisVersion: "gfi-authoritative-v10-arrm",
      aiRole: "SINGLE_AUTHORITATIVE_EVIDENCE_WEIGHTED_ENGINE",
      adaptiveRecencyRegime: adaptiveEngine.values,
      adaptivePolicy:
        "ARRM: recency decay + regime shift + current-season/venue weighting + opponent-strength adjustment + Bayesian-style shrinkage.",
      confidenceDefinition:
        "Epistemic confidence is evidence/coverage/consensus quality; it is never equal to event probability.",
      teamSample,
      globalHistoricalRows: globalN,
      teamCoverage,
      globalCoverage,
      engineCoverage,
      quality,
      confidence,
      decision,
      finalPrediction: "",
      predictedScore,
      evidenceLedger: ledger,
      sparsePriorUsed: teamSample === 0,
      activeEngineFamilies: ACTIVE_ENGINE_FAMILIES,
      simulationIsIndependent: false,
      marketCandidates: marketCandidateResults.candidates,
      valueAnalysis: marketCandidateResults.valueAnalysis,
      contradictionAnalysis: marketCandidateResults.contradiction,
      qualification: marketCandidateResults.qualification,
    },
    deploymentFingerprint: {
      analysisVersion: "gfi-authoritative-v10-arrm",
      engineId: "gfi-ensemble-authoritative-v10-arrm",
      commitFingerprint: base.deploymentFingerprint?.commitFingerprint ?? "07085aebc",
      generatedAt: new Date().toISOString(),
    },
  };

  const actionable = deriveConsensusActionability(provisionalAnalysis);
  const finalPrediction =
    actionable.actionableMarket?.selection ??
    (decision === "INSUFFICIENT INTELLIGENCE"
      ? "INSUFFICIENT INTELLIGENCE"
      : decision === "HOME EDGE"
        ? `${base.home.team} win`
        : decision === "AWAY EDGE"
          ? `${base.away.team} win`
          : decision === "DRAW LEAN"
            ? "Draw"
            : candidates[0]?.label ?? "No strong prediction");

  return {
    ...provisionalAnalysis,
    qualification: actionable,
    finalPrediction,
    aiReasoningPacket: {
      ...provisionalAnalysis.aiReasoningPacket,
      finalPrediction,
      qualification: actionable,
    },
  };
}
