import type { MatchRow } from "./intelligence";
import type { AuthoritativeMatchAnalysis } from "./authoritative";
export type ReasoningClaim = {
  id: string;
  signal: "SUPPORT" | "CONTRADICTION" | "LIMITATION";
  statement: string;
  evidence: string;
  strength: number;
};
export type MatchReasoning = {
  headline: string;
  decision:
    | "HOME EDGE"
    | "DRAW LEAN"
    | "AWAY EDGE"
    | "NO STRONG EDGE"
    | "INSUFFICIENT INTELLIGENCE"
    | "HIGH MODEL CONFLICT";
  summary: string;
  claims: ReasoningClaim[];
  questionsForNextLayer: string[];
  aiReadyContext: Record<string, unknown>;
};
export function buildMatchReasoning(
  fixture: MatchRow,
  result: AuthoritativeMatchAnalysis,
): MatchReasoning {
  const p = result.probabilities,
    top = Math.max(p.home, p.draw, p.away),
    claims: ReasoningClaim[] = [];
  const leader = p.home === top ? result.home.team : p.away === top ? result.away.team : "Draw";
  if (result.decision === "HOME EDGE" || result.decision === "AWAY EDGE")
    claims.push({
      id: "consensus-leader",
      signal: "SUPPORT",
      statement: `${leader} leads the authoritative 1X2 consensus.`,
      evidence: `H ${Math.round(p.home * 100)}% · D ${Math.round(p.draw * 100)}% · A ${Math.round(p.away * 100)}%; ${Math.round(result.consensus.agreement * 100)}% cross-engine agreement.`,
      strength: top,
    });
  else
    claims.push({
      id: "no-dominant-result",
      signal: "CONTRADICTION",
      statement:
        "No sufficiently dominant 1X2 outcome survives the authoritative conflict and evidence checks.",
      evidence: `H ${Math.round(p.home * 100)}% · D ${Math.round(p.draw * 100)}% · A ${Math.round(p.away * 100)}%; conflict ${Math.round(result.consensus.conflict * 100)}%.`,
      strength: 1 - top,
    });
  const form = result.engines.find((e) => e.id === "FORM"),
    goals = result.engines.find((e) => e.id === "GOALS"),
    venue = result.engines.find((e) => e.id === "VENUE"),
    h2h = result.engines.find((e) => e.id === "H2H");
  for (const e of [form, goals, venue, h2h])
    if (e && e.signal !== "NEUTRAL")
      claims.push({
        id: e.id,
        signal:
          e.signal === "SUPPORT"
            ? "SUPPORT"
            : e.signal === "LIMITATION"
              ? "LIMITATION"
              : "CONTRADICTION",
        statement: `${e.name} ${e.signal.toLowerCase()}s the current case.`,
        evidence: e.evidence[0] ?? "No direct evidence supplied.",
        strength: e.confidence / 100,
      });
  if (result.risk === "HIGH" || result.risk === "VERY HIGH")
    claims.push({
      id: "risk",
      signal: "LIMITATION",
      statement: "The authoritative result carries elevated decision risk.",
      evidence: `Risk ${result.risk}; robustness ${result.robustness.label} (${result.robustness.score}%).`,
      strength: 1 - result.robustness.score / 100,
    });
  claims.push({
    id: "missing-domains",
    signal: "LIMITATION",
    statement: "External intelligence layers remain unavailable in FREE MODE.",
    evidence:
      "No bookmaker odds, confirmed lineups, injuries, xG provider or live news feed is attached.",
    strength: 1,
  });
  const decision = result.decision;
  const summary =
    decision === "HOME EDGE"
      ? `${result.home.team} leads after independent engine aggregation and conflict checks.`
      : decision === "AWAY EDGE"
        ? `${result.away.team} leads after independent engine aggregation and conflict checks.`
        : decision === "INSUFFICIENT INTELLIGENCE"
          ? "The evidence base is too weak to justify a strong selection."
          : decision === "HIGH MODEL CONFLICT"
            ? "Independent engines disagree materially; the system withholds a strong 1X2 edge."
            : "The authoritative model supports a lean, not a high-conviction selection.";
  return {
    headline: `${fixture.home} vs ${fixture.away}: ${decision}`,
    decision,
    summary,
    claims,
    questionsForNextLayer: [
      "Does bookmaker pricing disagree with the internal probability when odds become available?",
      "Do confirmed lineups, injuries and suspensions materially change the baseline?",
      "Do xG, shots and chance quality confirm or contradict the goal engine?",
      "Does schedule congestion, travel, motivation or team news create a material context shift?",
    ],
    aiReadyContext: result.aiReasoningPacket,
  };
}
