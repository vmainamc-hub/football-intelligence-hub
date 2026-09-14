import type { Features } from "./features";
import { COMPLEMENTS, marketsFromMatrix, scoreMatrix, stdev } from "./math";
import {
  MARKETS,
  MARKET_LABELS,
  type Conflict,
  type EngineOutput,
  type Market,
  type MarketSurface,
  type OutcomeCandidate,
  type Verdict,
} from "./types";

export type Ensemble = {
  markets: MarketSurface;
  consensusByMarket: Partial<Record<Market, number>>;
  engineCountByMarket: Partial<Record<Market, number>>;
  lambdas: { home: number; away: number };
};

export function ensembleEngines(engines: EngineOutput[]): Ensemble {
  const active = engines.filter((e) => e.status === "OK");
  const markets: MarketSurface = {};
  const consensusByMarket: Partial<Record<Market, number>> = {};
  const engineCountByMarket: Partial<Record<Market, number>> = {};

  for (const market of MARKETS) {
    const vals: number[] = [];
    const weights: number[] = [];
    for (const e of active) {
      const v = e.markets[market];
      if (typeof v === "number" && Number.isFinite(v)) {
        vals.push(v);
        weights.push(Math.max(0.05, e.weight * (0.5 + 0.5 * e.confidence)));
      }
    }
    if (!vals.length) continue;
    const wsum = weights.reduce((a, b) => a + b, 0);
    const value = vals.reduce((a, v, i) => a + v * weights[i]!, 0) / wsum;
    markets[market] = value;
    engineCountByMarket[market] = vals.length;
    // consensus = 1 when engines are tight, 0 when they are 0.35+ apart
    consensusByMarket[market] = Math.max(0, Math.min(1, 1 - stdev(vals) / 0.18));
  }

  normalise(markets);

  const lambdaSources = active.filter((e) => e.lambdas);
  const lw = lambdaSources.reduce((a, e) => a + e.weight, 0) || 1;
  const lambdas = {
    home: lambdaSources.reduce((a, e) => a + e.lambdas!.home * e.weight, 0) / lw || 1.35,
    away: lambdaSources.reduce((a, e) => a + e.lambdas!.away * e.weight, 0) / lw || 1.15,
  };

  return { markets, consensusByMarket, engineCountByMarket, lambdas };
}

export function normalise(m: MarketSurface) {
  const sum = (m.home ?? 0) + (m.draw ?? 0) + (m.away ?? 0);
  if (sum > 0) {
    m.home = (m.home ?? 0) / sum;
    m.draw = (m.draw ?? 0) / sum;
    m.away = (m.away ?? 0) / sum;
    m.dc1x = m.home + m.draw;
    m.dcx2 = m.away + m.draw;
    m.dc12 = m.home + m.away;
  }
  for (const [a, b] of COMPLEMENTS) {
    const va = m[a];
    if (typeof va === "number") m[b] = 1 - va;
  }
}

export function blendWithSimulation(
  ens: MarketSurface,
  sim: MarketSurface,
  wSim = 0.4,
): MarketSurface {
  const out: MarketSurface = {};
  for (const market of MARKETS) {
    const a = ens[market];
    const b = sim[market];
    if (typeof a === "number" && typeof b === "number") out[market] = a * (1 - wSim) + b * wSim;
    else if (typeof a === "number") out[market] = a;
    else if (typeof b === "number") out[market] = b;
  }
  normalise(out);
  return out;
}

export function detectConflicts(engines: EngineOutput[]): Conflict[] {
  const active = engines.filter((e) => e.status === "OK");
  const conflicts: Conflict[] = [];
  for (const market of MARKETS) {
    const pts = active
      .map((e) => ({ engine: e.name, probability: e.markets[market] }))
      .filter(
        (p): p is { engine: string; probability: number } => typeof p.probability === "number",
      );
    if (pts.length < 3) continue;
    const values = pts.map((p) => p.probability);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread < 0.16) continue;
    const severity = spread >= 0.32 ? "SEVERE" : spread >= 0.24 ? "MATERIAL" : "MINOR";
    const sorted = [...pts].sort((a, b) => b.probability - a.probability);
    conflicts.push({
      market,
      spread,
      severity,
      leaning: sorted,
      explanation: `${sorted[0]!.engine} reads ${MARKET_LABELS[market]} at ${(sorted[0]!.probability * 100).toFixed(0)}% while ${sorted[sorted.length - 1]!.engine} reads ${(sorted[sorted.length - 1]!.probability * 100).toFixed(0)}%. The gap is driven by which history each engine weights: venue splits, recency or long-run strength.`,
    });
  }
  return conflicts.sort((a, b) => b.spread - a.spread).slice(0, 8);
}

/** Re-price under perturbed assumptions and measure how far each market moves. */
export function computeStability(
  lambdas: { home: number; away: number },
  base: MarketSurface,
): { overall: number; byMarket: Partial<Record<Market, number>> } {
  const perturbations: [number, number][] = [
    [1.12, 1],
    [0.88, 1],
    [1, 1.12],
    [1, 0.88],
    [1.1, 0.9],
    [0.9, 1.1],
  ];
  const surfaces = perturbations.map(([ph, pa]) =>
    marketsFromMatrix(scoreMatrix(lambdas.home * ph, lambdas.away * pa, { rho: -0.05 })),
  );
  const byMarket: Partial<Record<Market, number>> = {};
  const scores: number[] = [];
  for (const market of MARKETS) {
    const b = base[market];
    if (typeof b !== "number") continue;
    const devs = surfaces
      .map((s) => s[market])
      .filter((v): v is number => typeof v === "number")
      .map((v) => Math.abs(v - b));
    if (!devs.length) continue;
    const worst = Math.max(...devs);
    const stability = Math.max(0, Math.min(1, 1 - worst / 0.2));
    byMarket[market] = stability;
    scores.push(stability);
  }
  return {
    overall: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    byMarket,
  };
}

