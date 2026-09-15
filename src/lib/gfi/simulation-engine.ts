import type { AuthoritativeMatchAnalysis, EngineOutput } from "./authoritative";

export type SimulationSummary = {
  iterations: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  expectedGoals: number;
  scenarioAgreement: number;
  topScores: { score: string; count: number; probability: number }[];
  sourceAnalysisVersion: string;
};

function makeSeed(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function poisson(lambda: number, random: () => number) {
  const target = random();
  let p = Math.exp(-lambda),
    cumulative = p,
    k = 0;
  while (target > cumulative && k < 12) {
    k += 1;
    p *= lambda / k;
    cumulative += p;
  }
  return k;
}

export function simulateGoalBaseline(
  lambdaHome: number,
  lambdaAway: number,
  seedKey: string,
  iterations = 10000,
) {
  const n = Math.max(1000, Math.min(iterations, 50000));
  const random = rng(makeSeed(`${seedKey}|${n}`));
  let homeWin = 0,
    draw = 0,
    awayWin = 0,
    over05 = 0,
    over15 = 0,
    over25 = 0,
    over35 = 0,
    btts = 0;
  const scores = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    const home = poisson(Math.max(0.05, lambdaHome), random);
    const away = poisson(Math.max(0.05, lambdaAway), random);
    const total = home + away;
    if (home > away) homeWin += 1;
    else if (home === away) draw += 1;
    else awayWin += 1;
    if (total >= 1) over05 += 1;
    if (total >= 2) over15 += 1;
    if (total >= 3) over25 += 1;
    if (total >= 4) over35 += 1;
    if (home > 0 && away > 0) btts += 1;
    const key = `${home}-${away}`;
    scores.set(key, (scores.get(key) ?? 0) + 1);
  }
  return {
    iterations: n,
    homeWin: homeWin / n,
    draw: draw / n,
    awayWin: awayWin / n,
    over05: over05 / n,
    over15: over15 / n,
    over25: over25 / n,
    over35: over35 / n,
    btts: btts / n,
    expectedGoals: Math.max(0.05, lambdaHome) + Math.max(0.05, lambdaAway),
    topScores: [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([score, count]) => ({ score, count, probability: count / n })),
  };
}

export function simulateAnalysis(
  analysis: AuthoritativeMatchAnalysis,
  iterations = 10000,
): SimulationSummary {
  const goal = analysis.engines.find((e) => e.id === "GOALS");
  const lambdaHome = Number(goal?.values.lambdaHome ?? 1.2);
  const lambdaAway = Number(goal?.values.lambdaAway ?? 1);
  const base = simulateGoalBaseline(lambdaHome, lambdaAway, analysis.fixtureId, iterations);
  const simulationMax = Math.max(base.homeWin, base.draw, base.awayWin);
  const authoritativeMax = Math.max(
    analysis.probabilities?.home ?? 0.33,
    analysis.probabilities?.draw ?? 0.34,
    analysis.probabilities?.away ?? 0.33,
  );
  const scenarioAgreement = Math.max(0, 1 - Math.abs(simulationMax - authoritativeMax) * 2);
  return { ...base, scenarioAgreement, sourceAnalysisVersion: analysis.analysisVersion };
}

export function simulationEngineOutput(
  analysis: AuthoritativeMatchAnalysis,
  iterations = 10000,
): { summary: SimulationSummary; engine: EngineOutput } {
  const summary = simulateAnalysis(analysis, iterations);
  const probabilities = { home: summary.homeWin, draw: summary.draw, away: summary.away };
  const winner = Math.max(probabilities.home, probabilities.draw, probabilities.away);
  const signal =
    summary.scenarioAgreement >= 0.8
      ? "SUPPORT"
      : summary.scenarioAgreement >= 0.6
        ? "NEUTRAL"
        : "CONTRADICTION";
  return {
    summary,
    engine: {
      id: "SIMULATION",
      name: "Scenario Simulation",
      version: "simulation-v1",
      signal,
      confidence: Math.round((0.5 + Math.abs(winner - 1 / 3) * 0.9) * 100),
      quality: 82,
      probabilities,
      values: {
        iterations: summary.iterations,
        over05: summary.over05,
        over15: summary.over15,
        over25: summary.over25,
        over35: summary.over35,
        btts: summary.btts,
        expectedGoals: summary.expectedGoals,
        scenarioAgreement: summary.scenarioAgreement,
      },
      evidence: [
        `Scenario engine simulated ${summary.iterations.toLocaleString()} deterministic seeded match worlds from the goal baseline.`,
        `Simulated outcome: H ${(summary.homeWin * 100).toFixed(1)}% · D ${(summary.draw * 100).toFixed(1)}% · A ${(summary.awayWin * 100).toFixed(1)}%.`,
        `Scenario agreement with the authoritative 1X2 surface: ${(summary.scenarioAgreement * 100).toFixed(1)}%.`,
      ],
      limitations: [
        "Simulation is downstream of the goal model, so it validates the current scoring assumptions rather than adding a wholly independent information source.",
      ],
    },
  };
}
