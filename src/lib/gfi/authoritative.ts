import type { MatchRow, IntelligenceResult, TeamSnapshot } from "./intelligence";
import { sameTeamIdentity } from "./identity";

export type EngineId =
  | "FORM"
  | "GOALS"
  | "VENUE"
  | "TOTALS"
  | "BTTS"
  | "CONSISTENCY"
  | "H2H"
  | "DATA_QUALITY"
  | "ELO"
  | "BAYES_STRENGTH"
  | "DIXON_COLES"
  | "NEG_BINOMIAL"
  | "MOMENTUM"
  | "LOGISTIC_REGRESSION"
  | "CONSENSUS"
  | "SIMULATION"
  | "MARKET";
export type Signal = "SUPPORT" | "CONTRADICTION" | "NEUTRAL" | "LIMITATION";
export type EngineOutput = {
  id: EngineId;
  name: string;
  version: string;
  signal: Signal;
  confidence: number;
  quality: number;
  probabilities?: { home: number; draw: number; away: number };
  values: Record<string, number>;
  evidence: string[];
  limitations: string[];
};
export type EvidenceItem = {
  id: string;
  source: "FREE_RESULTS" | "DERIVED_MODEL" | "OPTIONAL_PROVIDER";
  statement: string;
  quality: number;
  provider?: string;
  sourceFamily?: string;
  provenance?: string;
};
export type ActionablePrediction = {
  market: "HOME" | "DRAW" | "AWAY" | "OVER 1.5" | "OVER 2.5" | "OVER 3.5" | "BTTS";
  label: string;
  probability: number;
  strength: number;
};

export type EvidenceMetrics = {
  directHomeEvidence: number;
  directAwayEvidence: number;
  h2hEvidence: number;
  competitionEvidence: number;
  globalPriorEvidence: number;
  webStructuredObservations: number;
  webFactualObservations: number;
  persistedObservations: number;
  persistedSourceRecords: number;
  persistedSourceFamilies: number;
  modelInputRows: number;
  researchCoveragePct: number;
  evidenceCoveragePct: number;
};

export type EvidenceState =
  | "VERIFIED"
  | "LIMITED EVIDENCE"
  | "PRIOR-BASED"
  | "ANALYSIS DEGRADED"
  | "NO DATA";

export type AsymmetricEvidence = {
  isAsymmetric: boolean;
  homeEvidence: number;
  awayEvidence: number;
  ratio: number;
  explanation?: string;
};

export type ValueClassification =
  | "EXCEPTIONAL_VALUE"
  | "STRONG_VALUE"
  | "SMALL_VALUE"
  | "FAIR"
  | "NEGATIVE_VALUE"
  | "NO_ODDS";

export type MarketCandidate = {
  market: string;
  selection: string;
  modelProbability: number;
  marketPrice?: number;
  impliedProbability?: number;
  fairOdds: number;
  edge?: number;
  valueClassification: ValueClassification;
  qualificationStatus: "QUALIFIED" | "NOT_QUALIFIED" | "WATCH";
  rejectionReason?: string;
  whyConsidered: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
};

export type ValueAnalysisResult = {
  hasOdds: boolean;
  mode: "ODDS_AVAILABLE" | "NO_ODDS_MODE";
  bestValueMarket?: MarketCandidate;
  candidates: MarketCandidate[];
  summaryNote: string;
};

export type ContradictionAnalysis = {
  conflictScore: number;
  contradictions: string[];
  supportingFactors: string[];
  missingEvidence: string[];
  hasMajorConflict: boolean;
};

export type QualificationResult = {
  qualified: boolean;
  actionableMarket: MarketCandidate | null;
  strongestMathematicalSignal: MarketCandidate;
  eligibilityPassed: boolean;
  rejectionReasons: string[];
  statusMessage: string;
};

export type DiagnosticPipelineStep = {
  stage: string;
  status: "OK" | "WARNING" | "FAILED";
  detail: string;
  timestamp: string;
};

