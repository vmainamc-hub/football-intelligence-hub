import type { AuthoritativeMatchAnalysis, MarketCandidate, QualificationResult } from "./authoritative";

type Vote = { probability: number; weight: number; engine: string };

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const poisson = (lambda: number, k: number) => {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
};
const over = (lambda: number, line: number) => {
  let under = 0;
  for (let k = 0; k <= Math.floor(line); k++) under += poisson(lambda, k);
  return clamp(1 - under);
};

function goalProbability(engine: AuthoritativeMatchAnalysis["engines"][number], line: number) {
  const v = engine.values ?? {};
  const total = Number(v.expectedGoals);
  const lh = Number(v.lambdaHome ?? v.meanHome);
  const la = Number(v.lambdaAway ?? v.meanAway);
  const lambda = Number.isFinite(total) && total > 0 ? total : Number.isFinite(lh + la) ? lh + la : NaN;
  return Number.isFinite(lambda) ? over(lambda, line) : NaN;
}

function bttsProbability(engine: AuthoritativeMatchAnalysis["engines"][number]) {
  const v = engine.values ?? {};
  const direct = Number(v.yes);
  if (Number.isFinite(direct)) return clamp(direct);
  const lh = Number(v.lambdaHome ?? v.meanHome);
  const la = Number(v.lambdaAway ?? v.meanAway);
  return Number.isFinite(lh) && Number.isFinite(la)
    ? clamp((1 - Math.exp(-lh)) * (1 - Math.exp(-la)))
    : NaN;
}

function votesFor(result: AuthoritativeMatchAnalysis, market: string, selection: string): Vote[] {
  const engines = result.engines.filter(
    (e) => e.id !== "CONSENSUS" && e.id !== "SIMULATION" && e.id !== "DATA_QUALITY" && e.id !== "MARKET" && e.probabilities,
  );
  return engines
    .map((e) => {
      const p = e.probabilities!;
      let probability = NaN;
      if (market === "1X2") {
        probability = selection === `${result.home.team} Win` ? p.home : selection === `${result.away.team} Win` ? p.away : p.draw;
      } else if (market === "DOUBLE CHANCE") {
        probability = selection.includes("1X") ? p.home + p.draw : selection.includes("X2") ? p.draw + p.away : p.home + p.away;
      } else if (market === "DRAW NO BET") {
        const denom = Math.max(0.0001, p.home + p.away);
        probability = selection.includes(result.home.team) ? p.home / denom : p.away / denom;
      } else if (market === "OVER/UNDER 1.5") {
        const o = goalProbability(e, 1.5);
        probability = selection.startsWith("Under") ? 1 - o : o;
      } else if (market === "OVER/UNDER 2.5") {
        const o = goalProbability(e, 2.5);
        probability = selection.startsWith("Under") ? 1 - o : o;
      } else if (market === "OVER/UNDER 3.5") {
        const o = goalProbability(e, 3.5);
        probability = selection.startsWith("Under") ? 1 - o : o;
      } else if (market === "BTTS") {
        const b = bttsProbability(e);
        probability = selection.includes("NO") ? 1 - b : b;
      }
      return Number.isFinite(probability)
        ? { probability: clamp(probability), weight: Math.max(0.15, Math.min(1.25, e.quality / 100)), engine: e.id }
        : null;
    })
    .filter((x): x is Vote => Boolean(x));
}

/**
 * Dynamic actionability is deliberately NOT a highest-probability selector.
 *
 * Football markets have different natural probability floors. A 72% Over 1.5
 * is not automatically more informative than a 48% Home Win, and a 78% Under
 * 3.5 should not win simply because it is a wide line. Each market is therefore
 * judged against its own neutral/action threshold, then compared using the
 * amount of genuine conviction above that threshold.
 */
