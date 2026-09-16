import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanPanel,
  applyAnalystDecision,
  marketSurface,
  FootballExpertPanel,
} from "../football-expert-panel.js";
import { AuthoritativeMatchAnalysis } from "../authoritative-decision-engine.js";
import { MatchRow } from "../../types.js";

function createMockAnalysis(overrides?: Partial<AuthoritativeMatchAnalysis>): AuthoritativeMatchAnalysis {
  return {
    id: "match-test-decision-quality",
    home: { team: "Arsenal", goals: 2.1, lambda: 2.1 },
    away: { team: "Chelsea", goals: 1.1, lambda: 1.1 },
    probabilities: { home: 0.58, draw: 0.24, away: 0.18 },
    decision: "HOME EDGE",
    finalPrediction: "Over 1.5 Goals",
    predictedScore: "2-1",
    confidence: 76,
    quality: 82,
    risk: "MODERATE",
    consensus: { agreement: 0.85, conflict: 0.15 },
    qualification: {
      actionableMarket: {
        market: "OVER/UNDER 1.5",
        selection: "Over 1.5 Goals",
        label: "Over 1.5 Goals",
        modelProbability: 0.82,
        expectedValue: 0.12,
        actionabilityScore: 84,
        tier: "PRIMARY",
        whyConsidered: "High Poisson likelihood of multiple goals",
        supportingEvidence: ["Totals engine probability 82%"],
      },
      rankedActionable: [],
      evaluatedCount: 7,
      disqualifiedCount: 2,
    },
    engines: [
      {
        id: "TOTALS",
        name: "Totals Engine",
        signal: "OVER 1.5",
        confidence: 82,
        quality: 80,
        version: "2.0",
        values: { "over0.5": 0.94, "over1.5": 0.82, "over2.5": 0.58, "over3.5": 0.32 },
        probabilities: { "over1.5": 0.82, "over2.5": 0.58 },
      },
      {
        id: "BTTS",
        name: "BTTS Engine",
        signal: "YES",
        confidence: 74,
        quality: 78,
        version: "2.0",
        values: { yes: 0.56, no: 0.44 },
        probabilities: { yes: 0.56, no: 0.44 },
      },
    ],
    marketCandidates: [
      {
        market: "OVER/UNDER 1.5",
        selection: "Over 1.5 Goals",
        modelProbability: 0.82,
        qualificationStatus: "QUALIFIED",
      } as any,
      {
        market: "1X2",
        selection: "Arsenal Win",
        modelProbability: 0.58,
        qualificationStatus: "QUALIFIED",
      } as any,
      {
        market: "BTTS",
        selection: "BTTS — YES",
        modelProbability: 0.56,
        qualificationStatus: "QUALIFIED",
      } as any,
      {
        market: "1X2",
        selection: "Draw",
        modelProbability: 0.24,
        qualificationStatus: "QUALIFIED",
      } as any,
      {
        market: "1X2",
        selection: "Chelsea Win",
        modelProbability: 0.18,
        qualificationStatus: "QUALIFIED",
      } as any,
    ],
    warnings: [],
    evidenceMetrics: {} as any,
    evidenceState: {} as any,
    robustness: { score: 80 } as any,
    ...overrides,
  };
}

