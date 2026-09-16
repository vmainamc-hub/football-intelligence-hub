import type { AuthoritativeMatchAnalysis, MarketCandidate } from "./authoritative";
import type { MatchRow } from "./intelligence";

export type ExpertPanelDecision = "SUPPORT" | "CHALLENGE" | "REVALIDATE";
export type ExpertPanelSeverity = "NORMAL" | "MINOR" | "SIGNIFICANT" | "SEVERE";
export type AuthoritativeDivergenceState = "AGREE" | "DIVERGE" | "REVALIDATE" | "INCOMPLETE";

export type SpecialistReport = {
  role: string;
  name: string;
  status: "ACTIVE" | "LIMITED_EVIDENCE" | "INSUFFICIENT_DATA";
  stance: "HOME" | "DRAW" | "AWAY" | "GOALS" | "BTTS" | "NEUTRAL" | "REVALIDATE";
  assessment: string;
  evidence: string[];
  confidence: number;
  recommendation: "SUPPORT" | "CHALLENGE" | "REVALIDATE";
  concern?: string;
  question?: string;
  details?: Record<string, any>;
};

export type ContrarianChallenge = {
  quantitativeLeaderChallenged: string;
  challengeQuestion: string;
  strongestAlternative: string;
  evidenceForAlternative: string;
  evidenceAgainstAlternative: string;
  verdict: "CHALLENGE_SUCCEEDED" | "CHALLENGE_REJECTED" | "ALTERNATIVE_INFORMATIVE" | "UNRESOLVED";
  chairResponse: string;
};

export type CouncilCompleteness = {
  isComplete: boolean;
  reasons: string[];
  missingSpecialists: string[];
  teamStrengthValid: boolean;
  tacticalValid: boolean;
  statisticalValid: boolean;
  formTrajectoryValid: boolean;
  contextMotivationValid: boolean;
  competitionStrengthValid: boolean;
  dataForensicValid: boolean;
  contrarianValid: boolean;
  debateValid: boolean;
  chairValid: boolean;
  analystCallValid: boolean;
};

export type AIAnalystCallType =
  | "HOME_WIN"
  | "DRAW"
  | "AWAY_WIN"
  | "BTTS_YES"
  | "BTTS_NO"
  | "OVER_1_5"
  | "OVER_2_5"
  | "OVER_3_5"
  | "UNDER_1_5"
  | "UNDER_2_5"
  | "UNDER_3_5"
  | "DOUBLE_CHANCE"
  | "DNB";

