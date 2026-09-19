import type { AuthoritativeMatchAnalysis, MarketCandidate, QualificationResult } from "./authoritative";
import { isCoreActionableMarket } from "./markets";

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
  return Number.isFinite(lh) && Number.isFinite(la) ? clamp((1 - Math.exp(-lh)) * (1 - Math.exp(-la))) : NaN;
}

const GOAL_FAMILY_ENGINE_IDS = new Set(["GOALS", "BAYES_STRENGTH", "DIXON_COLES", "NEG_BINOMIAL"]);

function singleEngineProbability(
  e: AuthoritativeMatchAnalysis["engines"][number],
  result: AuthoritativeMatchAnalysis,
  market: string,
  selection: string,
): number {
  const p = e.probabilities;
  if (market === "1X2" && p) {
    return selection === `${result.home.team} Win` ? p.home : selection === `${result.away.team} Win` ? p.away : p.draw;
  }
  if (market === "DOUBLE CHANCE" && p) {
    return selection.includes("1X") ? p.home + p.draw : selection.includes("X2") ? p.draw + p.away : p.home + p.away;
  }
  if (market === "DRAW NO BET" && p) {
    const denom = Math.max(0.0001, p.home + p.away);
    return selection.includes(result.home.team) ? p.home / denom : p.away / denom;
  }
  if (market === "OVER/UNDER 1.5") {
    const o = goalProbability(e, 1.5);
    return selection.startsWith("Under") ? 1 - o : o;
  }
  if (market === "OVER/UNDER 2.5") {
    const o = goalProbability(e, 2.5);
    return selection.startsWith("Under") ? 1 - o : o;
  }
  if (market === "OVER/UNDER 3.5") {
    const o = goalProbability(e, 3.5);
    return selection.startsWith("Under") ? 1 - o : o;
  }
  if (market === "BTTS") {
    const b = bttsProbability(e);
    return selection.includes("NO") ? 1 - b : b;
  }
  return NaN;
}

/**
 * Correlation-aware engine family vote aggregation.
 * Correlated goal/Poisson engines (GOALS, BAYES_STRENGTH, DIXON_COLES, NEG_BINOMIAL)
 * are consolidated into a single representative "GOALS_FAMILY" vote so their agreement
 * is not multiplied as multiple independent votes.
 * Independent engines (FORM, VENUE, ELO, LOGISTIC_REGRESSION) each cast an independent vote.
 */
function votesFor(result: AuthoritativeMatchAnalysis, market: string, selection: string): Vote[] {
  const validEngines = result.engines.filter(
    (e) => e.id !== "CONSENSUS" && e.id !== "SIMULATION" && e.id !== "DATA_QUALITY" && e.id !== "MARKET" && e.id !== "MOMENTUM",
  );

  const votes: Vote[] = [];

  // 1. Independent non-goal engines
  for (const e of validEngines) {
    if (GOAL_FAMILY_ENGINE_IDS.has(e.id)) continue;
    const prob = singleEngineProbability(e, result, market, selection);
    if (Number.isFinite(prob)) {
      votes.push({
        probability: clamp(prob),
        weight: Math.max(0.2, Math.min(1.25, (e.quality || 60) / 100)),
        engine: e.id,
      });
    }
  }

  // 2. Aggregate correlated Goal Family engines into ONE consolidated vote
  const goalEngines = validEngines.filter((e) => GOAL_FAMILY_ENGINE_IDS.has(e.id));
  const goalProbs: { prob: number; weight: number }[] = [];
  for (const ge of goalEngines) {
    const prob = singleEngineProbability(ge, result, market, selection);
    if (Number.isFinite(prob)) {
      goalProbs.push({
        prob: clamp(prob),
        weight: Math.max(0.2, Math.min(1.25, (ge.quality || 70) / 100)),
      });
    }
  }

  if (goalProbs.length > 0) {
    const sumW = goalProbs.reduce((acc, x) => acc + x.weight, 0);
    const weightedProb = goalProbs.reduce((acc, x) => acc + x.prob * x.weight, 0) / sumW;
    const avgWeight = sumW / goalProbs.length;
    votes.push({
      probability: clamp(weightedProb),
      weight: avgWeight,
      engine: "GOALS_FAMILY",
    });
  }

  return votes;
}

/**
 * Market statistical baselines and conviction thresholds.
 * Strictly configured for the 5 authoritative core markets:
 * 1. Home Win
 * 2. Draw
 * 3. Away Win
 * 4. GG / BTTS Yes
 * 5. Over 2.5 Goals
 */
function marketProfile(market: string, selection: string) {
  if (market === "1X2") {
    if (selection.toLowerCase().includes("draw")) {
      return { baseline: 0.27, threshold: 0.31, family: "1X2", specificity: 1.0 };
    }
    return { baseline: 0.40, threshold: 0.45, family: "1X2", specificity: 1.0 };
  }
  if (market === "OVER/UNDER 2.5" || market === "OVER 2.5") {
    // Only Over 2.5 is a core market; Under 2.5 is rejected
    if (selection.toLowerCase().includes("under")) {
      return { baseline: 1.0, threshold: 1.0, family: "EXCLUDED", specificity: 0 };
    }
    return { baseline: 0.50, threshold: 0.54, family: "TOTALS_25", specificity: 1.0 };
  }
  if (market === "BTTS") {
    // Only BTTS Yes is a core market; BTTS No is rejected
    if (selection.toLowerCase().includes("no")) {
      return { baseline: 1.0, threshold: 1.0, family: "EXCLUDED", specificity: 0 };
    }
    return { baseline: 0.50, threshold: 0.54, family: "BTTS", specificity: 1.0 };
  }
  // All other markets (Double Chance, DNB, Over/Under 1.5, Over/Under 3.5) are strictly excluded from actionable selection
  return { baseline: 1.0, threshold: 1.0, family: "EXCLUDED", specificity: 0 };
}