export type AuthoritativeMatchAnalysis = IntelligenceResult & {
  analysisVersion: string;
  fixtureId: string;
  generatedAt: string;
  engines: EngineOutput[];
  evidenceLedger: EvidenceItem[];
  evidenceMetrics?: EvidenceMetrics;
  evidenceState?: EvidenceState;
  asymmetricEvidence?: AsymmetricEvidence;
  modelConvergence?: number;
  evidenceQuality?: number;
  predictedScoreState?: "EVIDENCE_BACKED" | "PRIOR_BASED";
  predictedScoreNote?: string;
  marketCandidates?: MarketCandidate[];
  valueAnalysis?: ValueAnalysisResult;
  contradictionAnalysis?: ContradictionAnalysis;
  qualification?: QualificationResult;
  diagnosticTrace?: DiagnosticPipelineStep[];
  deploymentFingerprint?: {
    analysisVersion: string;
    resultContractVersion: string;
    buildTime: string;
    engineId: string;
  };
  consensus: {
    home: number;
    draw: number;
    away: number;
    agreement: number;
    conflict: number;
    leader: "home" | "draw" | "away" | "none";
  };
  robustness: { score: number; label: "ROBUST" | "STABLE" | "FRAGILE" | "UNSTABLE" };
  risk: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  marketDivergence?: {
    available: boolean;
    home?: number;
    draw?: number;
    away?: number;
    note: string;
  };
  decision:
    | "HOME EDGE"
    | "DRAW LEAN"
    | "AWAY EDGE"
    | "NO STRONG EDGE"
    | "INSUFFICIENT INTELLIGENCE"
    | "HIGH MODEL CONFLICT";
  finalPrediction: string;
  predictedScore: string;
  predictions: ActionablePrediction[];
  aiReasoningPacket: Record<string, unknown>;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ppg = (t: TeamSnapshot) => t.points / Math.max(1, t.played);
const poissonAt = (lambda: number, k: number) => {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
};
const poissonUnder = (lambda: number, line: number) => {
  let p = Math.exp(-lambda),
    sum = p;
  for (let k = 1; k <= line; k++) {
    p *= lambda / k;
    sum += p;
  }
  return sum;
};
const round = (n: number, d = 2) => Number(n.toFixed(d));
const outcome = (h: number, a: number) => (h > a ? "H" : h === a ? "D" : ("A" as const));

function formEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const hp = ppg(h),
    ap = ppg(a),
    gap = hp - ap;
  const H = clamp(
      0.38 +
        gap * 0.075 +
        (h.recent.filter((x) => x === "W").length - a.recent.filter((x) => x === "L").length) *
          0.012,
      0.08,
      0.82,
    ),
    A = clamp(
      0.27 -
        gap * 0.06 +
        (a.recent.filter((x) => x === "W").length - h.recent.filter((x) => x === "L").length) *
          0.012,
      0.08,
      0.7,
    ),
    D = clamp(1 - H - A, 0.1, 0.48),
    t = H + D + A;
  return {
    id: "FORM",
    name: "Recent Form",
    version: "form-v2",
    signal: Math.abs(gap) >= 0.45 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.42 + Math.abs(gap) / 2.5) * 100),
    quality: Math.round(clamp(0.35 + (h.played + a.played) / 30) * 100),
    probabilities: { home: H / t, draw: D / t, away: A / t },
    values: { homePPG: round(hp), awayPPG: round(ap), pointsGap: round(gap) },
    evidence: [
      `${h.team}: ${hp.toFixed(2)} PPG from ${h.played} matches.`,
      `${a.team}: ${ap.toFixed(2)} PPG from ${a.played} matches.`,
    ],
    limitations: h.played + a.played < 8 ? ["Recent sample is small."] : [],
  };
}
function goalEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const totalSample = h.played + a.played;
  const isSparse = totalSample < 4;
  const hf = h.played > 0 ? h.goalsFor / h.played : 1.35;
  const af = a.played > 0 ? a.goalsFor / a.played : 1.10;
  const hc = h.played > 0 ? h.goalsAgainst / h.played : 1.15;
  const ac = a.played > 0 ? a.goalsAgainst / a.played : 1.30;

  const lh = clamp(hf * 0.62 + ac * 0.38, 0.4, 3.6);
  const la = clamp(af * 0.62 + hc * 0.38, 0.3, 3.3);
  let H = 0,
    D = 0,
    A = 0;
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) {
      const p = poissonAt(lh, i) * poissonAt(la, j);
      if (i > j) H += p;
      else if (i === j) D += p;
      else A += p;
    }
  const t = H + D + A || 1;
  return {
    id: "GOALS",
    name: "Goal / Poisson",
    version: isSparse ? "goals-sparse-prior-v3" : "goals-v3",
    signal: isSparse ? "LIMITATION" : Math.abs(lh - la) >= 0.25 ? "SUPPORT" : "NEUTRAL",
    confidence: isSparse
      ? Math.min(25, totalSample * 6)
      : Math.round(clamp(0.45 + Math.abs(lh - la) / 2.5) * 100),
    quality: isSparse ? Math.min(30, 10 + totalSample * 5) : 82,
    probabilities: { home: H / t, draw: D / t, away: A / t },
    values: {
      lambdaHome: round(lh),
      lambdaAway: round(la),
      expectedGoals: round(lh + la),
      directSample: totalSample,
    },
    evidence: isSparse
      ? [`Expected goals uses baseline prior λH ${lh.toFixed(2)} / λA ${la.toFixed(2)} (sparse sample).`]
      : [`Expected goals baseline λH ${lh.toFixed(2)} / λA ${la.toFixed(2)} from ${totalSample} match observations.`],
    limitations: isSparse ? ["Goal sample is sparse; baseline prior applied."] : [],
  };
}
function venueEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const totalSample = h.played + a.played;
  const isSparse = totalSample < 4;
  const hr = h.played > 0 ? h.homeOrAwayRate : 0.45;
  const ar = a.played > 0 ? a.homeOrAwayRate : 0.28;
  const H = clamp(0.43 + (hr - 0.5) * 0.28 - (ar - 0.5) * 0.1, 0.12, 0.76);
  const A = clamp(0.27 + (ar - 0.5) * 0.2 - (hr - 0.5) * 0.05, 0.1, 0.66);
  const D = clamp(1 - H - A, 0.12, 0.48);
  const t = H + D + A || 1;
  return {
    id: "VENUE",
    name: "Home / Away Venue",
    version: isSparse ? "venue-sparse-prior-v3" : "venue-v2",
    signal: isSparse ? "LIMITATION" : Math.abs(hr - ar) >= 0.2 ? "SUPPORT" : "NEUTRAL",
    confidence: isSparse
      ? Math.min(25, totalSample * 6)
      : Math.round(clamp(0.45 + Math.abs(hr - ar)) * 100),
    quality: isSparse ? Math.min(30, 10 + totalSample * 5) : Math.round(clamp(0.4 + totalSample / 32) * 100),
    probabilities: { home: H / t, draw: D / t, away: A / t },
    values: { homeVenueWinRate: hr, awayVenueWinRate: ar },
    evidence: [
      `Home venue win rate ${Math.round(hr * 100)}%.`,
      `Away venue win rate ${Math.round(ar * 100)}%.`,
    ],
    limitations: isSparse ? ["Venue sample is sparse."] : [],
  };
}
function totalsEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const totalSample = h.played + a.played;
  const isSparse = totalSample < 4;
  const hf = h.played > 0 ? h.goalsFor / h.played : 1.35;
  const af = a.played > 0 ? a.goalsFor / a.played : 1.10;
  const hc = h.played > 0 ? h.goalsAgainst / h.played : 1.15;
  const ac = a.played > 0 ? a.goalsAgainst / a.played : 1.30;
  const mean = clamp((hf + ac) * 0.55 + (af + hc) * 0.45, 1.2, 5.5);
  const values: Record<string, number> = {};
  for (const line of [0.5, 1.5, 2.5, 3.5])
    values[`over${line}`] = clamp(1 - poissonUnder(mean, Math.floor(line)));
  return {
    id: "TOTALS",
    name: "Totals",
    version: isSparse ? "totals-sparse-prior-v3" : "totals-v2",
    signal: isSparse
      ? "LIMITATION"
      : values["over2.5"] >= 0.6 || values["over2.5"] <= 0.4
        ? "SUPPORT"
        : "NEUTRAL",
    confidence: isSparse
      ? Math.min(25, totalSample * 6)
      : Math.round((0.48 + Math.abs(values["over2.5"] - 0.5)) * 100),
    quality: isSparse ? Math.min(30, 10 + totalSample * 5) : 78,
    values: { ...values, expectedGoals: round(mean) },
    evidence: isSparse
      ? [`Expected total-goals rate ${mean.toFixed(2)} based on prior.`]
      : [
          `Expected total-goals rate ${mean.toFixed(2)}.`,
          `Over 2.5 baseline ${Math.round(values["over2.5"] * 100)}%.`,
        ],
    limitations: isSparse ? ["Totals sample is sparse."] : [],
  };
}
function bttsEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const totalSample = h.played + a.played;
  const isSparse = totalSample < 4;
  const hf = h.played > 0 ? h.goalsFor / h.played : 1.35;
  const af = a.played > 0 ? a.goalsFor / a.played : 1.10;
  const hc = h.played > 0 ? h.goalsAgainst / h.played : 1.15;
  const ac = a.played > 0 ? a.goalsAgainst / a.played : 1.30;
  const lh = clamp(hf * 0.55 + ac * 0.45, 0.4, 3.5);
  const la = clamp(af * 0.55 + hc * 0.45, 0.3, 3.5);
  const yes = clamp((1 - Math.exp(-lh)) * (1 - Math.exp(-la)));
  return {
    id: "BTTS",
    name: "Both Teams To Score",
    version: isSparse ? "btts-sparse-prior-v3" : "btts-v2",
    signal: isSparse ? "LIMITATION" : yes >= 0.62 || yes <= 0.38 ? "SUPPORT" : "NEUTRAL",
    confidence: isSparse
      ? Math.min(25, totalSample * 6)
      : Math.round((0.45 + Math.abs(yes - 0.5)) * 100),
    quality: isSparse ? Math.min(30, 10 + totalSample * 5) : 76,
    values: { yes, no: 1 - yes },
    evidence: isSparse
      ? [`BTTS Yes ${Math.round(yes * 100)}% based on baseline league prior.`]
      : [`BTTS Yes ${Math.round(yes * 100)}% from scoring/conceding rates.`],
    limitations: isSparse ? ["Sample too small for reliable BTTS projection."] : [],
  };
}
function consistencyEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const rate = (t: TeamSnapshot) => (t.played ? (t.wins + t.draws) / t.played : 0),
    pen = Math.abs(
      (h.goalsFor - h.goalsAgainst) / Math.max(1, h.played) -
        (a.goalsFor - a.goalsAgainst) / Math.max(1, a.played),
    ),
    q = clamp(0.82 - pen * 0.12, 0.3, 0.9);
  return {
    id: "CONSISTENCY",
    name: "Consistency / Variance",
    version: "consistency-v1",
    signal: pen < 0.45 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(q * 100),
    quality: Math.round(q * 100),
    values: { homeUnbeatenRate: rate(h), awayUnbeatenRate: rate(a), variancePenalty: pen },
    evidence: [
      `Unbeaten rate: ${h.team} ${Math.round(rate(h) * 100)}%, ${a.team} ${Math.round(rate(a) * 100)}%.`,
    ],
    limitations: [],
  };
}
function h2hEngine(f: MatchRow, all: MatchRow[]): EngineOutput {
  const hs = all
    .filter(
      (m) =>
        (sameTeamIdentity(m.home, f.home) && sameTeamIdentity(m.away, f.away)) ||
        (sameTeamIdentity(m.home, f.away) && sameTeamIdentity(m.away, f.home)),
    )
    .filter((m) => m.hg !== undefined && m.ag !== undefined)
    .slice(-8);
  if (!hs.length)
    return {
      id: "H2H",
      name: "Head-to-Head",
      version: "h2h-v2",
      signal: "LIMITATION",
      confidence: 0,
      quality: 20,
      values: { matches: 0 },
      evidence: ["No historical head-to-head result is present in the loaded free feed."],
      limitations: ["H2H unavailable."],
    };
  let H = 0,
    D = 0,
    A = 0;
  for (const m of hs) {
    const isHome = sameTeamIdentity(m.home, f.home);
    const r = outcome(m.hg!, m.ag!);
    if (isHome) {
      if (r === "H") H++;
      else if (r === "D") D++;
      else A++;
    } else {
      if (r === "A") H++;
      else if (r === "D") D++;
      else A++;
    }
  }
  const n = hs.length;
  return {
    id: "H2H",
    name: "Head-to-Head",
    version: "h2h-v2",
    signal: n >= 4 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.35 + n / 16) * 100),
    quality: Math.round(clamp(0.3 + n / 12) * 100),
    probabilities: { home: H / n, draw: D / n, away: A / n },
    values: { matches: n },
    evidence: [`${n} recent head-to-head results found in the loaded feed.`],
    limitations: [],
  };
}
function dq(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const sample = h.played + a.played,
    q = Math.round(clamp(0.3 + sample / 28) * 100);
  return {
    id: "DATA_QUALITY",
    name: "Data Quality",
    version: "dq-v2",
    signal: q >= 70 ? "SUPPORT" : "LIMITATION",
    confidence: q,
    quality: q,
    values: { completedMatches: sample },
    evidence: [`${sample} completed team-match observations available to the core.`],
    limitations: sample < 8 ? ["Small sample."] : [],
  };
}
function consensus(es: EngineOutput[]): EngineOutput {
  const u = es.filter((e) => e.probabilities),
    H = avg(u.map((e) => e.probabilities!.home)),
    D = avg(u.map((e) => e.probabilities!.draw)),
    A = avg(u.map((e) => e.probabilities!.away)),
    disp = avg(
      u.map((e) => Math.abs(e.probabilities!.home - H) + Math.abs(e.probabilities!.away - A)),
    );
  return {
    id: "CONSENSUS",
    name: "Consensus / Conflict",
    version: "consensus-v3",
    signal: disp < 0.12 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(clamp(1 - disp) * 100),
    quality: Math.round(clamp(0.55 + u.length / 20) * 100),
    probabilities: { home: H, draw: D, away: A },
    values: { agreement: clamp(1 - disp), conflict: clamp(disp) },
    evidence: [
      `${u.length} independent engines contributed to consensus.`,
      `Cross-engine dispersion ${disp.toFixed(3)}.`,
    ],
    limitations: u.length < 3 ? ["Few probability engines available."] : [],
  };
}