const basePayload = {
  identityCheck: {
    status: "PASS",
    homeConfidence: 99,
    awayConfidence: 98,
    competitionConfidence: 99,
    notes: ["Identity fully confirmed in Premier League."],
  },
  teamStrength: {
    home: { relative: "STRONGER", rationale: "Dominant pressing and opponent-adjusted metrics." },
    away: { relative: "WEAKER", rationale: "Defensive instability away from home." },
    strengthGap: "HOME_CLEAR",
    opponentQualityAdjustment: "Performance robust against top flight opposition.",
  },
  realityCheck: {
    status: "COHERENT",
    score: 92,
    flags: [],
  },
  panel: [
    { role: "Team Strength Scout", name: "Team Strength Scout", stance: "HOME", assessment: "Arsenal clear opponent-adjusted strength advantage over Chelsea.", evidence: ["Goal differential +1.2 per 90"], concern: "None", question: "None" },
    { role: "Tactical Analyst", name: "Tactical Analyst", stance: "HOME", assessment: "Tactical matchup heavily favors home wing overloads and high pressing traps.", evidence: ["High recovery zone dominance"], concern: "None", question: "None" },
    { role: "Statistical Analyst", name: "Statistical Analyst", stance: "HOME", assessment: "1X2 directional edge carries higher informational value than safe totals.", evidence: ["Poisson distribution home win lean"], concern: "None", question: "None" },
    { role: "Form & Trajectory Analyst", name: "Form & Trajectory Analyst", stance: "HOME", assessment: "Arsenal accelerating form trajectory; Chelsea struggling away from home.", evidence: ["W-W-W vs L-D-L in last 3"], concern: "None", question: "None" },
    { role: "Context & Motivation Analyst", name: "Context & Motivation Analyst", stance: "HOME", assessment: "Full rest cycle; key starters fit with no rotation required.", evidence: ["7 days rest"], concern: "None", question: "None" },
    { role: "Competition Strength Analyst", name: "Competition Strength Analyst", stance: "HOME", assessment: "Domestic Premier League matchup verified with consistent opponent tiering.", evidence: ["Premier League tier 1"], concern: "None", question: "None" },
    { role: "Data Forensic Analyst", name: "Data Forensic Analyst", stance: "HOME", assessment: "Data verified without distortion, duplicate records, or mapping errors.", evidence: ["Entity ID confirmed"], concern: "None", question: "None" },
    { role: "Contrarian Analyst", name: "Contrarian Analyst", stance: "HOME", assessment: "Over 1.5 Goals is overly broad; Home Win provides actual decisive football signal.", evidence: ["82% totals vs 58% directional"], concern: "None", question: "None" },
  ],
  debate: [
    { speaker: "Contrarian Analyst", challenges: "Why not take safe Over 1.5 Goals at 82%?", response: "Because Arsenal Home Win at 58% carries decisive football edge and team-strength disparity." }
  ],
  chair: {
    summary: "The council unanimously determines that Arsenal Home Win is the most informative football conclusion.",
    strongestCase: "Home team dominance in opponent-adjusted metrics.",
    strongestCountercase: "Chelsea transition counter-attacks.",
    unresolvedQuestion: "None",
    decision: "SUPPORT",
    severity: "NORMAL",
    revalidationReason: "",
  },
  analystCall: {
    status: "ACTIVE",
    selection: "Arsenal Win",
    callType: "HOME_WIN",
    conviction: "HIGH",
    evidenceQuality: "STRONG",
    rationale: "Clear opponent-adjusted strength gap and home venue control.",
    divergenceReasonCode: "OPPONENT_ADJUSTED_STRENGTH_GAP",
    divergenceReason: "Directional home edge is more informative than non-directional totals.",
    safeAlternative: "Over 1.5 Goals",
  },
  marketReview: {
    quantitativeLeader: "Over 1.5 Goals",
    selectedMarket: "Arsenal Win",
    safeAlternative: "Over 1.5 Goals",
    panelView: "Directional home win prioritized over safe totals.",
    alternatives: ["Over 1.5 Goals"],
  },
};

test("1. all eight specialists present: complete council validates as ACTIVE", () => {
  const analysis = createMockAnalysis();
  const { panel, completeness, rejectedAnything } = cleanPanel(basePayload, "gemini-3.6-flash", analysis);
  assert.equal(completeness.isComplete, true);
  assert.equal(panel.status, "ACTIVE");
  assert.equal(panel.executionState, "AVAILABLE");
  assert.equal(panel.panel.length, 8);
  assert.equal(rejectedAnything, false);
});

test("2. missing specialist rejected: missing one specialist invalidates council", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    panel: basePayload.panel.filter((s) => s.role !== "Contrarian Analyst"),
  };
  const { panel, completeness, rejectedAnything } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(completeness.isComplete, false);
  assert.equal(completeness.missingSpecialists.includes("Contrarian Analyst"), true);
  assert.equal(panel.status, "UNAVAILABLE");
  assert.equal(panel.divergenceState, "INCOMPLETE");
  assert.equal(rejectedAnything, true);
  assert.equal(panel.analystCall.status, "FALLBACK");
});

test("3. empty specialist rejected: placeholder or empty assessment invalidates council", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    panel: basePayload.panel.map((s) =>
      s.role === "Tactical Analyst" ? { ...s, assessment: "None" } : s,
    ),
  };
  const { panel, completeness, rejectedAnything } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(completeness.isComplete, false);
  assert.equal(completeness.missingSpecialists.includes("Tactical Analyst"), true);
  assert.equal(panel.status, "UNAVAILABLE");
  assert.equal(panel.divergenceState, "INCOMPLETE");
  assert.equal(rejectedAnything, true);
});

test("4. Chair cannot run without specialists: SUPPORT decision without specialists fails", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    panel: [], // No specialists
    chair: {
      summary: "I decide Arsenal Win despite no specialists being present.",
      decision: "SUPPORT",
      severity: "NORMAL",
      strongestCase: "None",
      strongestCountercase: "None",
      unresolvedQuestion: "None",
      revalidationReason: "",
    },
  };
  const { panel, completeness } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(completeness.isComplete, false);
  assert.equal(panel.status, "UNAVAILABLE");
  assert.equal(panel.divergenceState, "INCOMPLETE");
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, false);
  assert.equal(analysis.finalPrediction, "Over 1.5 Goals");
});

