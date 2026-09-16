import type { AuthoritativeMatchAnalysis, MarketCandidate } from "./authoritative";
import type { MatchRow } from "./intelligence";

export type ExpertPanelDecision = "SUPPORT" | "CHALLENGE" | "REVALIDATE";
export type ExpertPanelSeverity = "NORMAL" | "MINOR" | "SIGNIFICANT" | "SEVERE";
export type AIAnalystCallType = "HOME_WIN" | "DRAW" | "AWAY_WIN" | "BTTS_YES" | "BTTS_NO" | "OVER_1_5" | "OVER_2_5" | "OVER_3_5" | "UNDER_1_5" | "UNDER_2_5" | "UNDER_3_5" | "DOUBLE_CHANCE" | "DNB";

export type AIAnalystCall = {
  status: "ACTIVE" | "FALLBACK";
  market: string;
  selection: string;
  callType: AIAnalystCallType | "OTHER";
  rationale: string;
  conviction: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  evidenceQuality: "LIMITED" | "MODERATE" | "GOOD" | "STRONG";
  quantitativeLeader: string;
  quantitativeProbability: number;
  divergenceFromQuantitativeLeader: boolean;
  divergenceReason: string;
  secondaryCall?: string;
  guardrails: string[];
};

export type FootballExpertPanel = {
  status: "ACTIVE" | "UNAVAILABLE" | "ERROR";
  provider: "GEMINI" | "NONE";
  model: string;
  generatedAt: string;
  architectureVersion: "gfi-ai-football-council-v2";
  identityCheck: { status: "PASS" | "WARN" | "FAIL"; homeConfidence: number; awayConfidence: number; competitionConfidence: number; notes: string[] };
  teamStrength: {
    home: { relative: "STRONGER" | "WEAKER" | "SIMILAR" | "UNKNOWN"; rationale: string };
    away: { relative: "STRONGER" | "WEAKER" | "SIMILAR" | "UNKNOWN"; rationale: string };
    strengthGap: "HOME_CLEAR" | "AWAY_CLEAR" | "CLOSE" | "UNKNOWN";
    opponentQualityAdjustment: string;
  };
  realityCheck: { status: "COHERENT" | "TENSION" | "SEVERE_TENSION"; score: number; flags: string[] };
  panel: Array<{ role: string; name: string; stance: "HOME" | "DRAW" | "AWAY" | "GOALS" | "BTTS" | "NEUTRAL" | "REVALIDATE"; assessment: string; evidence: string[]; concern: string; question: string }>;
  debate: Array<{ speaker: string; challenges: string; response: string }>;
  chair: { summary: string; strongestCase: string; strongestCountercase: string; unresolvedQuestion: string; decision: ExpertPanelDecision; severity: ExpertPanelSeverity; revalidationReason: string };
  analystCall: AIAnalystCall;
  marketReview: { quantitativeLeader: string; selectedMarket: string; panelView: string; alternatives: string[] };
  limitations: string[];
};

type PanelInput = { fixture: MatchRow; analysis: AuthoritativeMatchAnalysis; evidenceFacts?: Array<{ title: string; factType: string; sourceDomain: string; sourceUrl: string }> };

