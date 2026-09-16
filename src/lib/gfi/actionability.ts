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
    (e) => e.id !== "CONSENSUS" && e.id !== "SIMULATION" && e.id !== "DATA_QUALITY" && e.probabilities,
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

function candidateScore(candidate: MarketCandidate, votes: Vote[]) {
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0) || 1;
  const support = votes.reduce((s, v) => s + (v.probability >= 0.5 ? v.weight : 0), 0) / totalWeight;
  const directional = clamp((candidate.modelProbability - 0.5) * 2);
  const specificity = candidate.market === "OVER/UNDER 3.5" || candidate.market === "OVER/UNDER 1.5" ? 0.78 : candidate.market === "DRAW NO BET" ? 0.86 : candidate.market === "DOUBLE CHANCE" ? 0.92 : 1;
  return directional * 0.45 + support * 0.4 + specificity * 0.15;
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
      qualificationStatus: "WATCH",
      whyConsidered: "Fallback from the authoritative 1X2 probability surface.",
      supportingEvidence: [],
      contradictingEvidence: [],
    };
    return {
      qualified: true,
      actionableMarket: fallback,
      strongestMathematicalSignal: fallback,
      eligibilityPassed: true,
      rejectionReasons: [],
      statusMessage: "ACTIONABLE PREDICTION SELECTED FROM AUTHORITATIVE ENGINE CONSENSUS.",
    };
  }

  const scored = candidates.map((candidate) => {
    const votes = votesFor(result, candidate.market, candidate.selection);
    const score = candidateScore(candidate, votes);
    const supportWeight = votes.reduce((s, v) => s + v.weight, 0) || 1;
    const support = votes.reduce((s, v) => s + (v.probability >= 0.5 ? v.weight : 0), 0) / supportWeight;
    const agreement = votes.length ? votes.reduce((s, v) => s + Math.abs(v.probability - candidate.modelProbability), 0) / votes.length : 1;
    return { candidate, score, support, agreement, votes };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const action: MarketCandidate = {
    ...best.candidate,
    qualificationStatus: "QUALIFIED",
    rejectionReason: undefined,
    supportingEvidence: [
      ...best.candidate.supportingEvidence,
      `Cross-engine support: ${Math.round(best.support * 100)}% weighted support across ${best.votes.length} probability-producing engine families.`,
      `Authoritative model probability: ${Math.round(best.candidate.modelProbability * 100)}%.`,
    ],
  };

  for (const c of candidates) {
    c.qualificationStatus = c.selection === action.selection ? "QUALIFIED" : "WATCH";
    c.rejectionReason = c.selection === action.selection ? undefined : "Not the highest cross-engine actionable consensus.";
  }

  return {
    qualified: true,
    actionableMarket: action,
    strongestMathematicalSignal: best.candidate,
    eligibilityPassed: true,
    rejectionReasons: [],
    statusMessage: `ACTIONABLE PREDICTION SELECTED: ${action.selection}. Consensus support ${Math.round(best.support * 100)}% across ${best.votes.length} engine families; this is not a lowest-odds/safest-market selector.`,
  };
}
