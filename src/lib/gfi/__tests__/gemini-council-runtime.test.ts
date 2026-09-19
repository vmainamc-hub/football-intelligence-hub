import test from "node:test";
import assert from "node:assert/strict";
import {
  runFootballExpertPanel,
  cleanPanel,
  applyAnalystDecision,
  emptyPanel,
  marketSurface,
  type FootballExpertPanel,
  type PanelInput,
} from "../football-expert-panel";
import type { AuthoritativeMatchAnalysis } from "../authoritative";
import type { MatchRow } from "../intelligence";

function createMockAnalysis(overrides?: Partial<AuthoritativeMatchAnalysis>): AuthoritativeMatchAnalysis {
  return {
    id: "match-test-1",
    home: { team: "Arsenal", goals: 2.1, lambda: 2.1 },
    away: { team: "Chelsea", goals: 1.1, lambda: 1.1 },
    probabilities: { home: 0.58, draw: 0.24, away: 0.18 },
    decision: "HOME EDGE",
    finalPrediction: "Over 2.5 Goals",
    predictedScore: "2-1",
    confidence: 76,
    quality: 82,
    risk: "MODERATE",
    consensus: { agreement: 0.85, conflict: 0.15 },
    qualification: {
      actionableMarket: {
        market: "OVER/UNDER 2.5",
        selection: "Over 2.5 Goals",
        label: "Over 2.5 Goals",
        modelProbability: 0.82,
        expectedValue: 0.12,
        actionabilityScore: 84,
        tier: "PRIMARY",
        whyConsidered: "Strong goals consensus",
        supportingEvidence: ["Poisson expectation 3.2 goals"],
      },
      rankedActionable: [],
      evaluatedCount: 5,
      disqualifiedCount: 0,
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
    ],
    warnings: [],
    evidenceMetrics: {} as any,
    evidenceState: {} as any,
    robustness: { score: 80 } as any,
    ...overrides,
  };
}

const mockFixture: MatchRow = {
  id: "fix-1",
  home: "Arsenal",
  away: "Chelsea",
  date: "2026-09-20",
  time: "16:30",
  league: "Premier League",
  sourceId: "EPL",
};

const validCouncilPayload = {
  identityCheck: {
    status: "PASS",
    homeConfidence: 98,
    awayConfidence: 97,
    competitionConfidence: 99,
    notes: ["Arsenal and Chelsea confirmed in Premier League."],
  },
  teamStrength: {
    home: { relative: "STRONGER", rationale: "Arsenal sustained dominant metrics." },
    away: { relative: "WEAKER", rationale: "Chelsea transition phase away from home." },
    strengthGap: "HOME_CLEAR",
    opponentQualityAdjustment: "Arsenal venue strength holds against top 6 opposition.",
  },
  realityCheck: {
    status: "COHERENT",
    score: 88,
    flags: [],
  },
  panel: [
    { role: "Team Strength Scout", name: "Team Strength Scout", stance: "HOME", assessment: "Arsenal clear opponent-adjusted strength advantage over Chelsea.", evidence: [], concern: "None", question: "None" },
    { role: "Tactical Analyst", name: "Tactical Analyst", stance: "HOME", assessment: "Dominant pressing setup and wing overload dominance.", evidence: [], concern: "None", question: "None" },
    { role: "Statistical Analyst", name: "Statistical Analyst", stance: "HOME", assessment: "Directional 1X2 market edge carries higher informational value.", evidence: [], concern: "None", question: "None" },
    { role: "Form & Trajectory Analyst", name: "Form & Trajectory Analyst", stance: "HOME", assessment: "Arsenal accelerating form trajectory; Chelsea struggling away.", evidence: [], concern: "None", question: "None" },
    { role: "Context & Motivation Analyst", name: "Context & Motivation Analyst", stance: "HOME", assessment: "Full rest cycle; key starters fit with no rotation required.", evidence: [], concern: "None", question: "None" },
    { role: "Competition Strength Analyst", name: "Competition Strength Analyst", stance: "HOME", assessment: "Domestic Premier League matchup verified with consistent opponent tiering.", evidence: [], concern: "None", question: "None" },
    { role: "Data Forensic Analyst", name: "Data Forensic Analyst", stance: "HOME", assessment: "Data verified without distortion, duplicate records, or mapping errors.", evidence: [], concern: "None", question: "None" },
    { role: "Contrarian Analyst", name: "Contrarian Analyst", stance: "HOME", assessment: "Over 1.5 Goals is overly broad; Home Win provides actual decisive football signal.", evidence: [], concern: "None", question: "None" },
  ],
  debate: [],
  chair: {
    summary: "The council unanimously sees an Arsenal match outcome edge.",
    strongestCase: "Home dominance.",
    strongestCountercase: "Chelsea counter-threat.",
    unresolvedQuestion: "None",
    decision: "SUPPORT",
    severity: "NORMAL",
    revalidationReason: "",
  },
  analystCall: {
    status: "ACTIVE",
    market: "1X2",
    selection: "Arsenal Win",
    callType: "HOME_WIN",
    rationale: "Arsenal home dominance provides higher football informational value than raw Over 1.5 Goals.",
    conviction: "HIGH",
    evidenceQuality: "GOOD",
    divergenceFromQuantitativeLeader: true,
    divergenceReason: "Home win represents the true football signal rather than non-directional goals.",
  },
  marketReview: {
    quantitativeLeader: "Over 1.5 Goals",
    selectedMarket: "Arsenal Win",
    panelView: "Directional home win prioritized over safe totals.",
    alternatives: ["Over 1.5 Goals"],
  },
  limitations: [],
};

