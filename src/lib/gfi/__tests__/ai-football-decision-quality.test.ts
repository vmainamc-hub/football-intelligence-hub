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
    { role: "Team Strength Scout", name: "Strength Scout", stance: "HOME", assessment: "Arsenal clear strength advantage.", evidence: [], concern: "None", question: "None" },
    { role: "Tactical Analyst", name: "Tactician", stance: "HOME", assessment: "Tactical matchup heavily favors home wing overloads.", evidence: [], concern: "None", question: "None" },
    { role: "Statistical Analyst", name: "Stats Lead", stance: "HOME", assessment: "1X2 edge is sharper than safe non-directional totals.", evidence: [], concern: "None", question: "None" },
    { role: "Form & Trajectory Analyst", name: "Form Scout", stance: "HOME", assessment: "Arsenal accelerating; Chelsea struggling on the road.", evidence: [], concern: "None", question: "None" },
    { role: "Context & Motivation Analyst", name: "Context Scout", stance: "HOME", assessment: "Full rest; no key rotation.", evidence: [], concern: "None", question: "None" },
    { role: "Competition Strength Analyst", name: "Comp Analyst", stance: "HOME", assessment: "Domestic Premier League matchup verified.", evidence: [], concern: "None", question: "None" },
    { role: "Data Forensic Analyst", name: "Forensic Lead", stance: "HOME", assessment: "Data verified without distortion.", evidence: [], concern: "None", question: "None" },
    { role: "Contrarian Analyst", name: "Devil's Advocate", stance: "HOME", assessment: "Over 1.5 Goals is overly broad; Home Win provides actual football signal.", evidence: [], concern: "None", question: "None" },
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
};

test("1. High-probability Over 1.5 market can be challenged", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      market: "1X2",
      selection: "Arsenal Win",
      callType: "HOME_WIN",
      rationale: "Arsenal home dominance provides higher football informational value than raw Over 1.5 Goals.",
      conviction: "HIGH",
      evidenceQuality: "GOOD",
      divergenceFromQuantitativeLeader: true,
      divergenceReasonCode: "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL",
      divergenceReason: "Directional strength signal is more informative than the broad totals outcome.",
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

  const { panel, rejectedAnything } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(rejectedAnything, false);
  assert.equal(panel.analystCall.selection, "Arsenal Win");
  assert.equal(panel.analystCall.divergenceFromQuantitativeLeader, true);
  assert.equal(panel.analystCall.divergenceReasonCode, "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL");
  assert.equal(panel.analystCall.safeAlternative, "Over 1.5 Goals");
});

test("2. The AI can legitimately select Home Win", () => {
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
});

test("3. The AI can legitimately select Draw", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Draw",
      callType: "DRAW",
      conviction: "MODERATE",
      evidenceQuality: "GOOD",
      rationale: "Two low-variance sides with matched defensive blocks.",
      divergenceReasonCode: "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL",
      safeAlternative: "Over 1.5 Goals",
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "Draw");
  assert.equal(analysis.decision, "DRAW LEAN");
});

test("4. The AI can legitimately select Away Win", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Chelsea Win",
      callType: "AWAY_WIN",
      conviction: "HIGH",
      evidenceQuality: "STRONG",
      rationale: "Away side exhibits superior recent trajectory and tactical mismatch.",
      divergenceReasonCode: "RECENT_TRAJECTORY_OVERRIDES_LONG_TERM_BASELINE",
      safeAlternative: "Over 1.5 Goals",
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "Chelsea Win");
  assert.equal(analysis.decision, "AWAY EDGE");
});

test("5. The AI can legitimately select BTTS", () => {
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
  assert.equal(panel.analystCall.divergenceReasonCode, "BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL");
});

test("6. The AI can legitimately select a totals market when directional evidence is weak", () => {
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
  assert.equal(panel.analystCall.divergenceReasonCode, "NO_DIRECTIONAL_EDGE_RETAINED_TOTALS");
});

