import { buildFeatures, type HistMatch, type TargetMatch } from "./features";
import { runEngineArena } from "./engines";
import { trainSoftmax } from "./ml";
import { simulateMatch } from "./simulate";
import { hashString } from "./math";
import {
  blendWithSimulation,
  buildVerdict,
  computeDataQuality,
  computeStability,
  detectConflicts,
  discoverOutcomes,
  ensembleEngines,
} from "./consensus";
import { buildEvidence } from "./evidence";
import type { ProviderHealth } from "./providers";
import type { AnalysisPayload } from "./types";

export const PIPELINE_STAGES = [
  "Resolving fixture",
  "Loading stored football data",
  "Checking connected providers",
  "Building features",
  "Training in-app model",
  "Running statistical engines",
  "Running machine-learning engine",
  "Running Monte Carlo simulation",
  "Comparing engines",
  "Detecting contradictions",
  "Assessing stability",
  "Scoring data quality",
  "Discovering strongest outcomes",
  "Writing immutable snapshot",
] as const;

export type AnalyzeOptions = { runs?: number; lambdaOverride?: { home: number; away: number } };

export function analyze(
  target: TargetMatch,
  history: HistMatch[],
  providers: ProviderHealth[],
  options: AnalyzeOptions = {},
): AnalysisPayload & { dataQualityComponents: { key: string; value: number; detail: string }[] } {
  const features = buildFeatures(target, history);
  const preCutoff = history.filter((m) => m.kickoff < target.kickoff && m.id !== target.id);
  const model = preCutoff.length >= 80 ? trainSoftmax(preCutoff) : null;

  const engines = runEngineArena(features, model);
  const ens = ensembleEngines(engines);
  const lambdas = options.lambdaOverride ?? ens.lambdas;

  const runs = options.runs ?? 50000;
  const seed = hashString(`${target.id}:${runs}:${lambdas.home.toFixed(3)}:${lambdas.away.toFixed(3)}`);
  const simulation = simulateMatch(lambdas.home, lambdas.away, runs, seed);

  const probabilities = blendWithSimulation(ens.markets, simulation.markets, 0.4);
  const conflicts = detectConflicts(engines);
  const stability = computeStability(lambdas, probabilities);
  const quality = computeDataQuality(features, engines);
  const evidence = buildEvidence(features, providers);

  const outcomes = discoverOutcomes(
    probabilities,
    ens.consensusByMarket,
    stability.byMarket,
    ens.engineCountByMarket,
    quality.score,
  );

  const activeEngines = engines.filter((e) => e.status === "OK").length;
  const consensusValues = Object.values(ens.consensusByMarket);
  const consensus = consensusValues.length
    ? consensusValues.reduce((a, b) => a + b, 0) / consensusValues.length
    : 0;

  const verdict = buildVerdict(outcomes, quality.score, stability.overall, conflicts, activeEngines);

  const inputsHash = hashString(
    JSON.stringify({
      t: target.id,
      k: target.kickoff,
      h: preCutoff.length,
      l: lambdas,
      e: engines.map((e) => [e.id, e.status, e.markets.home ?? null]),
    }),
  ).toString(16);

  const sourceHealth: Record<string, { status: string; detail: string }> = {};
  for (const p of providers) sourceHealth[p.id] = { status: p.status, detail: p.detail };

  return {
    matchId: target.id,
    version: `${new Date().toISOString().slice(0, 10)}-${inputsHash}`,
    inputsHash,
    createdAt: new Date().toISOString(),
    probabilities,
    consensusByMarket: ens.consensusByMarket,
    stabilityByMarket: stability.byMarket,
    dataQuality: quality.score,
    dataQualityComponents: quality.components,
    stability: stability.overall,
    consensus,
    engines,
    simulation,
    evidence,
    conflicts,
    outcomes,
    verdict,
    sourceHealth,
    lambdas,
    marketDivergence: null,
  };
}