const emptyPanel = (status: FootballExpertPanel["status"], model: string, note: string, analysis?: AuthoritativeMatchAnalysis): FootballExpertPanel => {
  const fallback = analysis?.qualification?.actionableMarket;
  return {
    status, provider: "NONE", model, generatedAt: new Date().toISOString(), architectureVersion: "gfi-ai-football-council-v2",
    identityCheck: { status: "WARN", homeConfidence: 0, awayConfidence: 0, competitionConfidence: 0, notes: [note] },
    teamStrength: { home: { relative: "UNKNOWN", rationale: note }, away: { relative: "UNKNOWN", rationale: note }, strengthGap: "UNKNOWN", opponentQualityAdjustment: note },
    realityCheck: { status: "TENSION", score: 0, flags: [note] }, panel: [], debate: [],
    chair: { summary: note, strongestCase: "AI council unavailable.", strongestCountercase: "AI council unavailable.", unresolvedQuestion: "Current team strength versus statistical context remains unresolved.", decision: "REVALIDATE", severity: "SIGNIFICANT", revalidationReason: note },
    analystCall: { status: "FALLBACK", market: fallback?.market ?? "QUANTITATIVE", selection: fallback?.label ?? analysis?.finalPrediction ?? "Quantitative engine result", callType: "OTHER", rationale: "The AI council was unavailable, so the validated quantitative selection was retained.", conviction: "LOW", evidenceQuality: "LIMITED", quantitativeLeader: fallback?.label ?? analysis?.finalPrediction ?? "Not supplied", quantitativeProbability: Math.round((fallback?.modelProbability ?? 0) * 100), divergenceFromQuantitativeLeader: false, divergenceReason: "", guardrails: [note] },
    marketReview: { quantitativeLeader: fallback?.label ?? analysis?.finalPrediction ?? "", selectedMarket: fallback?.label ?? analysis?.finalPrediction ?? "", panelView: "AI unavailable; quantitative selection retained.", alternatives: [] }, limitations: [note],
  };
};