test("7. AI cannot invent a market (must be from marketSurface)", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal to win 5-0 with 10 corners", // Hallucinated market
      callType: "OTHER",
      rationale: "Invented fantasy market.",
    },
  };

  const { panel, rejectedAnything } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(rejectedAnything, true);
  // Reverted to top of marketSurface (Over 1.5 Goals)
  assert.equal(panel.analystCall.selection, "Over 1.5 Goals");
});

test("8. AI cannot invent probability (quantitative probabilities remain untouched)", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal Win",
      quantitativeProbability: 99.9, // Attempted fabricated probability
      rationale: "Fabricated probability injection attempt.",
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  // Probability is strictly taken from the mathematical model candidate row (58%)
  assert.equal(panel.analystCall.quantitativeProbability, 58);
  assert.equal(panel.analystCall.quantitativeLeaderProbability, 82);
});

test("9. Strong identity failure blocks unsafe AI override", () => {
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
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal Win",
      rationale: "Override despite entity failure.",
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, false);
  assert.match(res.reason, /Identity check status FAIL/);
  // Final prediction remains the untouched quantitative fallback
  assert.equal(analysis.finalPrediction, "Over 1.5 Goals");
});

test("10. Quantitative probabilities remain unchanged after AI selection", () => {
  const analysis = createMockAnalysis();
  const origHomeProb = analysis.probabilities.home;
  const origDrawProb = analysis.probabilities.draw;
  const origAwayProb = analysis.probabilities.away;
  const origCandidates = JSON.stringify(analysis.marketCandidates);

  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal Win",
      callType: "HOME_WIN",
      rationale: "Strong football edge.",
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  applyAnalystDecision(analysis, panel);

  assert.equal(analysis.probabilities.home, origHomeProb);
  assert.equal(analysis.probabilities.draw, origDrawProb);
  assert.equal(analysis.probabilities.away, origAwayProb);
  assert.equal(JSON.stringify(analysis.marketCandidates), origCandidates);
});

test("11. Safe alternative remains the quantitative leader when AI diverges", () => {
  const analysis = createMockAnalysis();
  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal Win",
      callType: "HOME_WIN",
      divergenceFromQuantitativeLeader: true,
      divergenceReasonCode: "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL",
      divergenceReason: "Home win represents the true football edge.",
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  assert.equal(panel.analystCall.selection, "Arsenal Win");
  assert.equal(panel.analystCall.safeAlternative, "Over 1.5 Goals");
  assert.equal(panel.marketReview.safeAlternative, "Over 1.5 Goals");

  applyAnalystDecision(analysis, panel);
  assert.equal(analysis.aiReasoningPacket?.safeAlternative, "Over 1.5 Goals");
  assert.equal(analysis.aiReasoningPacket?.quantitativeLeaderBeforeAI, "Over 1.5 Goals");
});

test("12. Single and Batch use the same AI decision layer", () => {
  const singleAnalysis = createMockAnalysis();
  const batchAnalysis = createMockAnalysis();

  const raw = {
    ...basePayload,
    analystCall: {
      status: "ACTIVE",
      selection: "Arsenal Win",
      callType: "HOME_WIN",
      conviction: "HIGH",
      rationale: "Consistent decision application in both single and batch pipelines.",
    },
  };

  const { panel: p1 } = cleanPanel(raw, "gemini-3.6-flash", singleAnalysis);
  const { panel: p2 } = cleanPanel(raw, "gemini-3.6-flash", batchAnalysis);

  const res1 = applyAnalystDecision(singleAnalysis, p1);
  const res2 = applyAnalystDecision(batchAnalysis, p2);

  assert.equal(res1.applied, true);
  assert.equal(res2.applied, true);
  assert.equal(singleAnalysis.finalPrediction, batchAnalysis.finalPrediction);
  assert.equal(singleAnalysis.decision, batchAnalysis.decision);
  assert.equal(singleAnalysis.aiReasoningPacket?.aiRole, batchAnalysis.aiReasoningPacket?.aiRole);
});

