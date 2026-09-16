import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow, type FreeLeague } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { deriveConsensusActionability } from "./actionability";
import type { MarketSignal } from "./market-map";

export type BatchIntent = {
  raw: string;
  count: number;
  scope: "TODAY" | "NEXT";
  mode: "ACTIONABLE" | "SAFEST" | "SLIP" | "MARKET" | "HOME" | "AWAY" | "DRAW";
  market?: MarketSignal["market"];
  marketSelection?: string;
};

export type BatchSelection = {
  fixture: MatchRow & { league: string; code: string; season: string };
  analysis: ServerMatchAnalysis;
  market: MarketSignal;
  score: number;
  status: "QUALIFIED" | "WATCH" | "NO QUALIFIED MARKET";
  reason: string;
};

export type BatchAnalysisResponse = {
  request: string;
  intent: BatchIntent;
  requested: number;
  candidatePool: number;
  analysisBudget: number;
  analysed: number;
  qualified: number;
  returned: number;
  selections: BatchSelection[];
  generatedAt: string;
  message: string;
};

function dateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function todayEAT() {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().slice(0, 10);
}

function kickoffValue(match: MatchRow) {
  return `${dateKey(match.date)}T${match.time ?? "23:59"}`;
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.]+/g, " ").trim();
}

function parseCount(text: string) {
  const numeric = text.match(/\b(\d{1,2})\b/);
  return Math.max(1, Math.min(40, Number(numeric?.[1] ?? 10)));
}

function parseIntent(raw: string): BatchIntent {
  const text = normalizeText(raw);
  const count = parseCount(text);
  const isNext = /\bnext\b/.test(text);
  const mode: BatchIntent["mode"] = /\b(safest|safe)\b/.test(text)
    ? "SAFEST"
    : /\bslip\b/.test(text)
      ? "SLIP"
      : /\bhome\b/.test(text) && !/\baway\b/.test(text)
        ? "HOME"
        : /\baway\b/.test(text)
          ? "AWAY"
          : /\bdraw\b/.test(text)
            ? "DRAW"
            : "ACTIONABLE";
  let market: BatchIntent["market"];
  let marketSelection: string | undefined;
  if (/\b(gg|btts yes|both teams to score)\b/.test(text)) {
    market = "BTTS"; marketSelection = "BTTS — YES";
  } else if (/\bbtts no\b/.test(text)) {
    market = "BTTS"; marketSelection = "BTTS — NO";
  } else if (/\bover\s*1\.5\b/.test(text)) {
    market = "OVER/UNDER 1.5"; marketSelection = "OVER 1.5";
  } else if (/\bunder\s*1\.5\b/.test(text)) {
    market = "OVER/UNDER 1.5"; marketSelection = "UNDER 1.5";
  } else if (/\bover\s*2\.5\b/.test(text)) {
    market = "OVER/UNDER 2.5"; marketSelection = "OVER 2.5";
  } else if (/\bunder\s*2\.5\b/.test(text)) {
    market = "OVER/UNDER 2.5"; marketSelection = "UNDER 2.5";
  } else if (/\bover\s*3\.5\b/.test(text)) {
    market = "OVER/UNDER 3.5"; marketSelection = "OVER 3.5";
  } else if (/\bunder\s*3\.5\b/.test(text)) {
    market = "OVER/UNDER 3.5"; marketSelection = "UNDER 3.5";
  } else if (/\bdouble chance\b/.test(text)) {
    market = "DOUBLE CHANCE";
  } else if (/\b(draw no bet|dnb)\b/.test(text)) {
    market = "DRAW NO BET";
  }
  const scope: BatchIntent["scope"] = isNext || !/\b(today|todays|today's)\b/.test(text) ? "NEXT" : "TODAY";
  return { raw, count, scope, mode: market ? "MARKET" : mode, market, marketSelection };
}

function fixtureId(fixture: MatchRow) {
  return [dateKey(fixture.date), normalizeText(fixture.home), normalizeText(fixture.away), fixture.time ?? ""].join("|");
}

function uniqueFixtures(groups: FreeLeague[]) {
  const unique = new Map<string, MatchRow & { league: string; code: string; season: string }>();
  for (const group of groups) for (const fixture of group.matches) {
    if (fixture.hg !== undefined || fixture.ag !== undefined) continue;
    const enriched = { ...fixture, league: group.league, code: group.code, season: group.season };
    const key = fixtureId(enriched);
    if (!unique.has(key)) unique.set(key, enriched);
  }
  return [...unique.values()].sort((a, b) => kickoffValue(a).localeCompare(kickoffValue(b)));
}

function diversifyCandidates(fixtures: ReturnType<typeof uniqueFixtures>, limit: number) {
  if (fixtures.length <= limit) return fixtures;
  const buckets = new Map<string, typeof fixtures>();
  for (const fixture of fixtures) {
    const key = normalizeText(fixture.league ?? "Worldwide Football") || "worldwide football";
    const bucket = buckets.get(key) ?? [];
    bucket.push(fixture); buckets.set(key, bucket);
  }
  const ordered = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  const selected: typeof fixtures = [];
  let cursor = 0;
  while (selected.length < limit && ordered.length) {
    const index = cursor % ordered.length;
    const bucket = ordered[index][1];
    selected.push(bucket.shift()!);
    if (!bucket.length) ordered.splice(index, 1); else cursor++;
  }
  return selected.sort((a, b) => kickoffValue(a).localeCompare(kickoffValue(b)));
}

async function mapConcurrent<T, R>(items: T[], workerCount: number, worker: (item: T) => Promise<R | undefined>) {
  const results: Array<R | undefined> = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = await worker(items[index]); } catch { results[index] = undefined; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, () => runWorker()));
  return results.filter((item): item is R => item !== undefined);
}