function safeNumber(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
const clampPct = (v: unknown) => Math.max(0, Math.min(100, safeNumber(v)));
const text = (v: unknown, fallback = "") => typeof v === "string" ? v : fallback;

function marketSurface(analysis: AuthoritativeMatchAnalysis): Array<{ market: string; selection: string; probability: number; qualification: string }> {
  const candidates = Array.isArray(analysis.marketCandidates) ? analysis.marketCandidates : [];
  const rows = candidates.filter((c: MarketCandidate) => Number.isFinite(c.modelProbability)).map((c: MarketCandidate) => ({ market: c.market, selection: c.selection, probability: Math.round(c.modelProbability * 100), qualification: c.qualificationStatus }));
  const seen = new Set(rows.map((r) => `${r.market}|${r.selection}`));
  const oneX2 = [
    { market: "HOME", selection: `${analysis.home.team} Win`, probability: Math.round(analysis.probabilities.home * 100), qualification: "MODEL" },
    { market: "DRAW", selection: "Draw", probability: Math.round(analysis.probabilities.draw * 100), qualification: "MODEL" },
    { market: "AWAY", selection: `${analysis.away.team} Win`, probability: Math.round(analysis.probabilities.away * 100), qualification: "MODEL" },
  ];
  for (const row of oneX2) { const key = `${row.market}|${row.selection}`; if (!seen.has(key)) { rows.push(row); seen.add(key); } }
  return rows.sort((a, b) => b.probability - a.probability).slice(0, 32);
}

function cleanPanel(value: any, model: string, analysis: AuthoritativeMatchAnalysis): FootballExpertPanel {
  const raw = value && typeof value === "object" ? value : {};
  const surface = marketSurface(analysis);
  const allowedSelections = new Set(surface.map((x) => x.selection));
  const requestedSelection = text(raw.analystCall?.selection || raw.marketReview?.selectedMarket);
  const selected = allowedSelections.has(requestedSelection) ? requestedSelection : "";
  const quantitativeLeader = surface[0]?.selection ?? analysis.finalPrediction;
  const selectedRow = surface.find((x) => x.selection === selected);
  const fallbackRow = surface.find((x) => x.selection === quantitativeLeader);
  const finalSelection = selected || fallbackRow?.selection || analysis.finalPrediction;
  const finalRow = selectedRow || fallbackRow;
  const callType = ["HOME_WIN", "DRAW", "AWAY_WIN", "BTTS_YES", "BTTS_NO", "OVER_1_5", "OVER_2_5", "OVER_3_5", "UNDER_1_5", "UNDER_2_5", "UNDER_3_5", "DOUBLE_CHANCE", "DNB"].includes(raw.analystCall?.callType) ? raw.analystCall.callType : "OTHER";
  const panel = Array.isArray(raw.panel) ? raw.panel : [];
  const debate = Array.isArray(raw.debate) ? raw.debate : [];
  const alternatives = Array.isArray(raw.marketReview?.alternatives) ? raw.marketReview.alternatives : [];
  const notes = Array.isArray(raw.identityCheck?.notes) ? raw.identityCheck.notes : [];
  const flags = Array.isArray(raw.realityCheck?.flags) ? raw.realityCheck.flags : [];
  const limitations = Array.isArray(raw.limitations) ? raw.limitations : [];
  const validRelative = (v: unknown): "STRONGER" | "WEAKER" | "SIMILAR" | "UNKNOWN" => v === "STRONGER" || v === "WEAKER" || v === "SIMILAR" ? v : "UNKNOWN";
  const validStance = (v: unknown): "HOME" | "DRAW" | "AWAY" | "GOALS" | "BTTS" | "NEUTRAL" | "REVALIDATE" => ["HOME", "DRAW", "AWAY", "GOALS", "BTTS", "NEUTRAL", "REVALIDATE"].includes(String(v)) ? v as any : "NEUTRAL";
  const severity = ["NORMAL", "MINOR", "SIGNIFICANT", "SEVERE"].includes(raw.chair?.severity) ? raw.chair.severity : "SIGNIFICANT";
  const decision: ExpertPanelDecision = ["SUPPORT", "CHALLENGE", "REVALIDATE"].includes(raw.chair?.decision) ? raw.chair.decision : "REVALIDATE";
  const realityStatus = ["COHERENT", "TENSION", "SEVERE_TENSION"].includes(raw.realityCheck?.status) ? raw.realityCheck.status : "TENSION";
  const identityStatus = ["PASS", "WARN", "FAIL"].includes(raw.identityCheck?.status) ? raw.identityCheck.status : "WARN";
  const conviction = ["LOW", "MODERATE", "HIGH", "VERY_HIGH"].includes(raw.analystCall?.conviction) ? raw.analystCall.conviction : "MODERATE";
  const evidenceQuality = ["LIMITED", "MODERATE", "GOOD", "STRONG"].includes(raw.analystCall?.evidenceQuality) ? raw.analystCall.evidenceQuality : "LIMITED";
  const divergence = finalSelection !== quantitativeLeader;
  const safeGuardrails = Array.isArray(raw.analystCall?.guardrails) ? raw.analystCall.guardrails : [];
  return {
    status: "ACTIVE", provider: "GEMINI", model, generatedAt: new Date().toISOString(), architectureVersion: "gfi-ai-football-council-v2",
    identityCheck: { status: identityStatus, homeConfidence: clampPct(raw.identityCheck?.homeConfidence), awayConfidence: clampPct(raw.identityCheck?.awayConfidence), competitionConfidence: clampPct(raw.identityCheck?.competitionConfidence), notes: notes.filter((x: unknown): x is string => typeof x === "string").slice(0, 8) },
    teamStrength: { home: { relative: validRelative(raw.teamStrength?.home?.relative), rationale: text(raw.teamStrength?.home?.rationale, "No supported assessment supplied.") }, away: { relative: validRelative(raw.teamStrength?.away?.relative), rationale: text(raw.teamStrength?.away?.rationale, "No supported assessment supplied.") }, strengthGap: ["HOME_CLEAR", "AWAY_CLEAR", "CLOSE", "UNKNOWN"].includes(raw.teamStrength?.strengthGap) ? raw.teamStrength.strengthGap : "UNKNOWN", opponentQualityAdjustment: text(raw.teamStrength?.opponentQualityAdjustment, "Opponent-quality adjustment not established from supplied evidence.") },
    realityCheck: { status: realityStatus, score: clampPct(raw.realityCheck?.score), flags: flags.filter((x: unknown): x is string => typeof x === "string").slice(0, 10) },
    panel: panel.slice(0, 8).map((x: any) => ({ role: text(x?.role, "Expert"), name: text(x?.name, "Analyst"), stance: validStance(x?.stance), assessment: text(x?.assessment, "No assessment."), evidence: Array.isArray(x?.evidence) ? x.evidence.filter((y: unknown): y is string => typeof y === "string").slice(0, 5) : [], concern: text(x?.concern, "None stated."), question: text(x?.question, "No question.") })),
    debate: debate.slice(0, 10).map((x: any) => ({ speaker: text(x?.speaker, "Panel"), challenges: text(x?.challenges, ""), response: text(x?.response, "") })),
    chair: { summary: text(raw.chair?.summary, "The council did not produce a reliable synthesis."), strongestCase: text(raw.chair?.strongestCase, "Not supplied."), strongestCountercase: text(raw.chair?.strongestCountercase, "Not supplied."), unresolvedQuestion: text(raw.chair?.unresolvedQuestion, "Not supplied."), decision, severity, revalidationReason: text(raw.chair?.revalidationReason, "") },
    analystCall: { status: "ACTIVE", market: selectedRow?.market ?? fallbackRow?.market ?? "QUANTITATIVE", selection: finalSelection, callType: callType as AIAnalystCallType | "OTHER", rationale: text(raw.analystCall?.rationale, "The council selected the strongest supported market from the computed market surface."), conviction, evidenceQuality, quantitativeLeader, quantitativeProbability: finalRow?.probability ?? 0, divergenceFromQuantitativeLeader: divergence, divergenceReason: divergence ? text(raw.analystCall?.divergenceReason, "The council judged the quantitative leader less informative than the selected football conclusion.") : "", secondaryCall: text(raw.analystCall?.secondaryCall) || undefined, guardrails: safeGuardrails.filter((x: unknown): x is string => typeof x === "string").slice(0, 8) },
    marketReview: { quantitativeLeader, selectedMarket: finalSelection, panelView: text(raw.marketReview?.panelView, "Council synthesis complete."), alternatives: alternatives.filter((x: unknown): x is string => typeof x === "string").filter((x) => allowedSelections.has(x)).slice(0, 6) },
    limitations: limitations.filter((x: unknown): x is string => typeof x === "string").slice(0, 10),
  };
}

function applyAnalystDecision(analysis: AuthoritativeMatchAnalysis, panel: FootballExpertPanel) {
  if (panel.status !== "ACTIVE" || panel.analystCall.status !== "ACTIVE") return;
  if (panel.identityCheck.status === "FAIL" || panel.chair.severity === "SEVERE") return;
  const selection = panel.analystCall.selection;
  if (!selection) return;
  analysis.finalPrediction = selection;
  if (selection === `${analysis.home.team} Win`) analysis.decision = "HOME EDGE";
  else if (selection === `${analysis.away.team} Win`) analysis.decision = "AWAY EDGE";
  else if (selection === "Draw") analysis.decision = "DRAW LEAN";
  else analysis.decision = "NO STRONG EDGE";
  analysis.verdict = analysis.decision;
  analysis.aiReasoningPacket = {
    ...analysis.aiReasoningPacket,
    aiRole: "AI_FOOTBALL_ANALYST_COUNCIL_WITH_CONTROLLED_DECISION_AUTHORITY",
    aiAnalystCall: panel.analystCall,
    quantitativeLeaderBeforeAI: panel.analystCall.quantitativeLeader,
    aiDecisionAuthority: true,
  };
}

function compactEngineDigest(analysis: AuthoritativeMatchAnalysis) {
  return analysis.engines.map((e) => ({
    id: e.id,
    name: e.name,
    signal: e.signal,
    confidence: e.confidence,
    quality: e.quality,
    version: e.version,
    probabilities: e.probabilities,
  })).slice(0, 20);
}

export async function runFootballExpertPanel(input: PanelInput): Promise<FootballExpertPanel> {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  if (!key) return emptyPanel("UNAVAILABLE", model, "GEMINI_API_KEY/GOOGLE_API_KEY is not configured; the validated quantitative result was retained.", input.analysis);

  const { fixture, analysis, evidenceFacts = [] } = input;
  const surface = marketSurface(analysis);
  // Do not send raw engine values/arrays to Gemini. They can be very large and add
  // latency without adding useful football reasoning signal. The council receives
  // the already-computed market surface plus compact model-family probabilities.
  const engineDigest = compactEngineDigest(analysis);
  const packet = {
    fixture: {
      home: fixture.home,
      away: fixture.away,
      date: fixture.date,
      time: fixture.time,
      competition: fixture.league,
      competitionCode: fixture.sourceId,
    },
    marketSurface: surface,
    authoritative: {
      decision: analysis.decision,
      finalPrediction: analysis.finalPrediction,
      predictedScore: analysis.predictedScore,
      risk: analysis.risk,
      quality: analysis.quality,
      consensus: analysis.consensus,
      probabilities: analysis.probabilities,
      qualification: analysis.qualification,
    },
    teams: {
      home: analysis.home,
      away: analysis.away,
    },
    engines: engineDigest,
    researchFacts: evidenceFacts.slice(0, 15),
    evidence: {
      metrics: analysis.evidenceMetrics,
      state: analysis.evidenceState,
      pipeline: (analysis as any).pipeline,
      warnings: analysis.warnings.slice(0, 10),
    },
  };

  const system = `You are the AI Football Analyst Council inside a serious football-intelligence application. Reason like an elite multidisciplinary football analysis room, not a probability sorter. The deterministic model is the mathematical evidence layer, but the council has analytical authority to select the final football market from the supplied market surface.

You may select HOME WIN, DRAW, AWAY WIN, BTTS, OVER/UNDER, DNB, DOUBLE CHANCE or another listed computed market when supported. You MUST NOT invent a market, alter supplied probabilities, or fabricate injuries, lineups, xG, odds, rankings, transfers, league strengths, news or team facts. If a fact is absent, say UNKNOWN.

Eight roles must contribute: Team Strength Scout; Tactical Analyst; Statistical Analyst; Form & Trajectory Analyst; Context & Motivation Analyst; Competition Strength Analyst; Data Forensic Analyst; Contrarian Analyst.

Process: verify fixture identity and competition; assess relative team strength and opponent quality; interrogate the complete market surface; debate the strongest disagreement; then have the Chair choose the most informative football conclusion rather than automatically choosing the safest market. A high-probability safe market may be rejected for a directional outcome when supported. Conversely, do not force a winner when goals/BTTS is better supported.

Guardrails: identity FAIL or severe contamination => REVALIDATE and retain the quantitative result as fallback. Identity PASS/WARN with coherent evidence permits any supported computed market. Limited evidence does not automatically mean NO_TRADE. Do not majority-vote mechanically; weigh evidence quality, specialist expertise, contradiction severity and football plausibility.

Return JSON only. Exactly eight panel experts. Keep each expert assessment concise, use at most two evidence bullets per expert, keep debate to at most four exchanges, and keep the Chair synthesis concise. The final analystCall.selection must exactly match one selection from marketSurface. Conviction is qualitative, not event probability.`;

  const user = `Determine the strongest football conclusion for this fixture, even if it is NOT the highest raw probability market. The council must be willing to choose Home Win, Draw or Away Win when team-strength/tactical/context evidence makes that more informative, and must be willing to choose goals/BTTS when direction is not sufficiently supported.\n\nPACKET:\n${JSON.stringify(packet)}`;

  try {
    const controller = new AbortController();
    // High thinking was combined with a 25s hard cutoff. Gemini documentation notes
    // that high thinking can take significantly longer. Medium is the production
    // default for 3.8 Flash and is appropriate for this structured council task.
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "medium" },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const detail = errorBody.replace(/\s+/g, " ").slice(0, 240);
      return emptyPanel("ERROR", model, `Gemini council request failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}; quantitative analysis was preserved.`, analysis);
    }

    const body = await response.json() as any;
    const rawText = body?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ?? "";
    if (!rawText) return emptyPanel("ERROR", model, "Gemini returned no council content; quantitative analysis was preserved.", analysis);

    const parsed = JSON.parse(rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));
    const panel = cleanPanel(parsed, model, analysis);
    applyAnalystDecision(analysis, panel);
    return panel;
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Gemini football council timed out after 45 seconds."
      : `Gemini football council failed safely${error instanceof Error && error.message ? `: ${error.message.slice(0, 180)}` : "."}`;
    return emptyPanel("ERROR", model, message, analysis);
  }
}