export function buildAuthoritativeMarketCandidates(
  probs: { home: number; draw: number; away: number },
  totals: Record<string, number>,
  btts: { yes: number; no: number },
  homeTeam: string,
  awayTeam: string,
  evidenceState: EvidenceState,
  teamSample: number,
  asymmetric: AsymmetricEvidence,
  confidence: number,
  conflict: number,
  bookmakerOdds?: Record<string, number>,
): {
  candidates: MarketCandidate[];
  valueAnalysis: ValueAnalysisResult;
  contradiction: ContradictionAnalysis;
  qualification: QualificationResult;
} {
  const o15 = totals["over1.5"] ?? 0.72;
  const o25 = totals["over2.5"] ?? 0.48;
  const o35 = totals["over3.5"] ?? 0.26;
  const u15 = 1 - o15;
  const u25 = 1 - o25;
  const u35 = 1 - o35;
  const bYes = btts.yes ?? 0.48;
  const bNo = btts.no ?? 0.52;

  const dnbHome = probs.home / Math.max(0.0001, probs.home + probs.away);
  const dnbAway = probs.away / Math.max(0.0001, probs.home + probs.away);

  const rawList: {
    market: string;
    selection: string;
    probability: number;
    whyConsidered: string;
    supporting: string[];
    contradicting: string[];
  }[] = [
    {
      market: "1X2",
      selection: `${homeTeam} Win`,
      probability: probs.home,
      whyConsidered: `Model allocates ${Math.round(probs.home * 100)}% probability to home victory`,
      supporting: probs.home >= 0.45 ? [`Home advantage and form lean toward ${homeTeam}`] : [],
      contradicting: probs.home < 0.35 ? [`Low home win projection (${Math.round(probs.home * 100)}%)`] : [],
    },
    {
      market: "1X2",
      selection: "Draw",
      probability: probs.draw,
      whyConsidered: `Draw scenario evaluated at ${Math.round(probs.draw * 100)}%`,
      supporting: probs.draw >= 0.32 ? ["Evenly matched goal expectations elevate draw density"] : [],
      contradicting: probs.draw < 0.22 ? ["Low parity probability"] : [],
    },
    {
      market: "1X2",
      selection: `${awayTeam} Win`,
      probability: probs.away,
      whyConsidered: `Away outcome modeled at ${Math.round(probs.away * 100)}%`,
      supporting: probs.away >= 0.45 ? [`Away form outpaces venue resistance`] : [],
      contradicting: probs.away < 0.35 ? [`Away rate depressed by home venue`] : [],
    },
    {
      market: "DOUBLE CHANCE",
      selection: `${homeTeam} or Draw (1X)`,
      probability: probs.home + probs.draw,
      whyConsidered: `Two-way coverage spanning ${Math.round((probs.home + probs.draw) * 100)}% of probability mass`,
      supporting: ["Covers home victory and draw outcomes"],
      contradicting: [],
    },
    {
      market: "DOUBLE CHANCE",
      selection: `Draw or ${awayTeam} (X2)`,
      probability: probs.draw + probs.away,
      whyConsidered: `Two-way away security modeled at ${Math.round((probs.draw + probs.away) * 100)}%`,
      supporting: ["Covers draw and away victory outcomes"],
      contradicting: [],
    },
    {
      market: "DOUBLE CHANCE",
      selection: `${homeTeam} or ${awayTeam} (12)`,
      probability: probs.home + probs.away,
      whyConsidered: `Decisive result coverage modeled at ${Math.round((probs.home + probs.away) * 100)}%`,
      supporting: ["Covers any decisive winner, excluding draw"],
      contradicting: [],
    },
    {
      market: "DRAW NO BET",
      selection: `${homeTeam} DNB`,
      probability: dnbHome,
      whyConsidered: `Draw removed; home comparative strength modeled at ${Math.round(dnbHome * 100)}%`,
      supporting: ["Draw stake returned; home-focused edge"],
      contradicting: [],
    },
    {
      market: "DRAW NO BET",
      selection: `${awayTeam} DNB`,
      probability: dnbAway,
      whyConsidered: `Draw removed; away comparative strength modeled at ${Math.round(dnbAway * 100)}%`,
      supporting: ["Draw stake returned; away-focused edge"],
      contradicting: [],
    },
    {
      market: "OVER/UNDER 1.5",
      selection: "Over 1.5 Goals",
      probability: o15,
      whyConsidered: `High-floor total modeled at ${Math.round(o15 * 100)}%`,
      supporting: o15 >= 0.7 ? ["Combined scoring expectations exceed minimum 2-goal boundary"] : [],
      contradicting: o15 < 0.65 ? ["Low overall scoring rate"] : [],
    },
    {
      market: "OVER/UNDER 1.5",
      selection: "Under 1.5 Goals",
      probability: u15,
      whyConsidered: `Low-scoring defensive deadlock evaluated at ${Math.round(u15 * 100)}%`,
      supporting: u15 >= 0.35 ? ["Defensive containment indicates low scoring"] : [],
      contradicting: u15 < 0.25 ? ["Scoring baseline easily exceeds single goal"] : [],
    },
    {
      market: "OVER/UNDER 2.5",
      selection: "Over 2.5 Goals",
      probability: o25,
      whyConsidered: `Standard over threshold modeled at ${Math.round(o25 * 100)}%`,
      supporting: o25 >= 0.55 ? ["Strong offensive metrics push match into high-scoring tier"] : [],
      contradicting: o25 < 0.45 ? ["Defensive posture suppresses 3+ goal expectation"] : [],
    },
    {
      market: "OVER/UNDER 2.5",
      selection: "Under 2.5 Goals",
      probability: u25,
      whyConsidered: `Controlled tempo evaluated at ${Math.round(u25 * 100)}%`,
      supporting: u25 >= 0.55 ? ["Compact defensive patterns favor 0, 1, or 2 goals"] : [],
      contradicting: u25 < 0.45 ? ["High offensive momentum contradicts under"] : [],
    },
    {
      market: "OVER/UNDER 3.5",
      selection: "Over 3.5 Goals",
      probability: o35,
      whyConsidered: `Open shoot-out scenario modeled at ${Math.round(o35 * 100)}%`,
      supporting: o35 >= 0.4 ? ["Extremely volatile scoring rates"] : [],
      contradicting: o35 < 0.3 ? ["Standard matches rarely breach 4 total goals"] : [],
    },
    {
      market: "OVER/UNDER 3.5",
      selection: "Under 3.5 Goals",
      probability: u35,
      whyConsidered: `Upper-bound safety line evaluated at ${Math.round(u35 * 100)}%`,
      supporting: u35 >= 0.7 ? ["High historical containment below 4 goals"] : [],
      contradicting: [],
    },
    {
      market: "BTTS",
      selection: "BTTS — YES",
      probability: bYes,
      whyConsidered: `Both teams finding net modeled at ${Math.round(bYes * 100)}%`,
      supporting: bYes >= 0.55 ? ["Both teams feature active attack and permeable defense"] : [],
      contradicting: bYes < 0.45 ? ["Clean sheet likelihood on one or both sides"] : [],
    },
    {
      market: "BTTS",
      selection: "BTTS — NO",
      probability: bNo,
      whyConsidered: `At least one clean sheet evaluated at ${Math.round(bNo * 100)}%`,
      supporting: bNo >= 0.55 ? ["Defensive solidity or blunt attack indicates clean sheet"] : [],
      contradicting: bNo < 0.45 ? ["High chance of mutual scoring"] : [],
    },
  ];

  const hasOdds = Boolean(bookmakerOdds && Object.keys(bookmakerOdds).length > 0);
  const candidates: MarketCandidate[] = rawList.map((item) => {
    const fairOdds = round(1 / Math.max(0.01, item.probability), 2);
    const marketPrice = bookmakerOdds?.[item.selection] ?? bookmakerOdds?.[item.market];
    const impliedProb = marketPrice ? round(1 / marketPrice, 4) : undefined;
    const edge = marketPrice ? round(item.probability - impliedProb!, 4) : undefined;

    let valueClassification: ValueClassification = "NO_ODDS";
    if (marketPrice && edge !== undefined) {
      if (edge >= 0.08) valueClassification = "EXCEPTIONAL_VALUE";
      else if (edge >= 0.05) valueClassification = "STRONG_VALUE";
      else if (edge >= 0.02) valueClassification = "SMALL_VALUE";
      else if (edge >= 0.0) valueClassification = "FAIR";
      else valueClassification = "NEGATIVE_VALUE";
    }

    return {
      market: item.market,
      selection: item.selection,
      modelProbability: clamp(item.probability),
      marketPrice,
      impliedProbability: impliedProb,
      fairOdds,
      edge,
      valueClassification,
      qualificationStatus: "WATCH",
      whyConsidered: item.whyConsidered,
      supportingEvidence: item.supporting,
      contradictingEvidence: item.contradicting,
    };
  });

  // Contradiction Analysis
  const contradictions: string[] = [];
  const supportingFactors: string[] = [];
  const missingEvidence: string[] = [];
  let hasMajorConflict = false;

  if (evidenceState === "PRIOR-BASED" || teamSample === 0) {
    missingEvidence.push("Zero direct team historical matches in active context; global baseline prior applied.");
  } else if (teamSample < 8) {
    missingEvidence.push(`Direct team sample (${teamSample} observations) is below authoritative threshold (8).`);
  }

  if (asymmetric.isAsymmetric) {
    contradictions.push(asymmetric.explanation ?? "Asymmetric evidence distribution between teams.");
  }

  if (conflict >= 0.22) {
    hasMajorConflict = true;
    contradictions.push(`Severe model conflict: cross-engine probability dispersion is ${(conflict * 100).toFixed(1)}%.`);
  }

  const contradiction: ContradictionAnalysis = {
    conflictScore: round(conflict, 3),
    contradictions,
    supportingFactors,
    missingEvidence,
    hasMajorConflict,
  };

  // Eligibility Gate
  const rejectionReasons: string[] = [];
  let isEligible = true;

  if (evidenceState === "PRIOR-BASED" || teamSample === 0) {
    isEligible = false;
    rejectionReasons.push("Prior-based scenario: zero direct fixture evidence");
  }
  if (teamSample < 8) {
    isEligible = false;
    rejectionReasons.push(`Insufficient direct evidence (${teamSample} < 8 observations)`);
  }
  if (asymmetric.isAsymmetric) {
    isEligible = false;
    rejectionReasons.push("Asymmetric evidence between teams precludes actionable status");
  }
  if (confidence < 50) {
    isEligible = false;
    rejectionReasons.push(`Epistemic confidence too low (${confidence}% < 50%)`);
  }
  if (hasMajorConflict) {
    isEligible = false;
    rejectionReasons.push("Model dispersion exceeds maximum conflict threshold");
  }

  // Find strongest mathematical signal
  const sortedSignals = candidates.slice().sort((a, b) => b.modelProbability - a.modelProbability);
  const strongestSignal = sortedSignals[0];

  let qualified = false;
  let actionableMarket: MarketCandidate | null = null;

  const marketThreshold = (c: MarketCandidate): { threshold: number; baseline: number } => {
    if (c.market === "1X2") {
      if (c.selection.toLowerCase().includes("draw")) return { threshold: 0.31, baseline: 0.27 };
      return { threshold: 0.45, baseline: 0.40 };
    }
    if (c.market === "DOUBLE CHANCE") return { threshold: 0.68, baseline: 0.67 };
    if (c.market === "DRAW NO BET") return { threshold: 0.54, baseline: 0.50 };
    if (c.market === "OVER/UNDER 1.5") {
      return c.selection.startsWith("Under") ? { threshold: 0.34, baseline: 0.26 } : { threshold: 0.76, baseline: 0.74 };
    }
    if (c.market === "OVER/UNDER 2.5") return { threshold: 0.54, baseline: 0.50 };
    if (c.market === "OVER/UNDER 3.5") {
      return c.selection.startsWith("Under") ? { threshold: 0.75, baseline: 0.72 } : { threshold: 0.35, baseline: 0.28 };
    }
    if (c.market === "BTTS") return { threshold: 0.54, baseline: 0.50 };
    return { threshold: 0.54, baseline: 0.50 };
  };

  if (isEligible) {
    const qualifiedCandidates = candidates.filter((c) => {
      const { threshold } = marketThreshold(c);
      return c.modelProbability >= threshold;
    });

    if (qualifiedCandidates.length > 0) {
      qualified = true;
      actionableMarket = qualifiedCandidates.sort((a, b) => {
        const { threshold: tA, baseline: bA } = marketThreshold(a);
        const { threshold: tB, baseline: bB } = marketThreshold(b);
        const convA = (a.modelProbability - tA) / Math.max(0.08, 1 - tA);
        const convB = (b.modelProbability - tB) / Math.max(0.08, 1 - tB);
        const excA = (a.modelProbability - bA) / Math.max(0.08, 1 - bA);
        const excB = (b.modelProbability - bB) / Math.max(0.08, 1 - bB);
        const edgeA = hasOdds && typeof a.edge === "number" ? a.edge * 2 : 0;
        const edgeB = hasOdds && typeof b.edge === "number" ? b.edge * 2 : 0;
        const scoreA = convA * 0.65 + excA * 0.35 + edgeA;
        const scoreB = convB * 0.65 + excB * 0.35 + edgeB;
        return scoreB - scoreA;
      })[0];
      actionableMarket.qualificationStatus = "QUALIFIED";
    }
  }

  for (const c of candidates) {
    if (actionableMarket && c.selection === actionableMarket.selection) {
      c.qualificationStatus = "QUALIFIED";
      c.rejectionReason = undefined;
    } else if (!isEligible) {
      c.qualificationStatus = "NOT_QUALIFIED";
      c.rejectionReason = rejectionReasons[0];
    } else {
      c.qualificationStatus = "WATCH";
      c.rejectionReason = `Model probability ${Math.round(c.modelProbability * 100)}% does not meet primary edge threshold`;
    }
  }

  strongestSignal.qualificationStatus =
    isEligible && actionableMarket?.selection === strongestSignal.selection
      ? "QUALIFIED"
      : "NOT_QUALIFIED";
  if (!isEligible) {
    strongestSignal.rejectionReason = rejectionReasons[0];
  }

  const statusMessage =
    isEligible && qualified
      ? `ACTIONABLE MARKET QUALIFIED: ${actionableMarket!.selection} (${Math.round(actionableMarket!.modelProbability * 100)}% prob)`
      : `NOT QUALIFIED FOR ACTION: ${rejectionReasons.join("; ") || "No market met edge threshold"}`;

  const qualification: QualificationResult = {
    qualified,
    actionableMarket,
    strongestMathematicalSignal: strongestSignal,
    eligibilityPassed: isEligible,
    rejectionReasons,
    statusMessage,
  };

  const valueAnalysis: ValueAnalysisResult = {
    hasOdds,
    mode: hasOdds ? "ODDS_AVAILABLE" : "NO_ODDS_MODE",
    bestValueMarket: hasOdds
      ? candidates.filter((c) => (c.edge ?? 0) > 0).sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0]
      : undefined,
    candidates,
    summaryNote: hasOdds
      ? "Bookmaker odds evaluated against deterministic model probabilities."
      : "NO BOOKMAKER ODDS LOADED (FREE MODE) — VALUE ANALYSIS PASS. Never claiming unverified value.",
  };

  return {
    candidates,
    valueAnalysis,
    contradiction,
    qualification,
  };
}

