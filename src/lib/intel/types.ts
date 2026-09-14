export const MARKETS = [
  "home",
  "draw",
  "away",
  "dc1x",
  "dcx2",
  "dc12",
  "over05",
  "over15",
  "over25",
  "over35",
  "under05",
  "under15",
  "under25",
  "under35",
  "bttsYes",
  "bttsNo",
  "homeOver05",
  "homeOver15",
  "awayOver05",
  "awayOver15",
] as const;

export type Market = (typeof MARKETS)[number];

export const MARKET_LABELS: Record<Market, string> = {
  home: "Home win",
  draw: "Draw",
  away: "Away win",
  dc1x: "Double chance 1X",
  dcx2: "Double chance X2",
  dc12: "Double chance 12",
  over05: "Over 0.5 goals",
  over15: "Over 1.5 goals",
  over25: "Over 2.5 goals",
  over35: "Over 3.5 goals",
  under05: "Under 0.5 goals",
  under15: "Under 1.5 goals",
  under25: "Under 2.5 goals",
  under35: "Under 3.5 goals",
  bttsYes: "Both teams to score — Yes",
  bttsNo: "Both teams to score — No",
  homeOver05: "Home team over 0.5",
  homeOver15: "Home team over 1.5",
  awayOver05: "Away team over 0.5",
  awayOver15: "Away team over 1.5",
};

export const MARKET_GROUPS: { group: string; markets: Market[] }[] = [
  { group: "Match result", markets: ["home", "draw", "away"] },
  { group: "Double chance", markets: ["dc1x", "dcx2", "dc12"] },
  { group: "Total goals", markets: ["over05", "over15", "over25", "over35", "under05", "under15", "under25", "under35"] },
  { group: "Both teams to score", markets: ["bttsYes", "bttsNo"] },
  { group: "Team goals", markets: ["homeOver05", "homeOver15", "awayOver05", "awayOver15"] },
];

export type MarketSurface = Partial<Record<Market, number>>;

export type EngineStatus = "OK" | "DATA_SOURCE_UNAVAILABLE" | "NOT_CONFIGURED" | "INSUFFICIENT_DATA";

export type EngineOutput = {
  id: string;
  name: string;
  family: string;
  status: EngineStatus;
  statusDetail?: string;
  weight: number;
  confidence: number;
  lambdas?: { home: number; away: number };
  markets: MarketSurface;
  notes: string[];
};

export type EvidenceItem = {
  claim: string;
  category: string;
  source: string;
  sourceKind: "COMPUTED" | "OPEN_DATASET" | "PROVIDER" | "SYSTEM";
  reliability: number;
  confidence: number;
  freshnessDays: number | null;
  observedAt: string | null;
  url?: string;
  conflict?: string;
};

export type Conflict = {
  market: Market;
  spread: number;
  severity: "MINOR" | "MATERIAL" | "SEVERE";
  leaning: { engine: string; probability: number }[];
  explanation: string;
};

export type OutcomeCandidate = {
  market: Market;
  label: string;
  probability: number;
  consensus: number;
  stability: number;
  dataQuality: number;
  engineCount: number;
  fairOdds: number;
  score: number;
};

export type SimulationResult = {
  runs: number;
  markets: MarketSurface;
  topScores: { score: string; p: number }[];
  goalDistribution: { goals: number; p: number }[];
  scenarios: {
    homeScoresFirst: number;
    awayScoresFirst: number;
    noGoal: number;
    homeComeback: number;
    awayComeback: number;
    firstHalfGoal: number;
    lateWinner: number;
  };
};

export type VerdictKind =
  | "STRONGEST_OUTCOME"
  | "NO_STRONG_EDGE"
  | "INSUFFICIENT_INTELLIGENCE"
  | "HIGH_MODEL_CONFLICT"
  | "DATA_QUALITY_TOO_LOW";

export type Verdict = {
  kind: VerdictKind;
  headline: string;
  detail: string;
  outcome?: OutcomeCandidate;
};

export type AnalysisPayload = {
  matchId: string;
  version: string;
  inputsHash: string;
  createdAt: string;
  probabilities: MarketSurface;
  consensusByMarket: Partial<Record<Market, number>>;
  stabilityByMarket: Partial<Record<Market, number>>;
  dataQuality: number;
  stability: number;
  consensus: number;
  engines: EngineOutput[];
  simulation: SimulationResult;
  evidence: EvidenceItem[];
  conflicts: Conflict[];
  outcomes: OutcomeCandidate[];
  verdict: Verdict;
  sourceHealth: Record<string, { status: string; detail: string }>;
  lambdas: { home: number; away: number };
  marketDivergence: null | { note: string };
};