function candidateToSignal(result: ServerMatchAnalysis, intent: BatchIntent): MarketSignal | undefined {
  const action = deriveConsensusActionability(result).actionableMarket;
  if (!action) return undefined;
  if (intent.mode === "HOME" || intent.mode === "AWAY" || intent.mode === "DRAW") {
    const key = intent.mode === "HOME" ? "home" : intent.mode === "AWAY" ? "away" : "draw";
    const p = result.probabilities[key];
    const selection = intent.mode === "HOME" ? `${result.home.team} Win` : intent.mode === "AWAY" ? `${result.away.team} Win` : "DRAW";
    return { market: "1X2", selection, probability: p, confidence: result.confidence, tier: p >= 0.57 ? "PRIMARY" : "SECONDARY", rationale: `Authoritative 1X2 probability for ${selection} is ${(p * 100).toFixed(1)}%.` };
  }
  if (intent.mode === "MARKET" && intent.market) {
    const wanted = (result.marketCandidates ?? []).filter(c => c.market === intent.market && (!intent.marketSelection || c.selection === intent.marketSelection));
    const exact = wanted.sort((a, b) => b.modelProbability - a.modelProbability)[0];
    if (!exact) return undefined;
    return { market: exact.market, selection: exact.selection, probability: exact.modelProbability, confidence: result.confidence, tier: exact.modelProbability >= 0.62 ? "PRIMARY" : "SECONDARY", rationale: `Authoritative model probability for ${exact.selection} is ${(exact.modelProbability * 100).toFixed(1)}%.` };
  }
  return { market: action.market, selection: action.selection, probability: action.modelProbability, confidence: result.confidence, tier: "PRIMARY", rationale: action.whyConsidered ?? "Selected by the authoritative cross-engine actionability layer." };
}

function selectionScore(result: ServerMatchAnalysis, signal: MarketSignal, mode: BatchIntent["mode"]) {
  const base = signal.probability * 0.48 + (result.confidence / 100) * 0.18 + (result.robustness.score / 100) * 0.16 + (result.quality / 100) * 0.12 + result.consensus.agreement * 0.06;
  const conflictPenalty = result.consensus.conflict * 0.18;
  const modeBonus = mode === "SAFEST" && result.risk === "LOW" ? 0.06 : mode === "SAFEST" && result.risk === "MODERATE" ? 0.02 : mode === "SLIP" ? 0.02 : 0;
  return base + modeBonus - conflictPenalty;
}

function targetCandidates(fixtures: ReturnType<typeof uniqueFixtures>, intent: BatchIntent) {
  const today = todayEAT();
  return fixtures.filter(fixture => intent.scope === "TODAY" ? dateKey(fixture.date) === today : dateKey(fixture.date) >= today);
}

export type BatchAnalysisInput = { request?: string; limit?: number; includeUpcoming?: boolean };

export async function runBatchAnalysisInternal(data: BatchAnalysisInput): Promise<BatchAnalysisResponse> {
  const request = (data.request ?? (data.limit ? `Give me ${data.limit} safest picks` : "Predict today's next matches")).trim();
  const intent = parseIntent(request);
  const groups = await loadFreeFixtures();
  const allCandidates = targetCandidates(uniqueFixtures(groups), intent);
  const analysisBudget = Math.min(360, Math.max(160, intent.count * 12));
  const pool = diversifyCandidates(allCandidates, analysisBudget);

  const analysed = await mapConcurrent(pool, 8, async fixture => {
    const analysis = analyzeLoadedFixture(fixture, fixture.code, groups);
    const signal = candidateToSignal(analysis, intent);
    if (!signal || !Number.isFinite(signal.probability)) return undefined;
    const status: BatchSelection["status"] = "QUALIFIED";
    const evidence = analysis.pipeline.evidenceMode;
    const reason = `Actionable prediction selected by the authoritative cross-engine model. Probability ${(signal.probability * 100).toFixed(1)}%; confidence ${analysis.confidence}%; risk ${analysis.risk}; evidence mode ${evidence}. Batch ranking does not require the single-match hard qualification gate to exist.`;
    return { fixture, analysis, market: signal, score: selectionScore(analysis, signal, intent.mode), status, reason } satisfies BatchSelection;
  });

  const ranked = analysed.sort((a, b) => b.score - a.score);
  const selected: BatchSelection[] = [];
  const usedFixtures = new Set<string>();
  for (const row of ranked) {
    const id = fixtureId(row.fixture);
    if (usedFixtures.has(id)) continue;
    usedFixtures.add(id); selected.push(row);
    if (selected.length >= intent.count) break;
  }
  const generatedAt = new Date().toISOString();
  const message = selected.length >= intent.count
    ? `${selected.length} unique actionable predictions returned from a diversified ${analysed.length}-match authoritative analysis set.`
    : `${intent.count} requested. ${selected.length} actionable predictions were available from ${analysed.length} analysed candidates.`;
  return { request, intent, requested: intent.count, candidatePool: allCandidates.length, analysisBudget: pool.length, analysed: analysed.length, qualified: ranked.length, returned: selected.length, selections: selected, generatedAt, message };
}

export const runBatchAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as BatchAnalysisInput)
  .handler(async ({ data }): Promise<BatchAnalysisResponse> => runBatchAnalysisInternal(data));

export { parseIntent };