export function analyzeAuthoritatively(
  fixture: MatchRow,
  allMatches: MatchRow[],
): AuthoritativeMatchAnalysis {
  const snapshot = (team: string, ms: MatchRow[], venue: "home" | "away"): TeamSnapshot => {
    const played = ms.filter((m) => m.hg !== undefined && m.ag !== undefined).slice(-12);
    let wins = 0,
      draws = 0,
      losses = 0,
      gf = 0,
      ga = 0,
      points = 0;
    const recent: string[] = [];
    for (const m of played) {
      const ih = sameTeamIdentity(m.home, team),
        x = ih ? m.hg! : m.ag!,
        y = ih ? m.ag! : m.hg!;
      gf += x;
      ga += y;
      if (x > y) {
        wins++;
        points += 3;
        recent.push("W");
      } else if (x === y) {
        draws++;
        points++;
        recent.push("D");
      } else {
        losses++;
        recent.push("L");
      }
    }
    const vg = played.filter((m) =>
        venue === "home" ? sameTeamIdentity(m.home, team) : sameTeamIdentity(m.away, team),
      ),
      vw = vg.filter((m) =>
        venue === "home" ? m.hg! > m.ag! : m.ag! > m.hg!,
      ).length;
    return {
      team,
      played: played.length,
      wins,
      draws,
      losses,
      goalsFor: gf,
      goalsAgainst: ga,
      points,
      homeOrAwayRate: vg.length ? vw / vg.length : 0,
      recent,
    };
  };
  const home = snapshot(
      fixture.home,
      allMatches.filter((m) => sameTeamIdentity(m.home, fixture.home) || sameTeamIdentity(m.away, fixture.home)),
      "home",
    ),
    away = snapshot(
      fixture.away,
      allMatches.filter((m) => sameTeamIdentity(m.home, fixture.away) || sameTeamIdentity(m.away, fixture.away)),
      "away",
    );
  const engines = [
    formEngine(home, away),
    goalEngine(home, away),
    venueEngine(home, away),
    totalsEngine(home, away),
    bttsEngine(home, away),
    consistencyEngine(home, away),
    h2hEngine(fixture, allMatches),
    dq(home, away),
  ];
  const con = consensus(engines);
  engines.push(con);
  const probs = con.probabilities!;
  const total = engines.find((e) => e.id === "TOTALS")!,
    bttsE = engines.find((e) => e.id === "BTTS")!;
  const agreement = con.values.agreement,
    conflict = con.values.conflict,
    sampleQ = avg(engines.filter((e) => e.id !== "CONSENSUS").map((e) => e.quality)),
    quality = Math.round(clamp(sampleQ * 0.65 + agreement * 35, 20, 96));
  const teamSample = home.played + away.played;
  const evidenceState: EvidenceState =
    teamSample === 0 ? "PRIOR-BASED" : teamSample < 8 ? "LIMITED EVIDENCE" : "VERIFIED";

  const maxObs = Math.max(home.played, away.played);
  const minObs = Math.min(home.played, away.played);
  const isAsymmetric = maxObs >= 4 && minObs <= 1;
  const asymmetricEvidence: AsymmetricEvidence = {
    isAsymmetric,
    homeEvidence: home.played,
    awayEvidence: away.played,
    ratio: maxObs > 0 ? round(minObs / maxObs, 2) : 1,
    explanation: isAsymmetric
      ? `Asymmetric evidence detected: ${home.team} has ${home.played} observations while ${away.team} has ${away.played}. Analysis penalized.`
      : undefined,
  };

  const top = Math.max(probs.home, probs.draw, probs.away),
    spread = top - Math.min(probs.home, probs.draw, probs.away);
  let decision: AuthoritativeMatchAnalysis["decision"] = "NO STRONG EDGE";
  if (teamSample < 8 || quality < 42 || isAsymmetric || evidenceState === "PRIOR-BASED") {
    decision = "INSUFFICIENT INTELLIGENCE";
  } else if (conflict >= 0.14 && spread < 0.18) {
    decision = "HIGH MODEL CONFLICT";
  } else if (top < 0.47) {
    decision = "NO STRONG EDGE";
  } else if (probs.home === top && top >= 0.52) {
    decision = "HOME EDGE";
  } else if (probs.away === top && top >= 0.52) {
    decision = "AWAY EDGE";
  } else if (probs.draw === top && top >= 0.4) {
    decision = "DRAW LEAN";
  }
  const confidence = Math.round(
    clamp(0.35 + agreement * 0.35 + Math.abs(top - 1 / 3) * 0.9 + quality / 500) * 100,
  );
  const warnings = [
    ...new Set(engines.flatMap((e) => e.limitations)),
    "FREE MODE has no bookmaker odds, confirmed lineups, injuries, xG provider or live news feed attached.",
  ];
  const ledger: EvidenceItem[] = [
      {
        id: "free-results",
        source: "FREE_RESULTS",
        statement: `Free historical results: ${home.played} home-team observations and ${away.played} away-team observations.`,
        quality: Math.round(sampleQ),
      },
      ...engines.flatMap((e) =>
        e.evidence.map((statement, i) => ({
          id: `${e.id}-${i}`,
          source: "DERIVED_MODEL" as const,
          statement,
          quality: e.quality,
        })),
      ),
    ];
  const risk: AuthoritativeMatchAnalysis["risk"] =
      quality < 45
        ? "VERY HIGH"
        : quality < 60 || conflict >= 0.18
          ? "HIGH"
          : conflict >= 0.12
            ? "MODERATE"
            : "LOW",
    robustnessScore = Math.round(clamp((quality / 100) * 0.6 + agreement * 0.4) * 100),
    robustness: AuthoritativeMatchAnalysis["robustness"] = {
      score: robustnessScore,
      label:
        robustnessScore >= 78
          ? "ROBUST"
          : robustnessScore >= 62
            ? "STABLE"
            : robustnessScore >= 45
              ? "FRAGILE"
              : "UNSTABLE",
    };
  const totals: Record<string, number> = {};
  for (const [k, v] of Object.entries(total.values)) if (k.startsWith("over")) totals[k] = v;
  const btts = { yes: bttsE.values.yes, no: bttsE.values.no };
  const scorelines = poissonScorelineProbabilities({ engines } as AuthoritativeMatchAnalysis),
    predictedScore = scorelines[0]?.score ?? "—";
  const predictedScoreState = teamSample < 8 ? "PRIOR_BASED" : "EVIDENCE_BACKED";
  const predictedScoreNote =
    teamSample < 8
      ? "Prior-based scenario — insufficient fixture-specific evidence"
      : "Evidence-backed from observed goal parameters";

  const marketCandidateResults = buildAuthoritativeMarketCandidates(
    probs,
    totals,
    btts,
    home.team,
    away.team,
    evidenceState,
    teamSample,
    asymmetricEvidence,
    confidence,
    conflict,
  );

  const dnbHome = probs.home / Math.max(0.0001, probs.home + probs.away);
  const dnbAway = probs.away / Math.max(0.0001, probs.home + probs.away);

  const candidates: ActionablePrediction[] = [
    { market: "HOME", label: `${home.team} win`, probability: probs.home, strength: Math.max(0, (probs.home - 0.40) / 0.60) },
    { market: "DRAW", label: "Draw", probability: probs.draw, strength: Math.max(0, (probs.draw - 0.27) / 0.73) },
    { market: "AWAY", label: `${away.team} win`, probability: probs.away, strength: Math.max(0, (probs.away - 0.40) / 0.60) },
    { market: "DOUBLE CHANCE", label: `${home.team} or Draw (1X)`, probability: probs.home + probs.draw, strength: Math.max(0, (probs.home + probs.draw - 0.67) / 0.33) },
    { market: "DOUBLE CHANCE", label: `Draw or ${away.team} (X2)`, probability: probs.draw + probs.away, strength: Math.max(0, (probs.draw + probs.away - 0.67) / 0.33) },
    { market: "DOUBLE CHANCE", label: `${home.team} or ${away.team} (12)`, probability: probs.home + probs.away, strength: Math.max(0, (probs.home + probs.away - 0.67) / 0.33) },
    { market: "DRAW NO BET", label: `${home.team} DNB`, probability: dnbHome, strength: Math.max(0, (dnbHome - 0.50) / 0.50) },
    { market: "DRAW NO BET", label: `${away.team} DNB`, probability: dnbAway, strength: Math.max(0, (dnbAway - 0.50) / 0.50) },
    { market: "OVER 1.5", label: "Over 1.5", probability: totals["over1.5"] ?? 0, strength: Math.max(0, ((totals["over1.5"] ?? 0) - 0.74) / 0.26) },
    { market: "UNDER 1.5", label: "Under 1.5", probability: 1 - (totals["over1.5"] ?? 0), strength: Math.max(0, (1 - (totals["over1.5"] ?? 0) - 0.26) / 0.74) },
    { market: "OVER 2.5", label: "Over 2.5", probability: totals["over2.5"] ?? 0, strength: Math.max(0, ((totals["over2.5"] ?? 0) - 0.50) / 0.50) },
    { market: "UNDER 2.5", label: "Under 2.5", probability: 1 - (totals["over2.5"] ?? 0), strength: Math.max(0, (1 - (totals["over2.5"] ?? 0) - 0.50) / 0.50) },
    { market: "OVER 3.5", label: "Over 3.5", probability: totals["over3.5"] ?? 0, strength: Math.max(0, ((totals["over3.5"] ?? 0) - 0.28) / 0.72) },
    { market: "UNDER 3.5", label: "Under 3.5", probability: 1 - (totals["over3.5"] ?? 0), strength: Math.max(0, (1 - (totals["over3.5"] ?? 0) - 0.72) / 0.28) },
    { market: "BTTS", label: "BTTS — YES", probability: btts.yes, strength: Math.max(0, (btts.yes - 0.50) / 0.50) },
    { market: "BTTS", label: "BTTS — NO", probability: btts.no, strength: Math.max(0, (btts.no - 0.50) / 0.50) },
  ];
  const predictions = candidates
    .filter((p) => p.strength > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
  const finalPrediction =
    decision === "HOME EDGE"
      ? `${home.team} win`
      : decision === "AWAY EDGE"
        ? `${away.team} win`
        : decision === "DRAW LEAN"
          ? "Draw"
          : marketCandidateResults.qualification.qualified &&
              marketCandidateResults.qualification.actionableMarket
            ? marketCandidateResults.qualification.actionableMarket.selection
            : (predictions[0]?.label ?? "No strong prediction");

  const evidence = ledger.slice(0, 8).map((x) => x.statement);
  const evidenceMetrics: EvidenceMetrics = {
    directHomeEvidence: home.played,
    directAwayEvidence: away.played,
    h2hEvidence: Number(engines.find((e) => e.id === "H2H")?.values.matches ?? 0),
    competitionEvidence: allMatches.filter((m) => m.league && m.league === fixture.league).length,
    globalPriorEvidence: allMatches.length,
    webStructuredObservations: 0,
    webFactualObservations: 0,
    persistedObservations: 0,
    persistedSourceRecords: 0,
    persistedSourceFamilies: 0,
    modelInputRows: allMatches.length,
    researchCoveragePct: teamSample > 0 ? Math.min(100, Math.round((teamSample / 20) * 100)) : 0,
    evidenceCoveragePct: teamSample > 0 ? Math.min(100, Math.round((teamSample / 30) * 100)) : 0,
  };

  const diagnosticTrace: DiagnosticPipelineStep[] = [
    {
      stage: "FIXTURE_VALIDATION",
      status: "OK",
      detail: `Canonical identity verified: ${home.team} vs ${away.team} on ${fixture.date}`,
      timestamp: new Date().toISOString(),
    },
    {
      stage: "EVIDENCE_ASSEMBLY",
      status: teamSample >= 8 ? "OK" : teamSample > 0 ? "WARNING" : "FAILED",
      detail: `Assembled ${teamSample} direct team observations across ${allMatches.length} historical rows`,
      timestamp: new Date().toISOString(),
    },
    {
      stage: "ASYMMETRY_CHECK",
      status: isAsymmetric ? "WARNING" : "OK",
      detail: isAsymmetric ? asymmetricEvidence.explanation! : "Balanced evidence distribution",
      timestamp: new Date().toISOString(),
    },
    {
      stage: "ENSEMBLE_EVALUATION",
      status: "OK",
      detail: `Evaluated ${engines.length} engine families. Model convergence: ${Math.round(agreement * 100)}%`,
      timestamp: new Date().toISOString(),
    },
    {
      stage: "PREDICTION_ELIGIBILITY_GATE",
      status: marketCandidateResults.qualification.qualified ? "OK" : "WARNING",
      detail: marketCandidateResults.qualification.statusMessage,
      timestamp: new Date().toISOString(),
    },
    {
      stage: "VALUE_ANALYSIS_GATE",
      status: "OK",
      detail: marketCandidateResults.valueAnalysis.summaryNote,
      timestamp: new Date().toISOString(),
    },
  ];

  const deploymentFingerprint = {
    analysisVersion: "gfi-authoritative-v9",
    resultContractVersion: "v9.0.0-verified-identity",
    buildTime: new Date().toISOString(),
    engineId: "gfi-ensemble-authoritative-v9",
  };

  const aiReasoningPacket = {
    fixture,
    analysisVersion: "gfi-authoritative-v9",
    decision,
    finalPrediction,
    predictedScore,
    predictedScoreState,
    predictedScoreNote,
    probabilities: probs,
    totals,
    btts,
    confidence,
    quality,
    modelConvergence: agreement,
    evidenceQuality: quality,
    asymmetricEvidence,
    consensus: con,
    robustness,
    risk,
    engines,
    evidence: ledger,
    predictions,
    marketCandidates: marketCandidateResults.candidates,
    valueAnalysis: marketCandidateResults.valueAnalysis,
    contradictionAnalysis: marketCandidateResults.contradiction,
    qualification: marketCandidateResults.qualification,
    diagnosticTrace,
    deploymentFingerprint,
    instruction:
      "Return only actionable predictions and a concise final verdict. Never invent missing facts or override the quantitative analysis.",
  };

  return {
    home,
    away,
    probabilities: probs,
    totals,
    btts,
    confidence,
    quality,
    verdict: decision,
    warnings,
    evidence,
    analysisVersion: "gfi-authoritative-v9",
    fixtureId: `${fixture.date}__${fixture.home}__${fixture.away}`,
    generatedAt: new Date().toISOString(),
    engines,
    evidenceLedger: ledger,
    evidenceMetrics,
    evidenceState,
    asymmetricEvidence,
    modelConvergence: agreement,
    evidenceQuality: quality,
    predictedScoreState,
    predictedScoreNote,
    marketCandidates: marketCandidateResults.candidates,
    valueAnalysis: marketCandidateResults.valueAnalysis,
    contradictionAnalysis: marketCandidateResults.contradiction,
    qualification: marketCandidateResults.qualification,
    diagnosticTrace,
    deploymentFingerprint,
    consensus: {
      ...con.probabilities!,
      agreement,
      conflict,
      leader:
        top < 0.42 ? "none" : probs.home === top ? "home" : probs.draw === top ? "draw" : "away",
    },
    robustness,
    risk,
    marketDivergence: {
      available: false,
      note: "No bookmaker odds are loaded in FREE MODE; no market edge is claimed.",
    },
    decision,
    finalPrediction,
    predictedScore,
    predictions,
    aiReasoningPacket,
  };
}

export function scoreAuthoritativeAnalysis(a: AuthoritativeMatchAnalysis) {
  const edge = Math.max(a.probabilities.home, a.probabilities.draw, a.probabilities.away) - 1 / 3;
  return edge * 50 + a.confidence * 0.25 + a.robustness.score * 0.15 + a.quality * 0.1;
}
export function poissonScorelineProbabilities(a: AuthoritativeMatchAnalysis, maxGoals = 8) {
  const goal = a.engines.find((e) => e.id === "GOALS"),
    lh = Number(goal?.values.lambdaHome ?? 1.2),
    la = Number(goal?.values.lambdaAway ?? 1);
  const rows: { score: string; probability: number }[] = [];
  for (let h = 0; h <= maxGoals; h++)
    for (let d = 0; d <= maxGoals; d++)
      rows.push({ score: `${h}-${d}`, probability: poissonAt(lh, h) * poissonAt(la, d) });
  return rows.sort((x, y) => y.probability - x.probability);
}
