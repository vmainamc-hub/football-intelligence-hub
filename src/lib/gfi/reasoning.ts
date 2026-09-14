import type { IntelligenceResult, MatchRow } from "./intelligence";

export type ReasoningClaim = {
  id: string;
  signal: "SUPPORT" | "CONTRADICTION" | "LIMITATION";
  statement: string;
  evidence: string;
  strength: number;
};

export type MatchReasoning = {
  headline: string;
  decision: "HOME EDGE" | "DRAW LEAN" | "AWAY EDGE" | "NO STRONG EDGE" | "INSUFFICIENT INTELLIGENCE" | "HIGH MODEL CONFLICT";
  summary: string;
  claims: ReasoningClaim[];
  questionsForNextLayer: string[];
  aiReadyContext: Record<string, unknown>;
};

/**
 * Deterministic reasoning layer. This is deliberately separate from the UI and
 * from the numerical engines so an optional LLM can later consume the exact
 * same evidence packet without becoming the source of truth.
 */
export function buildMatchReasoning(fixture: MatchRow, result: IntelligenceResult): MatchReasoning {
  const { home, away, probabilities } = result;
  const top = Math.max(probabilities.home, probabilities.draw, probabilities.away);
  const spread = Math.max(probabilities.home, probabilities.draw, probabilities.away) - Math.min(probabilities.home, probabilities.draw, probabilities.away);
  const claims: ReasoningClaim[] = [];

  if (probabilities.home >= 0.5) {
    claims.push({ id: "home-probability", signal: "SUPPORT", statement: `${home.team} has the strongest 1X2 probability in the current model.`, evidence: `${Math.round(probabilities.home * 100)}% home win probability.`, strength: probabilities.home });
  } else if (probabilities.away >= 0.5) {
    claims.push({ id: "away-probability", signal: "SUPPORT", statement: `${away.team} has the strongest 1X2 probability in the current model.`, evidence: `${Math.round(probabilities.away * 100)}% away win probability.`, strength: probabilities.away });
  } else {
    claims.push({ id: "no-dominant-result", signal: "CONTRADICTION", statement: "No 1X2 outcome reaches a dominant probability threshold.", evidence: `H ${Math.round(probabilities.home * 100)}% · D ${Math.round(probabilities.draw * 100)}% · A ${Math.round(probabilities.away * 100)}%.`, strength: 1 - top });
  }

  const homePpg = home.points / Math.max(1, home.played);
  const awayPpg = away.points / Math.max(1, away.played);
  if (Math.abs(homePpg - awayPpg) >= 0.55) {
    const stronger = homePpg > awayPpg ? home.team : away.team;
    claims.push({ id: "points-gap", signal: "SUPPORT", statement: `${stronger} has the clearer recent points-rate advantage.`, evidence: `${home.team} ${homePpg.toFixed(2)} PPG vs ${away.team} ${awayPpg.toFixed(2)} PPG.`, strength: Math.min(1, Math.abs(homePpg - awayPpg) / 1.5) });
  } else {
    claims.push({ id: "points-balance", signal: "CONTRADICTION", statement: "Recent points rates are relatively close, limiting separation between the teams.", evidence: `${home.team} ${homePpg.toFixed(2)} PPG vs ${away.team} ${awayPpg.toFixed(2)} PPG.`, strength: 0.55 });
  }

  const over25 = result.totals.over2.5 ?? 0;
  if (over25 >= 0.58) {
    claims.push({ id: "goals", signal: "SUPPORT", statement: "The goal-rate engine leans toward an open match.", evidence: `Over 2.5 probability ${Math.round(over25 * 100)}%.`, strength: over25 });
  } else if (over25 <= 0.42) {
    claims.push({ id: "goals", signal: "SUPPORT", statement: "The goal-rate engine leans toward a lower-scoring match.", evidence: `Over 2.5 probability ${Math.round(over25 * 100)}%.`, strength: 1 - over25 });
  } else {
    claims.push({ id: "goals-uncertain", signal: "LIMITATION", statement: "The total-goals engine does not have a strong 2.5-goal edge.", evidence: `Over 2.5 probability ${Math.round(over25 * 100)}%.`, strength: 0.45 });
  }

  const missing = result.warnings.some((w) => w.includes("odds, injuries, lineups or xG"));
  if (missing) {
    claims.push({ id: "missing-intelligence", signal: "LIMITATION", statement: "The decision is incomplete without market, squad and advanced-event intelligence.", evidence: "FREE MODE currently has no bookmaker odds, injuries, lineups or xG provider attached.", strength: 1 });
  }

  let decision: MatchReasoning["decision"] = "NO STRONG EDGE";
  if (result.quality < 40 || home.played + away.played < 8) decision = "INSUFFICIENT INTELLIGENCE";
  else if (spread < 0.10 && top < 0.52) decision = "HIGH MODEL CONFLICT";
  else if (probabilities.home === top && top >= 0.52) decision = "HOME EDGE";
  else if (probabilities.away === top && top >= 0.52) decision = "AWAY EDGE";
  else if (probabilities.draw === top && top >= 0.40) decision = "DRAW LEAN";

  const summary = decision === "HOME EDGE"
    ? `${home.team} leads the current quantitative case, but the edge remains conditional on the evidence available in FREE MODE.`
    : decision === "AWAY EDGE"
      ? `${away.team} leads the current quantitative case, but the edge remains conditional on the evidence available in FREE MODE.`
      : decision === "INSUFFICIENT INTELLIGENCE"
        ? "The system does not have enough reliable match evidence to justify a strong decision."
        : decision === "HIGH MODEL CONFLICT"
          ? "The engines do not separate the outcomes enough to support a disciplined 1X2 decision."
          : "The current evidence supports a lean rather than a high-conviction selection.";

  return {
    headline: `${fixture.home} vs ${fixture.away}: ${decision}`,
    decision,
    summary,
    claims,
    questionsForNextLayer: [
      "Does current bookmaker pricing disagree with the internal probability?",
      "Are confirmed lineups, injuries and suspensions likely to change the baseline?",
      "Do xG, shots and chance quality confirm or contradict the goal-rate signal?",
      "Does team news, schedule congestion or motivation create a material context shift?",
    ],
    aiReadyContext: {
      fixture,
      probabilities: result.probabilities,
      totals: result.totals,
      btts: result.btts,
      confidence: result.confidence,
      quality: result.quality,
      evidence: result.evidence,
      warnings: result.warnings,
      claims,
      instruction: "Synthesize only supplied evidence. Never invent missing odds, injuries, lineups, xG, news or probabilities. Explicitly state uncertainty and return NO STRONG EDGE when evidence does not justify a selection.",
    },
  };
}