export function computeDataQuality(f: Features, engines: EngineOutput[]) {
  const components = [
    {
      key: "Team history depth",
      value: Math.min(1, Math.min(f.home.overall.played, f.away.overall.played) / 18),
      detail: `${f.home.overall.played} / ${f.away.overall.played} stored results`,
    },
    {
      key: "Venue-specific history",
      value: Math.min(1, Math.min(f.home.home.played, f.away.away.played) / 9),
      detail: `${f.home.home.played} home / ${f.away.away.played} away`,
    },
    {
      key: "League baseline",
      value: Math.min(1, f.league.matches / 300),
      detail: `${f.league.matches} matches in baseline`,
    },
    {
      key: "Head-to-head",
      value: Math.min(1, f.h2h.matches.length / 5),
      detail: `${f.h2h.matches.length} meetings`,
    },
    {
      key: "Engine coverage",
      value: engines.filter((e) => e.status === "OK").length / engines.length,
      detail: `${engines.filter((e) => e.status === "OK").length} of ${engines.length} engines live`,
    },
    {
      key: "Lineups & injuries",
      value: 0,
      detail: "DATA SOURCE UNAVAILABLE — no provider connected",
    },
    { key: "xG feed", value: 0, detail: "DATA SOURCE UNAVAILABLE — no provider connected" },
    { key: "Market odds", value: 0, detail: "NOT CONFIGURED — no odds provider connected" },
  ];
  const weights = [0.24, 0.16, 0.12, 0.06, 0.18, 0.1, 0.08, 0.06];
  const score = components.reduce((a, c, i) => a + c.value * weights[i]!, 0);
  return { score, components };
}

export function discoverOutcomes(
  markets: MarketSurface,
  consensusByMarket: Partial<Record<Market, number>>,
  stabilityByMarket: Partial<Record<Market, number>>,
  engineCountByMarket: Partial<Record<Market, number>>,
  dataQuality: number,
): OutcomeCandidate[] {
  const out: OutcomeCandidate[] = [];
  for (const market of MARKETS) {
    const p = markets[market];
    if (typeof p !== "number") continue;
    const consensus = consensusByMarket[market] ?? 0.4;
    const stability = stabilityByMarket[market] ?? 0.4;
    const engineCount = engineCountByMarket[market] ?? 0;
    // Reward probability, but only when independent engines agree and the
    // answer survives perturbation. Near-certain markets (over 0.5) are
    // deliberately not rewarded for being trivially likely.
    const informative = 1 - Math.abs(p - 0.72) / 0.72;
    const score =
      p * 0.42 +
      consensus * 0.22 +
      stability * 0.2 +
      dataQuality * 0.1 +
      Math.max(0, informative) * 0.06;
    out.push({
      market,
      label: MARKET_LABELS[market],
      probability: p,
      consensus,
      stability,
      dataQuality,
      engineCount,
      fairOdds: p > 0 ? 1 / p : 0,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function buildVerdict(
  outcomes: OutcomeCandidate[],
  dataQuality: number,
  stability: number,
  conflicts: Conflict[],
  activeEngines: number,
): Verdict {
  const best = outcomes[0];
  if (activeEngines < 3 || !best) {
    return {
      kind: "INSUFFICIENT_INTELLIGENCE",
      headline: "INSUFFICIENT INTELLIGENCE",
      detail:
        "Too few independent engines could run on the stored evidence. No prediction is issued.",
    };
  }
  if (dataQuality < 0.32) {
    return {
      kind: "DATA_QUALITY_TOO_LOW",
      headline: "DATA QUALITY TOO LOW",
      detail: `Underlying evidence scores ${(dataQuality * 100).toFixed(0)}%. The system will not issue a prediction on this basis.`,
    };
  }
  if (conflicts.some((c) => c.severity === "SEVERE") && stability < 0.62) {
    return {
      kind: "HIGH_MODEL_CONFLICT",
      headline: "HIGH MODEL CONFLICT",
      detail:
        "Independent engines disagree severely and the surface is unstable. Review the contradiction panel before acting.",
      outcome: best,
    };
  }
  if (best.probability < 0.6 || best.consensus < 0.45 || best.stability < 0.5) {
    return {
      kind: "NO_STRONG_EDGE",
      headline: "NO STRONG EDGE",
      detail:
        "Nothing in the outcome space clears the strength, consensus and stability thresholds. The honest answer is that this match is not readable from the available evidence.",
      outcome: best,
    };
  }
  return {
    kind: "STRONGEST_OUTCOME",
    headline: `STRONGEST OUTCOME — ${best.label.toUpperCase()}`,
    detail: `${(best.probability * 100).toFixed(1)}% modelled probability, ${(best.consensus * 100).toFixed(0)}% engine consensus across ${best.engineCount} engines, ${(best.stability * 100).toFixed(0)}% stability under perturbed assumptions.`,
    outcome: best,
  };
}