export type AIDivergenceReason =
  | "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL"
  | "RECENT_TRAJECTORY_OVERRIDES_LONG_TERM_BASELINE"
  | "OPPONENT_ADJUSTED_STRENGTH_GAP"
  | "TACTICAL_MISMATCH_SUPPORTS_DIRECTION"
  | "BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL"
  | "QUANTITATIVE_LEADER_TOO_BROAD"
  | "NO_DIRECTIONAL_EDGE_RETAINED_TOTALS"
  | "NONE";

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
  quantitativeLeaderProbability?: number;
  safeAlternative: string;
  divergenceFromQuantitativeLeader: boolean;
  divergenceReason: string;
  divergenceReasonCode?: AIDivergenceReason;
  secondaryCall?: string;
  guardrails: string[];
};
export type CouncilDiagnosticAttempt = {
  attempt: number;
  model: string;
  status: number | string;
  elapsedMs: number;
  reachedGemini: boolean;
  responseBodyReceived: boolean;
  jsonParsed: boolean;
  candidatesReturned: boolean;
  structuredOutputValid: boolean;
  cleanPanelRejectedAnything: boolean;
  decisionApplied: boolean;
  error?: string;
};
export type FootballExpertPanel = {
  status: "ACTIVE" | "UNAVAILABLE" | "ERROR";
  executionState: "AVAILABLE" | "UNAVAILABLE" | "ERROR";
  divergenceState: AuthoritativeDivergenceState;
  provider: "GEMINI" | "NONE";
  model: string;
  generatedAt: string;
  architectureVersion: "gfi-ai-football-council-v2";
  fallbackModelUsed?: boolean;
  retryAttempts?: number;
  diagnostics?: {
    attempts: CouncilDiagnosticAttempt[];
    resolvedAttempt?: number;
    finalStatus: string;
    decisionApplied: boolean;
  };
  identityCheck: {
    status: "PASS" | "WARN" | "FAIL";
    homeConfidence: number;
    awayConfidence: number;
    competitionConfidence: number;
    notes: string[];
  };
  teamStrength: {
    home: { relative: "STRONGER" | "WEAKER" | "SIMILAR" | "UNKNOWN"; rationale: string };
    away: { relative: "STRONGER" | "WEAKER" | "SIMILAR" | "UNKNOWN"; rationale: string };
    strengthGap: "HOME_CLEAR" | "AWAY_CLEAR" | "CLOSE" | "UNKNOWN";
    opponentQualityAdjustment: string;
  };
  realityCheck: {
    status: "COHERENT" | "TENSION" | "SEVERE_TENSION" | "LIMITED_EVIDENCE";
    score?: number;
    flags: string[];
  };
  specialists?: {
    teamStrengthScout: SpecialistReport;
    tacticalAnalyst: SpecialistReport;
    statisticalAnalyst: SpecialistReport;
    formTrajectoryAnalyst: SpecialistReport;
    contextMotivationAnalyst: SpecialistReport;
    competitionStrengthAnalyst: SpecialistReport;
    dataForensicAnalyst: SpecialistReport;
    contrarianAnalyst: SpecialistReport;
  };
  contrarianChallenge?: ContrarianChallenge;
  panel: SpecialistReport[];
  debate: Array<{ speaker: string; challenges: string; response: string }>;
  chair: {
    summary: string;
    strongestCase: string;
    strongestCountercase: string;
    unresolvedQuestion: string;
    quantitativeLeader?: string;
    analystConclusion?: string;
    decision: ExpertPanelDecision;
    severity: ExpertPanelSeverity;
    revalidationReason: string;
    divergenceExplanation?: string;
  };
  analystCall: AIAnalystCall;
  marketReview: {
    quantitativeLeader: string;
    selectedMarket: string;
    safeAlternative: string;
    panelView: string;
    alternatives: string[];
  };
  limitations: string[];
};
export type PanelInput = {
  fixture: MatchRow;
  analysis: AuthoritativeMatchAnalysis;
  evidenceFacts?: Array<{
    title: string;
    factType: string;
    sourceDomain: string;
    sourceUrl: string;
  }>;
  options?: {
    fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
    sleepFn?: (ms: number) => Promise<void>;
    primaryModel?: string;
    fallbackModel?: string;
  };
};
const n = (v: unknown, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const pct = (v: unknown) => Math.max(0, Math.min(100, n(v)));
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
export function marketSurface(a: AuthoritativeMatchAnalysis) {
  const rows = (Array.isArray(a.marketCandidates) ? a.marketCandidates : [])
    .filter((c: MarketCandidate) => Number.isFinite(c.modelProbability))
    .map((c) => ({
      market: c.market,
      selection: c.selection,
      probability: Math.round(c.modelProbability * 100),
      qualification: c.qualificationStatus,
    }));
  const seen = new Set(rows.map((r) => `${r.market}|${r.selection}`));
  for (const r of [
    {
      market: "HOME",
      selection: `${a.home.team} Win`,
      probability: Math.round(a.probabilities.home * 100),
      qualification: "MODEL",
    },
    {
      market: "DRAW",
      selection: "Draw",
      probability: Math.round(a.probabilities.draw * 100),
      qualification: "MODEL",
    },
    {
      market: "AWAY",
      selection: `${a.away.team} Win`,
      probability: Math.round(a.probabilities.away * 100),
      qualification: "MODEL",
    },
  ]) {
    const k = `${r.market}|${r.selection}`;
    if (!seen.has(k)) {
      rows.push(r);
      seen.add(k);
    }
  }
  return rows.sort((x, y) => y.probability - x.probability).slice(0, 32);
}
export const MANDATORY_SPECIALIST_DEFS = [
  { key: "teamStrengthScout", role: "Team Strength Scout", name: "Team Strength Scout" },
  { key: "tacticalAnalyst", role: "Tactical Analyst", name: "Tactical Analyst" },
  { key: "statisticalAnalyst", role: "Statistical Analyst", name: "Statistical Analyst" },
  { key: "formTrajectoryAnalyst", role: "Form & Trajectory Analyst", name: "Form & Trajectory Analyst" },
  { key: "contextMotivationAnalyst", role: "Context & Motivation Analyst", name: "Context & Motivation Analyst" },
  { key: "competitionStrengthAnalyst", role: "Competition Strength Analyst", name: "Competition Strength Analyst" },
  { key: "dataForensicAnalyst", role: "Data Forensic Analyst", name: "Data Forensic Analyst" },
  { key: "contrarianAnalyst", role: "Contrarian Analyst", name: "Contrarian Analyst" },
] as const;

export function findSpecialist(raw: any, key: string, roleName: string): any {
  if (raw?.specialists && typeof raw.specialists[key] === "object" && raw.specialists[key] !== null) {
    return raw.specialists[key];
  }
  if (Array.isArray(raw?.panel)) {
    const target = roleName.toLowerCase();
    const found = raw.panel.find((s: any) => {
      const r = String(s?.role || "").toLowerCase();
      if (r === target) return true;
      if (key === "teamStrengthScout" && r.includes("team strength")) return true;
      if (key === "tacticalAnalyst" && r.includes("tactic")) return true;
      if (key === "statisticalAnalyst" && r.includes("statistic")) return true;
      if (key === "formTrajectoryAnalyst" && (r.includes("form") || r.includes("trajectory"))) return true;
      if (key === "contextMotivationAnalyst" && (r.includes("context") || r.includes("motivation"))) return true;
      if (key === "competitionStrengthAnalyst" && (r.includes("competition") || r.includes("league tier"))) return true;
      if (key === "dataForensicAnalyst" && (r.includes("forensic") || r.includes("data integrity"))) return true;
      if (key === "contrarianAnalyst" && (r.includes("contrarian") || r.includes("devil"))) return true;
      return false;
    });
    if (found) return found;
  }
  return null;
}

export function isSpecialistSubstantive(s: any): boolean {
  if (!s || typeof s !== "object") return false;
  const assessment = typeof s.assessment === "string" ? s.assessment.trim() : "";
  if (assessment.length < 15) return false;
  const lower = assessment.toLowerCase();
  if (
    lower === "not supplied." ||
    lower === "not supplied" ||
    lower === "no assessment." ||
    lower === "none" ||
    lower === "assessment unavailable." ||
    lower === "unknown"
  ) {
    return false;
  }
  return true;
}

export function isChairSubstantive(chair: any): boolean {
  if (!chair || typeof chair !== "object") return false;
  const summary = typeof chair.summary === "string" ? chair.summary.trim() : "";
  if (summary.length < 15) return false;
  const lower = summary.toLowerCase();
  if (
    lower.includes("council synthesis unavailable") ||
    lower.includes("not supplied") ||
    lower === "none"
  ) {
    return false;
  }
  return true;
}

export function validateCouncilCompleteness(raw: any, quantitativeLeader = ""): CouncilCompleteness {
  const missingSpecialists: string[] = [];
  const reasons: string[] = [];

  const teamStrengthScout = findSpecialist(raw, "teamStrengthScout", "Team Strength Scout");
  const tacticalAnalyst = findSpecialist(raw, "tacticalAnalyst", "Tactical Analyst");
  const statisticalAnalyst = findSpecialist(raw, "statisticalAnalyst", "Statistical Analyst");
  const formTrajectoryAnalyst = findSpecialist(raw, "formTrajectoryAnalyst", "Form & Trajectory Analyst");
  const contextMotivationAnalyst = findSpecialist(raw, "contextMotivationAnalyst", "Context & Motivation Analyst");
  const competitionStrengthAnalyst = findSpecialist(raw, "competitionStrengthAnalyst", "Competition Strength Analyst");
  const dataForensicAnalyst = findSpecialist(raw, "dataForensicAnalyst", "Data Forensic Analyst");
  const contrarianAnalyst = findSpecialist(raw, "contrarianAnalyst", "Contrarian Analyst");

  const teamStrengthValid = isSpecialistSubstantive(teamStrengthScout);
  if (!teamStrengthValid) {
    missingSpecialists.push("Team Strength Scout");
    reasons.push("Team Strength Scout assessment missing or empty");
  }

  const tacticalValid = isSpecialistSubstantive(tacticalAnalyst);
  if (!tacticalValid) {
    missingSpecialists.push("Tactical Analyst");
    reasons.push("Tactical Analyst assessment missing or empty");
  }

  const statisticalValid = isSpecialistSubstantive(statisticalAnalyst);
  if (!statisticalValid) {
    missingSpecialists.push("Statistical Analyst");
    reasons.push("Statistical Analyst assessment missing or empty");
  }

  const formTrajectoryValid = isSpecialistSubstantive(formTrajectoryAnalyst);
  if (!formTrajectoryValid) {
    missingSpecialists.push("Form & Trajectory Analyst");
    reasons.push("Form & Trajectory Analyst assessment missing or empty");
  }

  const contextMotivationValid = isSpecialistSubstantive(contextMotivationAnalyst);
  if (!contextMotivationValid) {
    missingSpecialists.push("Context & Motivation Analyst");
    reasons.push("Context & Motivation Analyst assessment missing or empty");
  }

  const competitionStrengthValid = isSpecialistSubstantive(competitionStrengthAnalyst);
  if (!competitionStrengthValid) {
    missingSpecialists.push("Competition Strength Analyst");
    reasons.push("Competition Strength Analyst assessment missing or empty");
  }

  const dataForensicValid = isSpecialistSubstantive(dataForensicAnalyst);
  if (!dataForensicValid) {
    missingSpecialists.push("Data Forensic Analyst");
    reasons.push("Data Forensic Analyst assessment missing or empty");
  }

  const contrarianValid = isSpecialistSubstantive(contrarianAnalyst);
  if (!contrarianValid) {
    missingSpecialists.push("Contrarian Analyst");
    reasons.push("Contrarian Analyst assessment missing or empty");
  }

  const debateValid = Array.isArray(raw?.debate);
  if (!debateValid) {
    reasons.push("Debate array missing");
  }

  const chairValid = isChairSubstantive(raw?.chair);
  if (!chairValid) {
    reasons.push("Chair synthesis missing or incomplete");
  }

  const analystCallValid = Boolean(
    raw?.analystCall &&
      typeof raw.analystCall.selection === "string" &&
      raw.analystCall.selection.trim().length > 0,
  );
  if (!analystCallValid) {
    reasons.push("Analyst call selection missing");
  }

  const specialistsComplete =
    teamStrengthValid &&
    tacticalValid &&
    statisticalValid &&
    formTrajectoryValid &&
    contextMotivationValid &&
    competitionStrengthValid &&
    dataForensicValid &&
    contrarianValid;

  const isComplete = specialistsComplete && debateValid && chairValid && analystCallValid;

  return {
    isComplete,
    reasons,
    missingSpecialists,
    teamStrengthValid,
    tacticalValid,
    statisticalValid,
    formTrajectoryValid,
    contextMotivationValid,
    competitionStrengthValid,
    dataForensicValid,
    contrarianValid,
    debateValid,
    chairValid,
    analystCallValid,
  };
}

export function computeDivergenceState(
  panelStatus: FootballExpertPanel["status"],
  chairDecision: ExpertPanelDecision,
  selectedMarket: string,
  quantitativeLeader: string,
  isComplete: boolean,
): AuthoritativeDivergenceState {
  if (!isComplete || panelStatus !== "ACTIVE") {
    return "INCOMPLETE";
  }
  if (chairDecision === "REVALIDATE") {
    return "REVALIDATE";
  }
  if (chairDecision === "SUPPORT" && selectedMarket === quantitativeLeader) {
    return "AGREE";
  }
  if (selectedMarket !== quantitativeLeader) {
    return "DIVERGE";
  }
  if (chairDecision === "CHALLENGE" && selectedMarket === quantitativeLeader) {
    return "REVALIDATE";
  }
  return "INCOMPLETE";
}

export const emptyPanel = (
  status: FootballExpertPanel["status"],
  model: string,
  note: string,
  analysis?: AuthoritativeMatchAnalysis,
  diagnostics?: FootballExpertPanel["diagnostics"],
): FootballExpertPanel => {
  const surface = analysis ? marketSurface(analysis) : [];
  const f = analysis?.qualification?.actionableMarket;
  const s = f?.label ?? analysis?.finalPrediction ?? surface[0]?.selection ?? "Quantitative engine result";
  return {
    status,
    executionState: status === "ACTIVE" ? "AVAILABLE" : status,
    divergenceState: "INCOMPLETE",
    provider: "NONE",
    model,
    generatedAt: new Date().toISOString(),
    architectureVersion: "gfi-ai-football-council-v2",
    fallbackModelUsed: false,
    retryAttempts: diagnostics?.attempts.length ?? 0,
    diagnostics,
    identityCheck: {
      status: "WARN",
      homeConfidence: 0,
      awayConfidence: 0,
      competitionConfidence: 0,
      notes: [note],
    },
    teamStrength: {
      home: { relative: "UNKNOWN", rationale: note },
      away: { relative: "UNKNOWN", rationale: note },
      strengthGap: "UNKNOWN",
      opponentQualityAdjustment: note,
    },
    realityCheck: { status: "LIMITED_EVIDENCE", score: undefined, flags: [note] },
    specialists: undefined,
    contrarianChallenge: {
      quantitativeLeaderChallenged: s,
      challengeQuestion: `Why might ${s} be the wrong final football conclusion?`,
      strongestAlternative: surface[1]?.selection ?? s,
      evidenceForAlternative: "Council unavailable for alternative evaluation.",
      evidenceAgainstAlternative: "Council unavailable.",
      verdict: "UNRESOLVED",
      chairResponse: note,
    },
    panel: [],
    debate: [],
    chair: {
      summary: note,
      strongestCase: "AI council unavailable.",
      strongestCountercase: "AI council unavailable.",
      unresolvedQuestion: "Team strength versus statistical context remains unresolved.",
      quantitativeLeader: s,
      analystConclusion: s,
      decision: "REVALIDATE",
      severity: "SIGNIFICANT",
      revalidationReason: note,
      divergenceExplanation: "Council unavailable; quantitative leader preserved.",
    },
    analystCall: {
      status: "FALLBACK",
      market: f?.market ?? "QUANTITATIVE",
      selection: s,
      callType: "OTHER",
      rationale:
        "The AI council was unavailable, so the validated quantitative selection was retained.",
      conviction: "LOW",
      evidenceQuality: "LIMITED",
      quantitativeLeader: s,
      quantitativeProbability: Math.round((f?.modelProbability ?? 0) * 100),
      quantitativeLeaderProbability: Math.round((f?.modelProbability ?? 0) * 100),
      safeAlternative: surface[1]?.selection ?? s,
      divergenceFromQuantitativeLeader: false,
      divergenceReason: "",
      divergenceReasonCode: "NONE",
      guardrails: [note],
    },
    marketReview: {
      quantitativeLeader: s,
      selectedMarket: s,
      safeAlternative: surface[1]?.selection ?? s,
      panelView: "AI unavailable; quantitative selection retained.",
      alternatives: [],
    },
    limitations: [note],
  };
};

export function cleanPanel(
  value: any,
  model: string,
  a: AuthoritativeMatchAnalysis,
  fallbackModelUsed = false,
  retryAttempts = 1,
  diagnostics?: FootballExpertPanel["diagnostics"],
): { panel: FootballExpertPanel; rejectedAnything: boolean; completeness: CouncilCompleteness } {
  let rejectedAnything = false;
  const raw = value && typeof value === "object" ? value : {};
  const surface = marketSurface(a);
  const allowed = new Set(surface.map((x) => x.selection));
  const requested = str(raw.analystCall?.selection || raw.marketReview?.selectedMarket);
  if (requested && !allowed.has(requested)) rejectedAnything = true;
  const q = surface[0]?.selection ?? a.finalPrediction;
  const qProb = surface[0]?.probability ?? Math.round((a.probabilities.home || 0) * 100);

  const completeness = validateCouncilCompleteness(raw, q);
  if (!completeness.isComplete) {
    rejectedAnything = true;
  }

  const selection = allowed.has(requested) && completeness.isComplete ? requested : q;
  const row = surface.find((x) => x.selection === selection);
  const isDivergent = completeness.isComplete && selection !== q;

  const validDivergenceCodes: AIDivergenceReason[] = [
    "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL",
    "RECENT_TRAJECTORY_OVERRIDES_LONG_TERM_BASELINE",
    "OPPONENT_ADJUSTED_STRENGTH_GAP",
    "TACTICAL_MISMATCH_SUPPORTS_DIRECTION",
    "BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL",
    "QUANTITATIVE_LEADER_TOO_BROAD",
    "NO_DIRECTIONAL_EDGE_RETAINED_TOTALS",
    "NONE",
  ];
  let divergenceReasonCode: AIDivergenceReason;
  if (isDivergent) {
    if (validDivergenceCodes.includes(raw.analystCall?.divergenceReasonCode)) {
      divergenceReasonCode = raw.analystCall.divergenceReasonCode;
    } else if (
      raw.analystCall?.callType === "HOME_WIN" ||
      raw.analystCall?.callType === "AWAY_WIN" ||
      raw.analystCall?.callType === "DRAW"
    ) {
      divergenceReasonCode = "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL";
    } else if (
      raw.analystCall?.callType === "BTTS_YES" ||
      raw.analystCall?.callType === "BTTS_NO"
    ) {
      divergenceReasonCode = "BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL";
    } else {
      divergenceReasonCode = "QUANTITATIVE_LEADER_TOO_BROAD";
    }
  } else {
    divergenceReasonCode =
      raw.analystCall?.divergenceReasonCode === "NO_DIRECTIONAL_EDGE_RETAINED_TOTALS"
        ? "NO_DIRECTIONAL_EDGE_RETAINED_TOTALS"
        : "NONE";
  }

  const alternatives = Array.isArray(raw.marketReview?.alternatives)
    ? raw.marketReview.alternatives
        .filter((x: any) => typeof x === "string" && allowed.has(x))
        .slice(0, 6)
    : [];
  const safeAlternative = isDivergent
    ? str(raw.analystCall?.safeAlternative) || q
    : str(raw.analystCall?.safeAlternative) || alternatives[0] || (surface[1]?.selection ?? q);
  const divergenceReason = isDivergent
    ? str(
        raw.analystCall?.divergenceReason,
        "The council judged the directional or specific football signal more informative than the broad quantitative leader.",
      )
    : "";

  const rel = (v: any) => (v === "STRONGER" || v === "WEAKER" || v === "SIMILAR" ? v : "UNKNOWN");
  const stance = (v: any) =>
    ["HOME", "DRAW", "AWAY", "GOALS", "BTTS", "NEUTRAL", "REVALIDATE"].includes(String(v))
      ? v
      : "NEUTRAL";
  const id = ["PASS", "WARN", "FAIL"].includes(raw.identityCheck?.status)
    ? raw.identityCheck.status
    : "WARN";

  let realityScore: number | undefined = undefined;
  if (
    raw.realityCheck?.score !== undefined &&
    raw.realityCheck?.score !== null &&
    !isNaN(Number(raw.realityCheck.score))
  ) {
    realityScore = Math.max(0, Math.min(100, Math.round(Number(raw.realityCheck.score))));
  }
  const reality = ["COHERENT", "TENSION", "SEVERE_TENSION", "LIMITED_EVIDENCE"].includes(
    raw.realityCheck?.status,
  )
    ? raw.realityCheck.status
    : realityScore !== undefined
      ? "TENSION"
      : "LIMITED_EVIDENCE";

  const severity = ["NORMAL", "MINOR", "SIGNIFICANT", "SEVERE"].includes(raw.chair?.severity)
    ? raw.chair.severity
    : "SIGNIFICANT";
  const decision: ExpertPanelDecision = ["SUPPORT", "CHALLENGE", "REVALIDATE"].includes(
    raw.chair?.decision,
  )
    ? raw.chair.decision
    : "REVALIDATE";
  const conviction = ["LOW", "MODERATE", "HIGH", "VERY_HIGH"].includes(raw.analystCall?.conviction)
    ? raw.analystCall.conviction
    : "MODERATE";
  const evidenceQuality = ["LIMITED", "MODERATE", "GOOD", "STRONG"].includes(
    raw.analystCall?.evidenceQuality,
  )
    ? raw.analystCall.evidenceQuality
    : "LIMITED";
  const validCalls = [
    "HOME_WIN",
    "DRAW",
    "AWAY_WIN",
    "BTTS_YES",
    "BTTS_NO",
    "OVER_1_5",
    "OVER_2_5",
    "OVER_3_5",
    "UNDER_1_5",
    "UNDER_2_5",
    "UNDER_3_5",
    "DOUBLE_CHANCE",
    "DNB",
  ];
  const notes = Array.isArray(raw.identityCheck?.notes)
    ? raw.identityCheck.notes.filter((x: any) => typeof x === "string").slice(0, 8)
    : [];
  const flags = Array.isArray(raw.realityCheck?.flags)
    ? raw.realityCheck.flags.filter((x: any) => typeof x === "string").slice(0, 10)
    : [];

  const panelStatus: FootballExpertPanel["status"] = completeness.isComplete ? "ACTIVE" : "UNAVAILABLE";
  const executionState: FootballExpertPanel["executionState"] = completeness.isComplete
    ? "AVAILABLE"
    : "UNAVAILABLE";
  const divergenceState = computeDivergenceState(panelStatus, decision, selection, q, completeness.isComplete);

  // Build the 8 specialist reports
  const specialistsObj: any = {};
  const panelList: SpecialistReport[] = [];

  for (const def of MANDATORY_SPECIALIST_DEFS) {
    const s = findSpecialist(raw, def.key, def.role);
    const rep: SpecialistReport = {
      role: def.role,
      name: str(s?.name, def.name),
      status: s && isSpecialistSubstantive(s) ? "ACTIVE" : "LIMITED_EVIDENCE",
      stance: stance(s?.stance),
      assessment: str(s?.assessment, "No supported assessment supplied."),
      evidence: Array.isArray(s?.evidence)
        ? s.evidence.filter((e: any) => typeof e === "string").slice(0, 6)
        : [],
      confidence: pct(s?.confidence ?? (s ? 75 : 0)),
      recommendation: ["SUPPORT", "CHALLENGE", "REVALIDATE"].includes(s?.recommendation)
        ? s.recommendation
        : "SUPPORT",
      concern: str(s?.concern, "None stated."),
      question: str(s?.question, "None."),
      details: s?.details && typeof s.details === "object" ? s.details : undefined,
    };
    specialistsObj[def.key] = rep;
    panelList.push(rep);
  }

  // Contrarian Challenge construction
  const contrarianAnalyst = specialistsObj.contrarianAnalyst;
  const contrarianChallenge: ContrarianChallenge = {
    quantitativeLeaderChallenged: str(raw.contrarianChallenge?.quantitativeLeaderChallenged, q),
    challengeQuestion: str(
      raw.contrarianChallenge?.challengeQuestion,
      `Why might ${q} be the wrong final football conclusion despite its mathematical model probability?`,
    ),
    strongestAlternative: str(
      raw.contrarianChallenge?.strongestAlternative,
      selection !== q ? selection : (surface[1]?.selection ?? "Directional 1X2"),
    ),
    evidenceForAlternative: str(
      raw.contrarianChallenge?.evidenceForAlternative,
      contrarianAnalyst?.assessment || "Directional edge identified beyond raw totals.",
    ),
    evidenceAgainstAlternative: str(
      raw.contrarianChallenge?.evidenceAgainstAlternative,
      "Counter-variance or opposition transition threat.",
    ),
    verdict: ["CHALLENGE_SUCCEEDED", "CHALLENGE_REJECTED", "ALTERNATIVE_INFORMATIVE", "UNRESOLVED"].includes(
      raw.contrarianChallenge?.verdict,
    )
      ? raw.contrarianChallenge.verdict
      : isDivergent
        ? "CHALLENGE_SUCCEEDED"
        : "CHALLENGE_REJECTED",
    chairResponse: str(
      raw.contrarianChallenge?.chairResponse,
      raw.chair?.summary ?? "The Chair and Council evaluated the contrarian challenge against the quantitative leader.",
    ),
  };

  const d = Array.isArray(raw.debate) ? raw.debate.slice(0, 10) : [];

  const analystCallRationale = completeness.isComplete
    ? str(
        raw.analystCall?.rationale,
        "The council selected the strongest supported market from the computed market surface.",
      )
    : `AI COUNCIL INCOMPLETE: Missing or malformed specialist evaluations (${completeness.reasons.join("; ")}). Quantitative baseline preserved.`;

  const panel: FootballExpertPanel = {
    status: panelStatus,
    executionState,
    divergenceState,
    provider: completeness.isComplete ? "GEMINI" : "NONE",
    model,
    generatedAt: new Date().toISOString(),
    architectureVersion: "gfi-ai-football-council-v2",
    fallbackModelUsed,
    retryAttempts,
    diagnostics,
    identityCheck: {
      status: id,
      homeConfidence: pct(raw.identityCheck?.homeConfidence),
      awayConfidence: pct(raw.identityCheck?.awayConfidence),
      competitionConfidence: pct(raw.identityCheck?.competitionConfidence),
      notes,
    },
    teamStrength: {
      home: {
        relative: rel(raw.teamStrength?.home?.relative),
        rationale: str(raw.teamStrength?.home?.rationale, "No supported assessment supplied."),
      },
      away: {
        relative: rel(raw.teamStrength?.away?.relative),
        rationale: str(raw.teamStrength?.away?.rationale, "No supported assessment supplied."),
      },
      strengthGap: ["HOME_CLEAR", "AWAY_CLEAR", "CLOSE", "UNKNOWN"].includes(
        raw.teamStrength?.strengthGap,
      )
        ? raw.teamStrength.strengthGap
        : "UNKNOWN",
      opponentQualityAdjustment: str(
        raw.teamStrength?.opponentQualityAdjustment,
        "Opponent-quality adjustment not established.",
      ),
    },
    realityCheck: { status: reality, score: realityScore, flags },
    specialists: specialistsObj,
    contrarianChallenge,
    panel: panelList,
    debate: d.map((x: any) => ({
      speaker: str(x?.speaker, "Panel"),
      challenges: str(x?.challenges, ""),
      response: str(x?.response, ""),
    })),
    chair: {
      summary: str(raw.chair?.summary, "Council synthesis unavailable."),
      strongestCase: str(raw.chair?.strongestCase, "Not supplied."),
      strongestCountercase: str(raw.chair?.strongestCountercase, "Not supplied."),
      unresolvedQuestion: str(raw.chair?.unresolvedQuestion, "Not supplied."),
      quantitativeLeader: q,
      analystConclusion: selection,
      decision,
      severity,
      revalidationReason: str(raw.chair?.revalidationReason, ""),
      divergenceExplanation: isDivergent ? divergenceReason : "Council agrees with quantitative leader.",
    },
    analystCall: {
      status: completeness.isComplete ? "ACTIVE" : "FALLBACK",
      market: row?.market ?? "QUANTITATIVE",
      selection,
      callType: validCalls.includes(raw.analystCall?.callType) ? raw.analystCall.callType : "OTHER",
      rationale: analystCallRationale,
      conviction: completeness.isComplete ? conviction : "LOW",
      evidenceQuality: completeness.isComplete ? evidenceQuality : "LIMITED",
      quantitativeLeader: q,
      quantitativeProbability: row?.probability ?? 0,
      quantitativeLeaderProbability: qProb,
      safeAlternative,
      divergenceFromQuantitativeLeader: isDivergent,
      divergenceReason,
      divergenceReasonCode,
      secondaryCall: str(raw.analystCall?.secondaryCall) || undefined,
      guardrails: Array.isArray(raw.analystCall?.guardrails)
        ? raw.analystCall.guardrails.filter((x: any) => typeof x === "string").slice(0, 8)
        : [],
    },
    marketReview: {
      quantitativeLeader: q,
      selectedMarket: selection,
      safeAlternative,
      panelView: str(raw.marketReview?.panelView, "Council synthesis complete."),
      alternatives,
    },
    limitations: Array.isArray(raw.limitations)
      ? raw.limitations.filter((x: any) => typeof x === "string").slice(0, 10)
      : [],
  };
  return { panel, rejectedAnything, completeness };
}

export function applyAnalystDecision(
  a: AuthoritativeMatchAnalysis,
  p: FootballExpertPanel,
): { applied: boolean; reason: string } {
  if (p.status !== "ACTIVE" || p.analystCall.status !== "ACTIVE" || p.divergenceState === "INCOMPLETE")
    return { applied: false, reason: "Panel or call not active / council incomplete" };
  if (p.identityCheck.status === "FAIL")
    return {
      applied: false,
      reason: "Identity check status FAIL — quantitative fallback preserved",
    };
  if (p.chair.severity === "SEVERE")
    return { applied: false, reason: "Chair severity SEVERE — quantitative fallback preserved" };
  if (p.chair.decision === "REVALIDATE")
    return { applied: false, reason: "Chair decision REVALIDATE — quantitative fallback preserved" };
  const s = p.analystCall.selection;
  if (!s) return { applied: false, reason: "No selection present on analyst call" };
  const quantitativeLeaderBeforeAI = p.analystCall.quantitativeLeader;
  const safeAlternative = p.analystCall.safeAlternative || quantitativeLeaderBeforeAI;
  a.finalPrediction = s;
  if (s === `${a.home.team} Win`) a.decision = "HOME EDGE";
  else if (s === `${a.away.team} Win`) a.decision = "AWAY EDGE";
  else if (s === "Draw") a.decision = "DRAW LEAN";
  else a.decision = "NO STRONG EDGE";
  a.verdict = a.decision;
  a.aiReasoningPacket = {
    ...a.aiReasoningPacket,
    aiRole: "AI_FOOTBALL_ANALYST_COUNCIL_WITH_CONTROLLED_DECISION_AUTHORITY",
    aiAnalystCall: p.analystCall,
    quantitativeLeaderBeforeAI,
    safeAlternative,
    aiDecisionAuthority: true,
  };
  return { applied: true, reason: `AI Analyst Call applied: ${s}` };
}
export async function runFootballExpertPanel(input: PanelInput): Promise<FootballExpertPanel> {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    (process.env as any).API_KEY?.trim();
  const primaryModel =
    input.options?.primaryModel || process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const fallbackModel =
    input.options?.fallbackModel || process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.6-flash";
  if (!key)
    return emptyPanel(
      "UNAVAILABLE",
      primaryModel,
      "GEMINI CONFIGURATION MISSING: GEMINI_API_KEY or GOOGLE_API_KEY is not configured in the server environment; the validated quantitative result was retained.",
      input.analysis,
      {
        attempts: [],
        finalStatus: "CONFIGURATION_MISSING",
        decisionApplied: false,
      },
    );
  const { fixture, analysis, evidenceFacts = [] } = input;
  const surface = marketSurface(analysis);
  const qLeader = surface[0]?.selection ?? analysis.finalPrediction;
  const qLeaderProb = surface[0]?.probability ?? Math.round((analysis.probabilities.home || 0) * 100);
  const packet = {
    fixture: {
      home: fixture.home,
      away: fixture.away,
      date: fixture.date,
      time: fixture.time,
      competition: fixture.league,
      competitionCode: fixture.sourceId,
    },
    quantitativeLeader: {
      selection: qLeader,
      probability: qLeaderProb,
      qualificationStatus: analysis.qualification?.actionableMarket?.qualificationStatus || "ACTIONABLE",
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
    teams: { home: analysis.home, away: analysis.away },
    engines: analysis.engines
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        name: e.name,
        signal: e.signal,
        confidence: e.confidence,
        quality: e.quality,
        version: e.version,
        probabilities: e.probabilities,
      })),
    researchFacts: evidenceFacts.slice(0, 20),
    evidence: {
      metrics: analysis.evidenceMetrics,
      state: analysis.evidenceState,
      pipeline: (analysis as any).pipeline,
      warnings: analysis.warnings.slice(0, 10),
    },
  };
  const system = `You are the AI Football Analyst Council inside an institutional football-intelligence platform.
You are an AI FOOTBALL ANALYST, NOT a probability sorter.

=== SEPARATE THREE CRITICAL CONCEPTS ===
1. STATISTICAL PROBABILITY: What does the quantitative engine calculate?
   (e.g., Over 1.5 Goals = 82%, Home Win = 48%, BTTS = 58%).
2. FOOTBALL EXPECTATION: What does the actual football evidence indicate?
   (e.g., Opponent-adjusted strength gap, home venue dominance, tactical pressing mismatch, transition threat, defensive fragility).
3. ACTIONABLE ANALYST CONCLUSION: What does the AI football analyst conclude is the most informative, decisive football call?
   (e.g., Selecting "Home Win" when a team-strength mismatch exists, while preserving "Over 1.5 Goals" as the SAFE ALTERNATIVE).

=== DO NOT DEFAULT TO THE SAFEST MARKET ===
A market with 82% probability like "Over 1.5 Goals" is broad and non-directional.
Do NOT treat Over 1.5 as automatically superior to Home Win (48%), Away Win, or BTTS simply because 82 > 48.
They answer completely different football questions:
- "Over 1.5 Goals" asks: "Will at least 2 goals be scored in total?"
- "Home Win" asks: "Will the home team win the match?"
When football evidence shows a clear opponent-adjusted strength advantage, tactical dominance, or recent trajectory favoring one side, the directional conclusion (Home Win / Away Win / Draw) is far more informative.
Conversely, do NOT force directional markets if the evidence does not support one. If both sides are evenly matched or volatile, BTTS or a totals market (Over/Under) is the legitimate football conclusion.

=== EIGHT SPECIALISTS WITH DISTINCT MANDATES ===
1. TEAM STRENGTH SCOUT:
   - Question: Who is actually stronger?
   - Evaluate: Opponent-adjusted performance, squad quality, home/away baseline strength, and quality of opponents faced.
   - Output: HOME / DRAW / AWAY / UNCLEAR with evidence.
2. TACTICAL ANALYST:
   - Question: Does the tactical matchup favor one side or a goals/BTTS scenario?
   - Evaluate: Attacking and defensive structures, pressing intensity, transition vulnerability, and chance creation efficiency. Do not invent tactical facts.
3. STATISTICAL ANALYST:
   - Question: What does the complete quantitative surface reveal?
   - Evaluate: Compare Home Win, Draw, Away Win, BTTS, Over/Under, DNB, and Double Chance. Explain what information each market captures rather than merely identifying the highest percentage.
4. FORM & TRAJECTORY ANALYST:
   - Question: What is the true trajectory of both teams?
   - Evaluate: Recent form direction, accelerating or declining sides, home/away trajectory, and opponent-adjusted recent results. Recent trajectory must challenge stale long-term baselines.
5. CONTEXT & MOTIVATION ANALYST:
   - Question: What are external and psychological factors?
   - Evaluate: Competition importance, rest, schedule congestion, travel fatigue, rotation risk, manager effects. Unknown factors MUST remain UNKNOWN.
6. COMPETITION STRENGTH ANALYST:
   - Question: Are there cross-competition distortions?
   - Evaluate: Detect tier disparities. A team dominating a weaker league or domestic cup must NOT be treated as equal to a team competing in a top-flight league.
7. DATA FORENSIC ANALYST:
   - Question: Is the underlying data authentic and uncontaminated?
   - Evaluate: Team identities, competition labels, date validity, home/away orientation, duplicate records, or mismatched mappings. If data shows severe corruption or identity failure, mandate REVALIDATE.
8. CONTRARIAN ANALYST:
   - Question: Why should the quantitative leader NOT be the final football conclusion?
   - Evaluate: Is the quantitative leader merely broad and safe? Does Home Win, Away Win, Draw, or BTTS express a sharper, more actionable football edge? Or is the quantitative leader truly the best conclusion?

=== THE CHAIR DECISION ===
The Chair does NOT use simple majority voting. The Chair synthesizes:
1. Identity integrity
2. Evidence quality
3. Team-strength differential
4. Tactical support
5. Form trajectory
6. Competition context
7. Statistical support
8. Contrarian challenge
9. Market specificity
10. Contradictions
Answer explicitly: "What is the strongest football conclusion?" and "Why is this more informative than the quantitative leader?". If not more informative, retain the quantitative leader.

=== PRESERVE SAFE ALTERNATIVE ===
When selecting a market that diverges from the quantitative leader, designate the quantitative leader as safeAlternative.

=== STRUCTURED DIVERGENCE REASONS ===
When analystCall diverges from quantitativeLeader, divergenceReasonCode MUST be one of:
- DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL
- RECENT_TRAJECTORY_OVERRIDES_LONG_TERM_BASELINE
- OPPONENT_ADJUSTED_STRENGTH_GAP
- TACTICAL_MISMATCH_SUPPORTS_DIRECTION
- BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL
- QUANTITATIVE_LEADER_TOO_BROAD
- NO_DIRECTIONAL_EDGE_RETAINED_TOTALS
- NONE (when no divergence)

=== ABSOLUTE INTEGRITY GUARDRAILS ===
1. You MUST NEVER invent odds, xG, injuries, lineups, rankings, team strength, or market probabilities. Missing information is UNKNOWN.
2. analystCall.selection MUST exactly match one string from marketSurface.
3. If identityCheck.status is FAIL or severity is SEVERE, Chair decision must be REVALIDATE.
4. Return valid JSON only. Every field and specialist MUST be populated with substantive football analysis (not placeholders):
{
  "identityCheck": { "status": "PASS"|"WARN"|"FAIL", "homeConfidence": 95, "awayConfidence": 95, "competitionConfidence": 95, "notes": ["..."] },
  "teamStrength": {
    "home": { "relative": "STRONGER"|"WEAKER"|"SIMILAR"|"UNKNOWN", "rationale": "..." },
    "away": { "relative": "STRONGER"|"WEAKER"|"SIMILAR"|"UNKNOWN", "rationale": "..." },
    "strengthGap": "HOME_CLEAR"|"AWAY_CLEAR"|"CLOSE"|"UNKNOWN",
    "opponentQualityAdjustment": "..."
  },
  "realityCheck": { "status": "COHERENT"|"TENSION"|"SEVERE_TENSION"|"LIMITED_EVIDENCE", "score": 85, "flags": ["..."] },
  "specialists": {
    "teamStrengthScout": { "role": "Team Strength Scout", "name": "Team Strength Scout", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "tacticalAnalyst": { "role": "Tactical Analyst", "name": "Tactical Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "statisticalAnalyst": { "role": "Statistical Analyst", "name": "Statistical Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "formTrajectoryAnalyst": { "role": "Form & Trajectory Analyst", "name": "Form & Trajectory Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "contextMotivationAnalyst": { "role": "Context & Motivation Analyst", "name": "Context & Motivation Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "competitionStrengthAnalyst": { "role": "Competition Strength Analyst", "name": "Competition Strength Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "dataForensicAnalyst": { "role": "Data Forensic Analyst", "name": "Data Forensic Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." },
    "contrarianAnalyst": { "role": "Contrarian Analyst", "name": "Contrarian Analyst", "status": "ACTIVE", "stance": "HOME"|"DRAW"|"AWAY"|"GOALS"|"BTTS"|"NEUTRAL"|"REVALIDATE", "assessment": "...", "evidence": ["..."], "confidence": 80, "recommendation": "SUPPORT"|"CHALLENGE"|"REVALIDATE", "concern": "...", "question": "..." }
  },
  "contrarianChallenge": {
    "quantitativeLeaderChallenged": "...",
    "challengeQuestion": "...",
    "strongestAlternative": "...",
    "evidenceForAlternative": "...",
    "evidenceAgainstAlternative": "...",
    "verdict": "CHALLENGE_SUCCEEDED"|"CHALLENGE_REJECTED"|"ALTERNATIVE_INFORMATIVE"|"UNRESOLVED",
    "chairResponse": "..."
  },
  "debate": [
    { "speaker": "Contrarian Analyst", "challenges": "...", "response": "..." }
  ],
  "chair": {
    "summary": "Synthesized football verdict...",
    "strongestCase": "...",
    "strongestCountercase": "...",
    "unresolvedQuestion": "...",
    "decision": "SUPPORT"|"CHALLENGE"|"REVALIDATE",
    "severity": "NORMAL"|"MINOR"|"SIGNIFICANT"|"SEVERE",
    "revalidationReason": ""
  },
  "analystCall": {
    "market": "1X2"|"TOTALS"|"BTTS",
    "selection": "exact match from marketSurface",
    "callType": "HOME_WIN"|"DRAW"|"AWAY_WIN"|"BTTS_YES"|"BTTS_NO"|"OVER_1_5"|"OVER_2_5"|"OVER_3_5"|"UNDER_1_5"|"UNDER_2_5"|"UNDER_3_5"|"DOUBLE_CHANCE"|"DNB",
    "rationale": "Defensible football reason...",
    "conviction": "LOW"|"MODERATE"|"HIGH"|"VERY_HIGH",
    "evidenceQuality": "LIMITED"|"MODERATE"|"GOOD"|"STRONG",
    "safeAlternative": "exact match from marketSurface",
    "divergenceReasonCode": "DIRECTIONAL_SIGNAL_STRONGER_THAN_SAFE_TOTAL"|"RECENT_TRAJECTORY_OVERRIDES_LONG_TERM_BASELINE"|"OPPONENT_ADJUSTED_STRENGTH_GAP"|"TACTICAL_MISMATCH_SUPPORTS_DIRECTION"|"BTTS_MORE_INFORMATIVE_THAN_GOAL_TOTAL"|"QUANTITATIVE_LEADER_TOO_BROAD"|"NO_DIRECTIONAL_EDGE_RETAINED_TOTALS"|"NONE",
    "divergenceReason": "...",
    "guardrails": ["..."]
  },
  "marketReview": {
    "quantitativeLeader": "...",
    "selectedMarket": "...",
    "safeAlternative": "...",
    "panelView": "...",
    "alternatives": ["..."]
  },
  "limitations": ["..."]
}`;
  const user = `Run the complete AI Football Analyst Council.
Determine the most informative, actionable football conclusion based on the evidence, not merely the highest probability.
Remember: analystCall.selection MUST exactly match one selection in marketSurface.
If you choose a directional or specific market that differs from the quantitative leader, designate the quantitative leader as safeAlternative and provide a structured divergenceReasonCode.

PACKET:
${JSON.stringify(packet)}`;
  const fetcher = input.options?.fetcher || fetch;
  const sleepFn = input.options?.sleepFn || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const plan = [
    { attempt: 1, model: primaryModel, isFallback: false, waitBeforeMs: 0 },
    { attempt: 2, model: primaryModel, isFallback: false, waitBeforeMs: 1500 },
    { attempt: 3, model: fallbackModel, isFallback: true, waitBeforeMs: 1000 },
  ];
  const attempts: CouncilDiagnosticAttempt[] = [];
  for (const step of plan) {
    if (step.waitBeforeMs) await sleepFn(step.waitBeforeMs);
    const t = Date.now();
    const diag: CouncilDiagnosticAttempt = {
      attempt: step.attempt,
      model: step.model,
      status: "INITIATED",
      elapsedMs: 0,
      reachedGemini: false,
      responseBodyReceived: false,
      jsonParsed: false,
      candidatesReturned: false,
      structuredOutputValid: false,
      cleanPanelRejectedAnything: false,
      decisionApplied: false,
    };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 22000);
      const response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(step.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              thinkingConfig: { thinkingLevel: "low" },
            },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);
      diag.elapsedMs = Date.now() - t;
      diag.reachedGemini = true;
      diag.status = response.status;
      if (!response.ok) {
        let body = "";
        try {
          body = (await response.text()).slice(0, 180);
          diag.responseBodyReceived = true;
        } catch {
          /* ignore */
        }
        const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
        diag.error = `HTTP ${response.status}: ${body}`;
        attempts.push(diag);
        console.warn(
          `[GeminiCouncil] attempt=${step.attempt} model=${step.model} status=${response.status} transient=${transient} elapsedMs=${diag.elapsedMs}`,
        );
        if (!transient) break;
        continue;
      }
      diag.responseBodyReceived = true;
      const body: any = await response.json();
      const parts = body?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts) && parts.length) diag.candidatesReturned = true;
      const rawText =
        parts
          ?.map((p: any) => p?.text)
          .filter(Boolean)
          .join("\n") ?? "";
      if (!rawText.trim()) {
        diag.error = "No candidate content returned";
        attempts.push(diag);
        continue;
      }
      const cleanJson = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleanJson);
        diag.jsonParsed = true;
      } catch (e: any) {
        diag.error = `JSON parse failed: ${e?.message || String(e)}`;
        attempts.push(diag);
        continue;
      }
      const diagnostics = {
        attempts: [...attempts, diag],
        resolvedAttempt: step.attempt,
        finalStatus: "SUCCESS",
        decisionApplied: false,
      };
      const cleaned = cleanPanel(
        parsed,
        step.model,
        analysis,
        step.isFallback,
        step.attempt,
        diagnostics,
      );
      diag.structuredOutputValid = cleaned.completeness.isComplete;
      diag.cleanPanelRejectedAnything = cleaned.rejectedAnything;

      if (!cleaned.completeness.isComplete) {
        diag.error = `Incomplete council response: missing ${cleaned.completeness.reasons.join("; ")}`;
        console.warn(
          `[GeminiCouncil] attempt=${step.attempt} model=${step.model} returned INCOMPLETE council (${cleaned.completeness.reasons.join(", ")})`,
        );
        attempts.push(diag);
        continue;
      }

      const applied = applyAnalystDecision(analysis, cleaned.panel);
      diag.decisionApplied = applied.applied;
      diagnostics.decisionApplied = applied.applied;
      attempts.push(diag);
      console.log(
        `[GeminiCouncil] SUCCESS attempt=${step.attempt} model=${step.model} elapsedMs=${diag.elapsedMs} decisionApplied=${applied.applied} selection=${cleaned.panel.analystCall.selection}`,
      );
      return cleaned.panel;
    } catch (err: any) {
      diag.elapsedMs = Date.now() - t;
      diag.status = err?.name === "AbortError" ? "TIMEOUT_22S" : "FETCH_ERROR";
      diag.error = err?.message || String(err);
      attempts.push(diag);
      console.warn(
        `[GeminiCouncil] attempt=${step.attempt} model=${step.model} failed status=${diag.status} elapsedMs=${diag.elapsedMs}`,
      );
    }
  }
  const summary = attempts
    .map((a) => `[#${a.attempt} ${a.model}: ${a.status} (${a.elapsedMs}ms)]`)
    .join(", ");
  console.error(`[GeminiCouncil] ALL ATTEMPTS FAILED ${summary}`);
  return emptyPanel(
    "ERROR",
    primaryModel,
    `AI council unavailable after ${attempts.length} attempt(s) (${summary}); validated quantitative selection was preserved.`,
    analysis,
    { attempts, finalStatus: "ALL_ATTEMPTS_FAILED", decisionApplied: false },
  );
}
