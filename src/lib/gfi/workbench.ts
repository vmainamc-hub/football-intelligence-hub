import { analyzeMatch, loadFreeFixtures, type IntelligenceResult, type MatchRow } from "@/lib/gfi/intelligence";

export type FixtureGroup = { league: string; code: string; matches: MatchRow[] };
export type ScoredFixture = MatchRow & { league: string; score: number; verdict: string; quality: number; confidence: number; result: IntelligenceResult };

export async function loadWorkbench(): Promise<FixtureGroup[]> {
  return loadFreeFixtures();
}

export function flattenCompleted(groups: FixtureGroup[]) {
  return groups.flatMap(g => g.matches.filter(m => m.hg !== undefined && m.ag !== undefined).map(m => ({ ...m, league: g.league })));
}

export function rankBatch(groups: FixtureGroup[], limit = 24): ScoredFixture[] {
  const all = flattenCompleted(groups);
  const out: ScoredFixture[] = [];
  for (const fixture of all.slice(-Math.max(limit * 3, 72))) {
    const sameLeague = groups.find(g => g.league === fixture.league)?.matches ?? [];
    const result = analyzeMatch(fixture, sameLeague);
    const edge = Math.max(result.probabilities.home, result.probabilities.draw, result.probabilities.away) - 1 / 3;
    const score = edge * 100 * 0.6 + result.confidence * 0.25 + result.quality * 0.15;
    out.push({ ...fixture, score, verdict: result.verdict, quality: result.quality, confidence: result.confidence, result });
  }
  return out.sort((a,b) => b.score - a.score).slice(0, limit);
}

export type SimulationSummary = {
  iterations: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  topScores: { score: string; count: number; probability: number }[];
};

function poisson(lambda: number) {
  const u = Math.random();
  let p = Math.exp(-lambda), cumulative = p, k = 0;
  while (u > cumulative && k < 12) { k++; p *= lambda / k; cumulative += p; }
  return k;
}

export function simulateMatch(fixture: MatchRow, all: MatchRow[], iterations = 10000): SimulationSummary {
  const base = analyzeMatch(fixture, all);
  const homeRate = Math.max(0.15, -Math.log(Math.max(0.001, 1 - base.probabilities.home)) * 1.55);
  const awayRate = Math.max(0.12, -Math.log(Math.max(0.001, 1 - base.probabilities.away)) * 1.35);
  let h = 0, d = 0, a = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0;
  const scores = new Map<string, number>();
  for (let i=0;i<iterations;i++) {
    const hg = poisson(homeRate), ag = poisson(awayRate), total = hg + ag;
    if (hg > ag) h++; else if (hg === ag) d++; else a++;
    if (total >= 2) o15++; if (total >= 3) o25++; if (total >= 4) o35++; if (hg > 0 && ag > 0) btts++;
    const key = `${hg}-${ag}`; scores.set(key, (scores.get(key) ?? 0) + 1);
  }
  const topScores = [...scores.entries()].sort((x,y)=>y[1]-x[1]).slice(0,8).map(([score,count])=>({score,count,probability:count/iterations}));
  return { iterations, homeWin:h/iterations, draw:d/iterations, awayWin:a/iterations, over15:o15/iterations, over25:o25/iterations, over35:o35/iterations, btts:btts/iterations, topScores };
}

export type Prediction = {
  id: string;
  createdAt: string;
  fixture: MatchRow & { league?: string };
  probabilities: IntelligenceResult["probabilities"];
  totals: IntelligenceResult["totals"];
  btts: IntelligenceResult["btts"];
  verdict: string;
  confidence: number;
  quality: number;
  modelVersion: string;
  status: "OPEN" | "SETTLED";
  outcome?: "H" | "D" | "A";
  correct?: boolean;
};

const LEDGER_KEY = "gfi_prediction_ledger_v1";
export function readLedger(): Prediction[] { try { return JSON.parse(localStorage.getItem(LEDGER_KEY) ?? "[]"); } catch { return []; } }
export function savePrediction(p: Omit<Prediction,"id"|"createdAt"|"status">) {
  const row: Prediction = { ...p, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status:"OPEN" };
  const ledger = [row, ...readLedger()]; localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger.slice(0,500))); return row;
}
export function settlePrediction(id: string, outcome: "H"|"D"|"A") {
  const ledger = readLedger().map(p => p.id === id ? { ...p, status:"SETTLED" as const, outcome, correct: outcome === p.fixture.result } : p);
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); return ledger;
}
export function clearLedger() { localStorage.removeItem(LEDGER_KEY); }
