import type { MatchRow } from "./intelligence";
import type { AuthoritativeMatchAnalysis } from "./authoritative";

export type LedgerPrediction = {
  id: string;
  createdAt: string;
  fixture: MatchRow & { league?: string; code?: string };
  analysisVersion: string;
  predictedOutcome: "H" | "D" | "A";
  probabilities: AuthoritativeMatchAnalysis["probabilities"];
  totals: AuthoritativeMatchAnalysis["totals"];
  btts: AuthoritativeMatchAnalysis["btts"];
  verdict: string;
  decision: AuthoritativeMatchAnalysis["decision"];
  confidence: number;
  quality: number;
  consensus: AuthoritativeMatchAnalysis["consensus"];
  robustness: AuthoritativeMatchAnalysis["robustness"];
  risk: AuthoritativeMatchAnalysis["risk"];
  evidence: AuthoritativeMatchAnalysis["evidenceLedger"];
  engineIds: string[];
  status: "OPEN" | "SETTLED";
  outcome?: "H" | "D" | "A";
  correct?: boolean;
};

const KEY = "gfi_prediction_ledger_v3";
const LEGACY_KEYS = ["gfi_prediction_ledger_v2", "gfi_prediction_ledger_v1"];
const argmax = (p: LedgerPrediction["probabilities"]): LedgerPrediction["predictedOutcome"] =>
  p.home >= p.draw && p.home >= p.away ? "H" : p.away >= p.draw ? "A" : "D";

function isBrowser() { return typeof window !== "undefined" && !!window.localStorage; }
function readRaw(key: string): unknown[] {
  if (!isBrowser()) return [];
  try { const value = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}

function migrate(value: any): LedgerPrediction {
  const probabilities = value.probabilities ?? { home: 0, draw: 0, away: 0 };
  const predictedOutcome = value.predictedOutcome ?? argmax(probabilities);
  return {
    id: String(value.id ?? crypto.randomUUID()),
    createdAt: String(value.createdAt ?? new Date().toISOString()),
    fixture: value.fixture,
    analysisVersion: String(value.analysisVersion ?? value.modelVersion ?? "legacy"),
    predictedOutcome,
    probabilities,
    totals: value.totals ?? {},
    btts: value.btts ?? { yes: 0, no: 0 },
    verdict: String(value.verdict ?? value.decision ?? "NO STRONG EDGE"),
    decision: value.decision ?? "NO STRONG EDGE",
    confidence: Number(value.confidence ?? 0),
    quality: Number(value.quality ?? 0),
    consensus: value.consensus ?? { home: probabilities.home, draw: probabilities.draw, away: probabilities.away, agreement: 0, conflict: 1, leader: "none" },
    robustness: value.robustness ?? { score: value.quality ?? 0, label: "FRAGILE" },
    risk: value.risk ?? "HIGH",
    evidence: value.evidence ?? [],
    engineIds: value.engineIds ?? [],
    status: value.status === "SETTLED" ? "SETTLED" : "OPEN",
    outcome: value.outcome,
    correct: typeof value.correct === "boolean" ? value.correct : undefined,
  };
}

export function readLedger(): LedgerPrediction[] {
  if (!isBrowser()) return [];
  const current = readRaw(KEY).map(migrate);
  if (current.length) return current;
  for (const key of LEGACY_KEYS) {
    const legacy = readRaw(key).map(migrate);
    if (legacy.length) {
      window.localStorage.setItem(KEY, JSON.stringify(legacy.slice(0, 500)));
      return legacy;
    }
  }
  return [];
}

export function saveAuthoritativePrediction(analysis: AuthoritativeMatchAnalysis, fixture: MatchRow & { league?: string; code?: string }) {
  if (!isBrowser()) return null;
  const row: LedgerPrediction = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    fixture,
    analysisVersion: analysis.analysisVersion,
    predictedOutcome: argmax(analysis.probabilities),
    probabilities: analysis.probabilities,
    totals: analysis.totals,
    btts: analysis.btts,
    verdict: analysis.verdict,
    decision: analysis.decision,
    confidence: analysis.confidence,
    quality: analysis.quality,
    consensus: analysis.consensus,
    robustness: analysis.robustness,
    risk: analysis.risk,
    evidence: analysis.evidenceLedger,
    engineIds: analysis.engines.map((e) => e.id),
    status: "OPEN",
  };
  window.localStorage.setItem(KEY, JSON.stringify([row, ...readLedger()].slice(0, 500)));
  return row;
}

export function settlePrediction(id: string, outcome: "H" | "D" | "A") {
  if (!isBrowser()) return [] as LedgerPrediction[];
  const next = readLedger().map((p) => p.id === id ? { ...p, status: "SETTLED" as const, outcome, correct: outcome === p.predictedOutcome } : p);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function autoSettleCompleted() {
  if (!isBrowser()) return [] as LedgerPrediction[];
  const next = readLedger().map((p) => {
    const actual = p.fixture.result as "H" | "D" | "A" | undefined;
    if (p.status === "OPEN" && actual) return { ...p, status: "SETTLED" as const, outcome: actual, correct: actual === p.predictedOutcome };
    return p;
  });
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function calibrationReport() {
  const settled = readLedger().filter((p) => p.status === "SETTLED" && p.outcome);
  if (!settled.length) return { settled: 0, wins: 0, hitRate: 0, brier: 0, logLoss: 0 };
  let brier = 0, logLoss = 0;
  for (const p of settled) {
    const q = p.outcome === "H" ? p.probabilities.home : p.outcome === "D" ? p.probabilities.draw : p.probabilities.away;
    brier += (1 - q) ** 2;
    logLoss -= Math.log(Math.max(0.0001, q));
  }
  const wins = settled.filter((p) => p.correct).length;
  return { settled: settled.length, wins, hitRate: wins / settled.length, brier: brier / settled.length, logLoss: logLoss / settled.length };
}

export function clearLedger() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEY);
  LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key));
}