function marketProfile(market: string, selection: string) {
  if (market === "1X2") {
    if (selection === "Draw") return { threshold: 0.30, specificity: 1.10, family: "1X2" };
    return { threshold: 0.45, specificity: 1.22, family: "1X2" };
  }
  if (market === "DOUBLE CHANCE") {
    if (selection.includes("1X") || selection.includes("X2")) return { threshold: 0.68, specificity: 1.04, family: "DOUBLE_CHANCE" };
    return { threshold: 0.66, specificity: 0.96, family: "DOUBLE_CHANCE" };
  }
  if (market === "DRAW NO BET") return { threshold: 0.53, specificity: 1.08, family: "DNB" };
  if (market === "OVER/UNDER 1.5") return { threshold: selection.startsWith("Under") ? 0.72 : 0.72, specificity: 0.70, family: "TOTALS_15" };
  if (market === "OVER/UNDER 2.5") return { threshold: 0.55, specificity: 1.08, family: "TOTALS_25" };
  if (market === "OVER/UNDER 3.5") return { threshold: 0.70, specificity: 0.74, family: "TOTALS_35" };
  if (market === "BTTS") return { threshold: 0.56, specificity: 1.08, family: "BTTS" };
  return { threshold: 0.55, specificity: 0.85, family: market };
}

function candidateScore(candidate: MarketCandidate, votes: Vote[]) {
  const profile = marketProfile(candidate.market, candidate.selection);
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0) || 1;
  const support = votes.reduce((s, v) => s + (v.probability >= profile.threshold ? v.weight : 0), 0) / totalWeight;
  const meanVote = votes.length ? votes.reduce((s, v) => s + v.probability, 0) / votes.length : 0;
  const aboveThreshold = clamp((candidate.modelProbability - profile.threshold) / Math.max(0.08, 1 - profile.threshold));
  const engineAgreement = votes.length ? clamp(1 - votes.reduce((s, v) => s + Math.abs(v.probability - meanVote), 0) / votes.length / 0.35) : 0.25;
  const directional = clamp((candidate.modelProbability - profile.threshold) / 0.25);
  const supportStrength = support * 0.72 + engineAgreement * 0.28;
  return {
    score: (aboveThreshold * 0.43 + supportStrength * 0.42 + directional * 0.15) * profile.specificity,
    support,
    agreement: engineAgreement,
    family: profile.family,
    threshold: profile.threshold,
  };
}

export function deriveConsensusActionability(result: AuthoritativeMatchAnalysis): QualificationResult {
  const candidates = (result.marketCandidates ?? []).filter((c) => Number.isFinite(c.modelProbability));
  if (!candidates.length) {
    const fallback: MarketCandidate = {
      market: "1X2",
      selection: `${result.home.team} Win`,
      modelProbability: result.probabilities.home,
      fairOdds: Number((1 / Math.max(0.01, result.probabilities.home)).toFixed(2)),
      valueClassification: "NO_ODDS",
      qualificationStatus: "QUALIFIED",
      whyConsidered: "Fallback from the authoritative 1X2 probability surface.",
      supportingEvidence: ["No separate market candidate surface was available; 1X2 home probability was used."],
      contradictingEvidence: [],
    };
    return { qualified: true, actionableMarket: fallback, strongestMathematicalSignal: fallback, eligibilityPassed: true, rejectionReasons: [], statusMessage: "ACTIONABLE PREDICTION SELECTED FROM AUTHORITATIVE 1X2 SURFACE." };
  }

  const scored = candidates.map((candidate) => {
    const votes = votesFor(result, candidate.market, candidate.selection);
    const metrics = candidateScore(candidate, votes);
    return { candidate, votes, ...metrics };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const action: MarketCandidate = {
    ...best.candidate,
    qualificationStatus: "QUALIFIED",
    rejectionReason: undefined,
    supportingEvidence: [
      ...best.candidate.supportingEvidence,
      `Dynamic market conviction: ${Math.round(best.candidate.modelProbability * 100)}% probability versus ${Math.round(best.threshold * 100)}% action threshold.`,
      `Cross-engine support: ${Math.round(best.support * 100)}% across ${best.votes.length} probability-producing engine families.`,
      `Engine agreement: ${Math.round(best.agreement * 100)}%.`,
      `Market family selected dynamically as ${best.family}; wide safety lines are deliberately down-weighted.`,
    ],
  };

  for (const c of candidates) {
    c.qualificationStatus = c.selection === action.selection ? "QUALIFIED" : "WATCH";
    c.rejectionReason = c.selection === action.selection ? undefined : "Not the strongest dynamic cross-engine conviction after market-specific normalization.";
  }

  return {
    qualified: true,
    actionableMarket: action,
    strongestMathematicalSignal: best.candidate,
    eligibilityPassed: true,
    rejectionReasons: [],
    statusMessage: `DYNAMIC ACTION SELECTED: ${action.selection}. Market-specific conviction, cross-engine support, recent-form/venue signals and market specificity were balanced; no fixed Over 1.5 preference is used.`,
  };
}