test("1. Missing API Key returns explicit GEMINI CONFIGURATION MISSING fallback", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  try {
    const analysis = createMockAnalysis();
    const result = await runFootballExpertPanel({
      fixture: mockFixture,
      analysis,
    });

    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.provider, "NONE");
    assert.match(result.chair.summary, /GEMINI CONFIGURATION MISSING/);
    assert.equal(result.analystCall.status, "FALLBACK");
    assert.equal(result.analystCall.selection, "Over 2.5 Goals");
    assert.equal(analysis.finalPrediction, "Over 2.5 Goals"); // Quantitative intact
  } finally {
    if (origKey) process.env.GEMINI_API_KEY = origKey;
    if (origGoogleKey) process.env.GOOGLE_API_KEY = origGoogleKey;
  }
});

test("2. Attempt 1 success with gemini-3.8-flash", async () => {
  const analysis = createMockAnalysis();
  let calls = 0;

  const mockFetcher = async (url: string, init?: RequestInit) => {
    calls++;
    assert.match(url, /gemini-3\.8-flash/);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validCouncilPayload) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await runFootballExpertPanel({
    fixture: mockFixture,
    analysis,
    options: {
      fetcher: mockFetcher,
      primaryModel: "gemini-3.8-flash",
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.provider, "GEMINI");
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.fallbackModelUsed, false);
  assert.equal(result.retryAttempts, 1);
  assert.equal(result.analystCall.selection, "Arsenal Win");
  assert.equal(analysis.finalPrediction, "Arsenal Win");
  assert.equal(analysis.decision, "HOME EDGE");
  // Quantitative probabilities must remain untouched!
  assert.equal(analysis.probabilities.home, 0.58);
});

test("3. Attempt 1 returns 503 -> Attempt 2 retry gemini-3.8-flash succeeds", async () => {
  const analysis = createMockAnalysis();
  let calls = 0;
  const sleepCalls: number[] = [];

  const mockFetcher = async (url: string) => {
    calls++;
    if (calls === 1) {
      assert.match(url, /gemini-3\.8-flash/);
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            message: "This model is currently experiencing high demand.",
            status: "UNAVAILABLE",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    // Call 2: retry 3.8
    assert.match(url, /gemini-3\.8-flash/);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validCouncilPayload) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const mockSleep = async (ms: number) => {
    sleepCalls.push(ms);
  };

  const result = await runFootballExpertPanel({
    fixture: mockFixture,
    analysis,
    options: {
      fetcher: mockFetcher,
      sleepFn: mockSleep,
      primaryModel: "gemini-3.8-flash",
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleepCalls, [1500]); // 1.5s delay before retry
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.fallbackModelUsed, false);
  assert.equal(result.retryAttempts, 2);
  assert.equal(result.analystCall.selection, "Arsenal Win");
});

test("4. Attempt 1 & 2 fail with 503 -> Attempt 3 fallback to gemini-3.7-flash succeeds", async () => {
  const analysis = createMockAnalysis();
  let calls = 0;
  const modelsCalled: string[] = [];
  const sleepCalls: number[] = [];

  const mockFetcher = async (url: string) => {
    calls++;
    if (url.includes("gemini-3.8-flash")) modelsCalled.push("gemini-3.8-flash");
    if (url.includes("gemini-3.7-flash")) modelsCalled.push("gemini-3.7-flash");

    if (calls <= 2) {
      return new Response(
        JSON.stringify({ error: { code: 503, message: "Spikes in demand." } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Call 3: fallback model
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validCouncilPayload) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const mockSleep = async (ms: number) => {
    sleepCalls.push(ms);
  };

  const result = await runFootballExpertPanel({
    fixture: mockFixture,
    analysis,
    options: {
      fetcher: mockFetcher,
      sleepFn: mockSleep,
      primaryModel: "gemini-3.8-flash",
      fallbackModel: "gemini-3.7-flash",
    },
  });

  assert.equal(calls, 3);
  assert.deepEqual(modelsCalled, ["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.7-flash"]);
  assert.deepEqual(sleepCalls, [1500, 1000]);
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.model, "gemini-3.7-flash");
  assert.equal(result.fallbackModelUsed, true);
  assert.equal(result.retryAttempts, 3);
  assert.equal(result.analystCall.selection, "Arsenal Win");
});

test("5. All attempts fail -> Graceful quantitative fallback with diagnostic history", async () => {
  const analysis = createMockAnalysis();
  let calls = 0;

  const mockFetcher = async () => {
    calls++;
    return new Response(
      JSON.stringify({ error: { code: 503, message: "Spikes in demand." } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await runFootballExpertPanel({
    fixture: mockFixture,
    analysis,
    options: {
      fetcher: mockFetcher,
      sleepFn: async () => {},
      primaryModel: "gemini-3.8-flash",
      fallbackModel: "gemini-3.7-flash",
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.status, "ERROR");
  assert.equal(result.provider, "NONE");
  assert.match(result.chair.summary, /AI council unavailable after 3 attempt\(s\)/);
  assert.equal(result.analystCall.status, "FALLBACK");
  assert.equal(result.analystCall.selection, "Over 2.5 Goals");
  assert.equal(result.diagnostics?.attempts.length, 3);
  assert.equal(result.diagnostics?.finalStatus, "ALL_ATTEMPTS_FAILED");
  // Quantitative prediction maintained
  assert.equal(analysis.finalPrediction, "Over 2.5 Goals");
});

test("6. Robust parsing: handles markdown code block formatting safely", () => {
  const analysis = createMockAnalysis();
  const rawWithFences = "```json\n" + JSON.stringify(validCouncilPayload) + "\n```";
  const cleanJson = rawWithFences.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleanJson);
  const { panel, rejectedAnything } = cleanPanel(parsed, "gemini-3.8-flash", analysis);

  assert.equal(panel.status, "ACTIVE");
  assert.equal(rejectedAnything, false);
  assert.equal(panel.analystCall.selection, "Arsenal Win");
});

test("7. AI Decision Authority: Divergence from quantitative leader is respected", () => {
  const analysis = createMockAnalysis({
    finalPrediction: "Over 2.5 Goals", // Quant leader
  });
  const { panel } = cleanPanel(validCouncilPayload, "gemini-3.8-flash", analysis);
  const appResult = applyAnalystDecision(analysis, panel);

  assert.equal(appResult.applied, true);
  assert.equal(analysis.finalPrediction, "Arsenal Win");
  assert.equal(analysis.decision, "HOME EDGE");
  assert.equal(analysis.aiReasoningPacket?.aiDecisionAuthority, true);
  assert.equal(analysis.aiReasoningPacket?.quantitativeLeaderBeforeAI, "Over 2.5 Goals");
});

test("8. AI cannot invent invalid market outside market surface", () => {
  const analysis = createMockAnalysis({
    finalPrediction: "Over 2.5 Goals",
  });
  const payloadWithInventedMarket = {
    ...validCouncilPayload,
    analystCall: {
      ...validCouncilPayload.analystCall,
      selection: "Arsenal to Win and Over 5.5 Corners and 12 Fouls", // Invalid invented market
    },
  };

  const { panel, rejectedAnything } = cleanPanel(payloadWithInventedMarket, "gemini-3.8-flash", analysis);

  assert.equal(rejectedAnything, true);
  // Falls back to allowable market from surface
  assert.notEqual(panel.analystCall.selection, "Arsenal to Win and Over 5.5 Corners and 12 Fouls");
  assert.ok(["Over 2.5 Goals", "Arsenal Win"].includes(panel.analystCall.selection));
});

test("9. Integrity Guardrail: Plymouth vs Real Madrid (team strength mismatch / identity revalidation)", () => {
  const analysis = createMockAnalysis({
    home: { team: "Plymouth Argyle", goals: 1.0, lambda: 1.0 },
    away: { team: "Real Madrid", goals: 2.8, lambda: 2.8 },
    probabilities: { home: 0.05, draw: 0.12, away: 0.83 },
    finalPrediction: "Real Madrid Win",
  });

  // Test case: If council payload asserts identity FAIL or SEVERE tension
  const severePayload = {
    ...validCouncilPayload,
    identityCheck: {
      status: "FAIL" as const,
      homeConfidence: 20,
      awayConfidence: 99,
      competitionConfidence: 10,
      notes: ["Mismatch: Plymouth domestic tier vs Real Madrid continental elite without valid fixture sanction."],
    },
    chair: {
      ...validCouncilPayload.chair,
      decision: "REVALIDATE" as const,
      severity: "SEVERE" as const,
      revalidationReason: "Severe identity or competitive tier mismatch detected.",
    },
    analystCall: {
      ...validCouncilPayload.analystCall,
      selection: "Plymouth Argyle Win", // An erroneous AI hallucination
    },
  };

  const { panel } = cleanPanel(severePayload, "gemini-3.8-flash", analysis);
  const appResult = applyAnalystDecision(analysis, panel);

  // Decision authority MUST be blocked and quantitative fallback retained
  assert.equal(appResult.applied, false);
  assert.match(appResult.reason, /FAIL|SEVERE/);
  assert.equal(analysis.finalPrediction, "Real Madrid Win"); // Retained quantitative prediction
});

test("10. Integrity Guardrail: Ararat Armenia vs Sparta Prague (cross-competition validation)", () => {
  const analysis = createMockAnalysis({
    home: { team: "Ararat-Armenia", goals: 0.9, lambda: 0.9 },
    away: { team: "Sparta Prague", goals: 1.9, lambda: 1.9 },
    probabilities: { home: 0.15, draw: 0.22, away: 0.63 },
    finalPrediction: "Sparta Prague Win",
    qualification: {
      actionableMarket: {
        market: "1X2",
        selection: "Sparta Prague Win",
        label: "Sparta Prague Win",
        modelProbability: 0.63,
        tier: "PRIMARY",
      } as any,
      rankedActionable: [],
      evaluatedCount: 7,
      disqualifiedCount: 1,
    },
  });

  // Council verifies competition identity and respects relative league quality
  const crossCompPayload = {
    ...validCouncilPayload,
    identityCheck: {
      status: "PASS" as const,
      homeConfidence: 95,
      awayConfidence: 96,
      competitionConfidence: 94,
      notes: ["UEFA Conference League qualifying fixture confirmed."],
    },
    teamStrength: {
      home: { relative: "WEAKER" as const, rationale: "Armenian Premier League coefficient vs Czech top flight." },
      away: { relative: "STRONGER" as const, rationale: "Sparta Prague possesses superior European squad depth." },
      strengthGap: "AWAY_CLEAR" as const,
      opponentQualityAdjustment: "Cross-competition prior properly discounts domestic stats.",
    },
    chair: {
      ...validCouncilPayload.chair,
      summary: "Sparta Prague away strength clear across continental qualifiers.",
      decision: "SUPPORT" as const,
      severity: "NORMAL" as const,
    },
    analystCall: {
      status: "ACTIVE" as const,
      market: "1X2",
      selection: "Sparta Prague Win",
      callType: "AWAY_WIN" as const,
      rationale: "Sparta Prague cross-competition depth holds.",
      conviction: "HIGH" as const,
      evidenceQuality: "GOOD" as const,
      divergenceFromQuantitativeLeader: false,
      divergenceReason: "",
      guardrails: [],
    },
  };

  const { panel } = cleanPanel(crossCompPayload, "gemini-3.8-flash", analysis);
  const appResult = applyAnalystDecision(analysis, panel);

  assert.equal(appResult.applied, true);
  assert.equal(analysis.finalPrediction, "Sparta Prague Win");
  assert.equal(panel.teamStrength.strengthGap, "AWAY_CLEAR");
});