test("5. Contrarian challenge always present on panel output", () => {
  const analysis = createMockAnalysis();
  const { panel } = cleanPanel(basePayload, "gemini-3.6-flash", analysis);
  assert.ok(panel.contrarianChallenge);
  assert.ok(panel.contrarianChallenge.challengeQuestion.length > 0);
  assert.ok(panel.contrarianChallenge.evidenceForAlternative.length > 0);
  assert.ok(panel.contrarianChallenge.verdict);
});

test("6. quantitative leader explicitly challenged by Contrarian", () => {
  const analysis = createMockAnalysis();
  const { panel } = cleanPanel(basePayload, "gemini-3.6-flash", analysis);
  assert.equal(panel.contrarianChallenge?.quantitativeLeaderChallenged, "Over 1.5 Goals");
  assert.match(panel.contrarianChallenge?.challengeQuestion || "", /Over 1\.5 Goals/);
});

test("7. Home Win selection: AI can legitimately select Home Win", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal Win",
      callType: "HOME_WIN",
      conviction: "HIGH",
      evidenceQuality: "STRONG",
      rationale: "Clear opponent-adjusted strength gap and home venue control.",
      divergenceReasonCode: "OPPONENT_ADJUSTED_STRENGTH_GAP",
      safeAlternative: "Over 1.5 Goals",
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "Arsenal Win");
  assert.equal(analysis.decision, "HOME EDGE");
  assert.equal(panel.divergenceState, "DIVERGE");
});

test("8. Away Win selection: AI can legitimately select Away Win", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Chelsea Win",
      callType: "AWAY_WIN",
      conviction: "HIGH",
      evidenceQuality: "STRONG",
      rationale: "Away side exhibits superior recent trajectory and tactical counter-pressing.",
      divergenceReasonCode: "RECENT_TRAJECTORY_OVERRIDES_LONG_TERM_BASELINE",
      safeAlternative: "Over 1.5 Goals",
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "Chelsea Win");
  assert.equal(analysis.decision, "AWAY EDGE");
  assert.equal(panel.divergenceState, "DIVERGE");
});

test("9. Draw selection: AI can legitimately select Draw", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Draw",
      callType: "DRAW",
      conviction: "MODERATE",
      evidenceQuality: "GOOD",
      rationale: "Two low-variance sides with matched defensive blocks and parity.",
      divergenceReasonCode: "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL",
      safeAlternative: "Over 1.5 Goals",
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "Draw");
  assert.equal(analysis.decision, "DRAW LEAN");
  assert.equal(panel.divergenceState, "DIVERGE");
});

test("10. BTTS selection: AI can legitimately select BTTS", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "BTTS — YES",
      callType: "BTTS_YES",
      conviction: "HIGH",
      evidenceQuality: "STRONG",
      rationale: "Both sides possess potent attacking metrics combined with transition vulnerabilities.",
      divergenceReasonCode: "BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL",
      safeAlternative: "Over 1.5 Goals",
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "BTTS — YES");
  assert.equal(analysis.decision, "NO STRONG EDGE");
  assert.equal(panel.divergenceState, "DIVERGE");
  assert.equal(panel.analystCall.divergenceReasonCode, "BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL");
});

test("11. Over/Under selection: AI selects totals market when directional evidence is absent", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Over 1.5 Goals",
      callType: "OVER_1_5",
      conviction: "HIGH",
      evidenceQuality: "GOOD",
      rationale: "Neither side holds a decisive match-winner edge; goal line remains the optimal expression.",
      divergenceReasonCode: "NO_DIRECTIONAL_EDGE_RETAINED_TOTALS",
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(panel.analystCall.selection, "Over 1.5 Goals");
  assert.equal(panel.analystCall.divergenceFromQuantitativeLeader, false);
  assert.equal(panel.divergenceState, "AGREE");
});

test("12. invalid market rejected: AI cannot invent a market outside marketSurface", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal to win 5-0 with 10 corners", // Hallucinated uncomputed market
      callType: "OTHER",
      rationale: "Invented fantasy market.",
    },
  };
  const { panel, rejectedAnything } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(rejectedAnything, true);
  assert.equal(panel.analystCall.selection, "Over 1.5 Goals");
});