test("13. Ararat Armenia vs Sparta Prague competition identity is correct", () => {
  const analysis = createMockAnalysis({
    home: { team: "Ararat Armenia", goals: 1.8, lambda: 1.8 },
    away: { team: "Sparta Prague", goals: 2.3, lambda: 2.3 },
    marketCandidates: [
      { market: "OVER/UNDER 1.5", selection: "Over 1.5 Goals", modelProbability: 0.81 } as any,
      { market: "1X2", selection: "Sparta Prague Win", modelProbability: 0.62 } as any,
    ],
  });

  const raw = {
    identityCheck: {
      status: "PASS",
      homeConfidence: 96,
      awayConfidence: 97,
      competitionConfidence: 95,
      notes: ["UEFA Conference League qualifying round verified. Cross-league competition context confirmed."],
    },
    teamStrength: {
      home: { relative: "WEAKER", rationale: "Armenian Premier League champion vs Czech First League giant." },
      away: { relative: "STRONGER", rationale: "Significantly higher coefficient and squad depth." },
      strengthGap: "AWAY_CLEAR",
      opponentQualityAdjustment: "Sparta Prague plays in significantly higher UEFA coefficient tier.",
    },
    realityCheck: { status: "COHERENT", score: 94, flags: [] },
    panel: [
      { role: "Competition Strength Analyst", name: "Comp Analyst", stance: "AWAY", assessment: "Czech league strength vastly exceeds Armenian domestic baseline.", evidence: [], concern: "None", question: "None" },
      { role: "Team Strength Scout", name: "Scout", stance: "AWAY", assessment: "Sparta Prague clear strength differential.", evidence: [], concern: "None", question: "None" }
    ],
    debate: [],
    chair: {
      summary: "Sparta Prague holds decisive cross-competition quality advantage.",
      strongestCase: "European pedigree and squad value gap.",
      strongestCountercase: "Long distance travel to Yerevan.",
      unresolvedQuestion: "None",
      decision: "SUPPORT",
      severity: "NORMAL",
      revalidationReason: "",
    },
    analystCall: {
      status: "ACTIVE",
      selection: "Sparta Prague Win",
      callType: "AWAY_WIN",
      rationale: "Cross-competition coefficient disparity strongly favors Sparta Prague.",
      conviction: "HIGH",
      divergenceReasonCode: "OPPONENT_ADJUSTED_STRENGTH_GAP",
      safeAlternative: "Over 1.5 Goals",
    },
    marketReview: {
      quantitativeLeader: "Over 1.5 Goals",
      selectedMarket: "Sparta Prague Win",
      safeAlternative: "Over 1.5 Goals",
      panelView: "Away edge decisive.",
      alternatives: ["Over 1.5 Goals"],
    },
  };

  const { panel } = cleanPanel(raw, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, true);
  assert.equal(analysis.finalPrediction, "Sparta Prague Win");
  assert.equal(panel.teamStrength.strengthGap, "AWAY_CLEAR");
});

test("14. Plymouth Argyle vs Real Madrid does not produce a conclusion based on corrupted team identity", () => {
  const analysis = createMockAnalysis({
    home: { team: "Plymouth Argyle", goals: 0.8, lambda: 0.8 },
    away: { team: "Real Madrid", goals: 3.2, lambda: 3.2 },
  });

  const corruptedPayload = {
    identityCheck: {
      status: "FAIL",
      homeConfidence: 20,
      awayConfidence: 15,
      competitionConfidence: 10,
      notes: ["Absurd pairing in Championship fixture database: Plymouth Argyle cannot play Real Madrid in domestic league."],
    },
    chair: {
      summary: "Severe fixture database corruption detected.",
      decision: "REVALIDATE",
      severity: "SEVERE",
      revalidationReason: "Corrupted fixture identity.",
    },
    analystCall: {
      status: "ACTIVE",
      selection: "Plymouth Argyle Win", // Corrupted hallucinated selection
      callType: "HOME_WIN",
    },
  };

  const { panel } = cleanPanel(corruptedPayload, "gemini-3.6-flash", analysis);
  const res = applyAnalystDecision(analysis, panel);
  assert.equal(res.applied, false);
  assert.match(res.reason, /FAIL/);
  // Preserves quantitative fallback, rejecting corrupt override
  assert.equal(analysis.finalPrediction, "Over 1.5 Goals");
});