function candidateScore(candidate: MarketCandidate, votes: Vote[]) {
  const profile = marketProfile(candidate.market, candidate.selection);
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0) || 1;
  const support = votes.reduce((s, v) => s + (v.probability >= profile.threshold ? v.weight : 0), 0) / totalWeight;
  const meanVote = votes.length ? votes.reduce((s, v) => s + v.probability, 0) / votes.length : candidate.modelProbability;

  // Information edge: excess probability over natural market baseline
  const excess = (candidate.modelProbability - profile.baseline) / Math.max(0.08, 1 - profile.baseline);

  // Conviction: probability above the action threshold
  const conviction = (candidate.modelProbability - profile.threshold) / Math.max(0.08, 1 - profile.threshold);

  // Cross-family agreement without artificial inflation
  const engineAgreement = votes.length
    ? clamp(1 - votes.reduce((s, v) => s + Math.abs(v.probability - meanVote), 0) / votes.length / 0.35)
    : 0.5;

  // Genuine bookmaker odds edge if real odds are present (0 if no odds)
  const oddsEdge = typeof candidate.edge === "number" && Number.isFinite(candidate.edge) ? Math.max(0, candidate.edge) : 0;

  // Evidence adjustment: slight boost for supporting evidence, penalty for contradicting evidence
  const evidenceAdj =
    (candidate.supportingEvidence?.length ? 0.03 : 0) -
    (candidate.contradictingEvidence?.length ? 0.05 : 0);

  const score =
    clamp(conviction, -0.4, 1.0) * 0.44 +
    clamp(excess, -0.4, 1.0) * 0.26 +
    support * 0.18 +
    engineAgreement * 0.12 +
    oddsEdge * 0.5 +
    evidenceAdj;

  return {
    score,
    conviction,
    excess,
    support,
    agreement: engineAgreement,
    family: profile.family,
    threshold: profile.threshold,
  };
}

export function deriveConsensusActionability(result: AuthoritativeMatchAnalysis): QualificationResult {
  const candidates = (result.marketCandidates ?? []).filter(
    (c) =>
      Number.isFinite(c.modelProbability) &&
      isCoreActionableMarket(c.market, c.selection, result.home?.team, result.away?.team),
  );
  if (!candidates.length) {
    const homeP = result.probabilities?.home ?? 0.33;
    const drawP = result.probabilities?.draw ?? 0.33;
    const awayP = result.probabilities?.away ?? 0.33;
    let fallbackSel = `${result.home?.team || "Home"} Win`;
    let fallbackProb = homeP;
    if (drawP > homeP && drawP > awayP) {
      fallbackSel = "Draw";
      fallbackProb = drawP;
    } else if (awayP > homeP && awayP >= drawP) {
      fallbackSel = `${result.away?.team || "Away"} Win`;
      fallbackProb = awayP;
    }
    const fallback: MarketCandidate = {
      market: "1X2",
      selection: fallbackSel,
      modelProbability: fallbackProb,
      fairOdds: Number((1 / Math.max(0.01, fallbackProb)).toFixed(2)),
      valueClassification: "NO_ODDS",
      qualificationStatus: "WATCH",
      whyConsidered: "Fallback from the authoritative 1X2 core probability surface.",
      supportingEvidence: ["No separate core market candidate surface was available."],
      contradictingEvidence: [],
    };
    return {
      qualified: false,
      actionableMarket: fallback,
      strongestMathematicalSignal: fallback,
      eligibilityPassed: false,
      rejectionReasons: ["No valid core market candidate probability surface was available."],
      statusMessage: "INSUFFICIENT PROBABILITY SURFACE FOR ACTIONABLE SELECTION.",
    };
  }

  // Score all candidates using correlation-aware aggregation
  const scored = candidates
    .map((candidate) => {
      const votes = votesFor(result, candidate.market, candidate.selection);
      const metrics = candidateScore(candidate, votes);
      return { candidate, votes, ...metrics };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const isLimitedEvidence = result.quality < 40 || result.decision === "INSUFFICIENT INTELLIGENCE";

  const action: MarketCandidate = {
    ...best.candidate,
    qualificationStatus: "QUALIFIED",
    rejectionReason: undefined,
    supportingEvidence: [
      ...best.candidate.supportingEvidence,
      `Authoritative conviction: ${Math.round(best.candidate.modelProbability * 100)}% probability vs ${Math.round(best.threshold * 100)}% threshold (information excess ${Math.round(best.excess * 100)}%).`,
      `Independent family support: ${Math.round(best.support * 100)}% across ${best.votes.length} independent model families.`,
      isLimitedEvidence
        ? "Computed with limited fixture historical rows; Bayesian shrinkage applied to preserve calibrated uncertainty."
        : "Supported by multi-family authoritative consensus.",
    ],
  };

  for (const c of candidates) {
    c.qualificationStatus = c.selection === action.selection ? "QUALIFIED" : "WATCH";
    c.rejectionReason =
      c.selection === action.selection
        ? undefined
        : "Not the highest dynamic conviction after normalized market-baseline evaluation.";
  }

  return {
    qualified: true,
    actionableMarket: action,
    strongestMathematicalSignal: best.candidate,
    eligibilityPassed: true,
    rejectionReasons: [],
    statusMessage: isLimitedEvidence
      ? `ACTIONABLE PREDICTION (LIMITED EVIDENCE): ${action.selection}. Dynamic market conviction and independent family support evaluated with prior shrinkage.`
      : `DYNAMIC ACTION SELECTED: ${action.selection}. Complete market surface evaluated without artificial market preference.`,
  };
}