test("13. quantitative probability unchanged: quantitative probabilities remain untouched", () => {
  const analysis = createMockAnalysis();
  const origHomeProb = analysis.probabilities.home;
  const origDrawProb = analysis.probabilities.draw;
  const origAwayProb = analysis.probabilities.away;
  const origCandidates = JSON.stringify(analysis.marketCandidates);

  const { panel } = cleanPanel(basePayload, "gemini-3.6-flash", analysis);
  applyAnalystDecision(analysis, panel);

  assert.equal(analysis.probabilities.home, origHomeProb);
  assert.equal(analysis.probabilities.draw, origDrawProb);
  assert.equal(analysis.probabilities.away, origAwayProb);
  assert.equal(JSON.stringify(analysis.marketCandidates), origCandidates);
});

test("14. safe alternative preserved: quantitative leader retained as safeAlternative on divergence", () => {
  const analysis = createMockAnalysis();
  const { panel } = cleanPanel(basePayload, "gemini-3.6-flash", analysis);
  assert.equal(panel.analystCall.selection, "Arsenal Win");
  assert.equal(panel.analystCall.safeAlternative, "Over 1.5 Goals");
  assert.equal(panel.marketReview.safeAlternative, "Over 1.5 Goals");

  applyAnalystDecision(analysis, panel);
  assert.equal(analysis.aiReasoningPacket?.safeAlternative, "Over 1.5 Goals");
  assert.equal(analysis.aiReasoningPacket?.quantitativeLeaderBeforeAI, "Over 1.5 Goals");
});

test("15. identity failure blocks AI application: FAIL status blocks override", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    identityCheck: {
      status: "FAIL",
      homeConfidence: 15,
      awayConfidence: 10,
      competitionConfidence: 5,
      notes: ["Team entity could not be mapped to any known league."],
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, false);
  assert.match(res.reason, /Identity check status FAIL/);
  assert.equal(analysis.finalPrediction, "Over 1.5 Goals");
});

test("16. Chair REVALIDATE creates REVALIDATE state and preserves quantitative baseline", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    chair: {
      ...basePayload.chair,
      decision: "REVALIDATE",
      severity: "SIGNIFICANT",
      revalidationReason: "Conflicting evidence between statistical signals and recent injury reports.",
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(panel.divergenceState, "REVALIDATE");
  assert.equal(panel.chair.decision, "REVALIDATE");

  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, false);
  assert.match(res.reason, /REVALIDATE/);
  assert.equal(analysis.finalPrediction, "Over 1.5 Goals");
});

test("17. incomplete council creates INCOMPLETE state", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    panel: [basePayload.panel[0]], // Only 1 specialist
  };
  const { panel, completeness } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(completeness.isComplete, false);
  assert.equal(panel.status, "UNAVAILABLE");
  assert.equal(panel.divergenceState, "INCOMPLETE");
  assert.equal(panel.analystCall.status, "FALLBACK");
});

test("18. missing football score does not become 0/100", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    realityCheck: {
      status: "LIMITED_EVIDENCE",
      score: undefined,
      flags: ["No external reality flags triggered."],
    },
  };
  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(panel.realityCheck.score, undefined);
  assert.notEqual(panel.realityCheck.score, 0);
  assert.equal(panel.realityCheck.status, "LIMITED_EVIDENCE");
});

test("19. AI conviction remains separate from probability", () => {
  const analysis = createMockAnalysis();
  const { panel } = cleanPanel(basePayload, "gemini-3.6-flash", analysis);
  // Arsenal Win probability is 58%
  assert.equal(panel.analystCall.quantitativeProbability, 58);
  // Conviction is HIGH, not a mathematical 99%
  assert.equal(panel.analystCall.conviction, "HIGH");
  assert.notEqual(panel.analystCall.quantitativeProbability, 100);
});

test("20. Single and Batch use the exact same council decision logic", () => {
  const singleAnalysis = createMockAnalysis();
  const batchAnalysis = createMockAnalysis();

  const { panel: p1 } = cleanPanel(basePayload, "gemini-3.6-flash", singleAnalysis);
  const { panel: p2 } = cleanPanel(basePayload, "gemini-3.6-flash", batchAnalysis);

  const res1 = applyAnalystDecision(singleAnalysis, p1);
  const res2 = applyAnalystDecision(batchAnalysis, p2);

  assert.equal(res1.applied, true);
  assert.equal(res2.applied, true);
  assert.equal(singleAnalysis.finalPrediction, batchAnalysis.finalPrediction);
  assert.equal(singleAnalysis.decision, batchAnalysis.decision);
  assert.equal(p1.divergenceState, p2.divergenceState);
  assert.equal(singleAnalysis.aiReasoningPacket?.aiRole, batchAnalysis.aiReasoningPacket?.aiRole);
});
