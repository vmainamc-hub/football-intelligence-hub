import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow, type FreeLeague } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { bestQualifiedMarket, buildMainstreamMarketMap, type MarketSignal } from "./market-map";
import { sameTeamIdentity, canonicalCompetitionName } from "./identity";

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
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
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
    market = "BTTS";
    marketSelection = "BTTS — YES";
  } else if (/\bbtts no\b/.test(text)) {
    market = "BTTS";
    marketSelection = "BTTS — NO";
  } else if (/\bdouble chance\b/.test(text)) {
    market = "DOUBLE CHANCE";
  } else if (/\bdraw no bet\b|\bdnb\b/.test(text)) {
    market = "DRAW NO BET";
  } else if (/\bover\s*1\.5\b/.test(text)) {
    market = "OVER/UNDER 1.5";
    marketSelection = "OVER 1.5";
  } else if (/\bunder\s*1\.5\b/.test(text)) {
    market = "OVER/UNDER 1.5";
    marketSelection = "UNDER 1.5";
  } else if (/\bover\s*2\.5\b/.test(text)) {
    market = "OVER/UNDER 2.5";
    marketSelection = "OVER 2.5";
  } else if (/\bunder\s*2\.5\b/.test(text)) {
    market = "OVER/UNDER 2.5";
    marketSelection = "UNDER 2.5";
  } else if (/\bover\s*3\.5\b/.test(text)) {
    market = "OVER/UNDER 3.5";
    marketSelection = "OVER 3.5";
  } else if (/\bunder\s*3\.5\b/.test(text)) {
    market = "OVER/UNDER 3.5";
    marketSelection = "UNDER 3.5";
  }

  const scope: BatchIntent["scope"] = isNext || !/\btoday|todays|today's\b/.test(text) ? "NEXT" : "TODAY";

  return { raw, count, scope, mode: market ? "MARKET" : mode, market, marketSelection };
}

function sameTeam(a: string, b: string) {
  return sameTeamIdentity(a, b) || normalizeText(a) === normalizeText(b);
}

function fixtureId(fixture: MatchRow) {
  return [
    dateKey(fixture.date),
    normalizeText(fixture.home),
    normalizeText(fixture.away),
    fixture.time ?? "",
  ].join("|");
}

function uniqueFixtures(groups: FreeLeague[]) {
  const unique = new Map<string, MatchRow & { league: string; code: string; season: string }>();
  for (const group of groups) {
    for (const fixture of group.matches) {
      if (fixture.hg !== undefined || fixture.ag !== undefined) continue;
      const enriched = { ...fixture, league: group.league, code: group.code, season: group.season };
      const key = fixtureId(enriched);
      if (!unique.has(key)) unique.set(key, enriched);
    }
  }
  return [...unique.values()].sort((a, b) => kickoffValue(a).localeCompare(kickoffValue(b)));
}

function marketValue(result: ServerMatchAnalysis, market: MarketSignal["market"], selection?: string) {
  const all = buildMainstreamMarketMap(result).filter((item) => item.market === market);
  if (!all.length) return undefined;
  if (selection) return all.find((item) => item.selection === selection) ?? all[0];
  return [...all].sort((a, b) => b.probability - a.probability)[0];
}

function qualifyMarket(result: ServerMatchAnalysis, signal: MarketSignal) {
  const probabilityFloor =
    signal.market === "OVER/UNDER 1.5" ? 0.64 :
    signal.market === "DOUBLE CHANCE" ? 0.62 :
    signal.market === "DRAW NO BET" ? 0.60 :
    signal.market === "BTTS" ? 0.62 : 0.57;

  const riskBlocked = result.risk === "VERY HIGH" || result.risk === "HIGH";
  const strongEvidence = result.quality >= 40 && result.robustness.score >= 45;
  const qualified = signal.probability >= probabilityFloor && strongEvidence && !riskBlocked;
  const watch = signal.probability >= Math.max(0.5, probabilityFloor - 0.06) && result.quality >= 32 && result.robustness.score >= 32;

  return {
    qualified,
    watch,
    reason: qualified
      ? `${signal.selection} clears the batch qualification floor with ${(signal.probability * 100).toFixed(1)}% probability, ${result.confidence}% confidence and ${result.robustness.score}% robustness.`
      : watch
        ? `${signal.selection} is a watch candidate but does not clear the full probability/evidence/risk gate.`
        : `${signal.selection} did not clear the probability, evidence or risk gates.`,
  };
}

function selectionScore(result: ServerMatchAnalysis, signal: MarketSignal, mode: BatchIntent["mode"]) {
  const probability = signal.probability;
  const base =
    probability * 0.48 +
    (result.confidence / 100) * 0.18 +
    (result.robustness.score / 100) * 0.16 +
    (result.quality / 100) * 0.12 +
    result.consensus.agreement * 0.06;
  const conflictPenalty = result.consensus.conflict * 0.18;
  const modeBonus =
    mode === "SAFEST" ? (result.risk === "LOW" ? 0.06 : result.risk === "MODERATE" ? 0.02 : 0) :
    mode === "SLIP" ? 0.02 :
    0;
  return base + modeBonus - conflictPenalty;
}

function chooseMarket(result: ServerMatchAnalysis, intent: BatchIntent) {
  if (intent.mode === "MARKET" && intent.market) {
    return marketValue(result, intent.market, intent.marketSelection);
  }
  if (intent.mode === "HOME") {
    return buildMainstreamMarketMap(result).find((m) => m.market === "1X2" && m.selection === `${result.home.team} WIN`);
  }
  if (intent.mode === "AWAY") {
    return buildMainstreamMarketMap(result).find((m) => m.market === "1X2" && m.selection === `${result.away.team} WIN`);
  }
  if (intent.mode === "DRAW") {
    return buildMainstreamMarketMap(result).find((m) => m.market === "1X2" && m.selection === "DRAW");
  }
  return bestQualifiedMarket(result);
}

function candidateMarketSignals(result: ServerMatchAnalysis) {
  return buildMainstreamMarketMap(result);
}

function targetCandidates(fixtures: ReturnType<typeof uniqueFixtures>, intent: BatchIntent) {
  const today = todayEAT();
  const filtered = fixtures.filter((fixture) => {
    const d = dateKey(fixture.date);
    if (intent.scope === "TODAY") return d === today;
    return d >= today;
  });
  return filtered;
}

export const runBatchAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { request?: string; limit?: number; includeUpcoming?: boolean })
  .handler(async ({ data }): Promise<BatchAnalysisResponse> => {
    const request = (data.request ?? (data.limit ? `Give me ${data.limit} safest picks` : "Predict today's next matches")).trim();
    const intent = parseIntent(request);
    const groups = await loadFreeFixtures();
    const all = uniqueFixtures(groups);
    const candidates = targetCandidates(all, intent);
    const scanLimit = Math.min(140, Math.max(intent.count * 5, 50));
    const pool = candidates.slice(0, scanLimit);

    const analysed: BatchSelection[] = [];
    for (const fixture of pool) {
      try {
        const analysis = analyzeLoadedFixture(fixture, fixture.code, groups);
        const explicit = chooseMarket(analysis, intent);
        const signal = explicit ?? (intent.mode === "MARKET" ? undefined : bestQualifiedMarket(analysis));
        if (!signal) continue;

        const gate = qualifyMarket(analysis, signal);
        const actualSignal = intent.mode === "SAFEST" ? bestQualifiedMarket(analysis) : signal;
        const actualGate = intent.mode === "SAFEST" ? qualifyMarket(analysis, actualSignal) : gate;
        const status: BatchSelection["status"] = actualGate.qualified
          ? "QUALIFIED"
          : actualGate.watch
            ? "WATCH"
            : "NO QUALIFIED MARKET";

        analysed.push({
          fixture,
          analysis,
          market: actualSignal,
          score: selectionScore(analysis, actualSignal, intent.mode),
          status,
          reason: actualGate.reason,
        });
      } catch {
        // One bad fixture must not abort the batch.
      }
    }

    const qualified = analysed
      .filter((row) => row.status === "QUALIFIED")
      .sort((a, b) => b.score - a.score);

    // For slip/safest/actionable modes, enforce one market selection per fixture.
    const selected: BatchSelection[] = [];
    const usedFixtures = new Set<string>();
    for (const row of qualified) {
      const id = fixtureId(row.fixture);
      if (usedFixtures.has(id)) continue;
      usedFixtures.add(id);
      selected.push(row);
      if (selected.length >= intent.count) break;
    }

    const generatedAt = new Date().toISOString();
    const message =
      selected.length >= intent.count
        ? `${selected.length} qualified selections returned for: ${request}`
        : `${intent.count} requested. ${selected.length} currently meet the qualification criteria.`;

    return {
      request,
      intent,
      requested: intent.count,
      candidatePool: pool.length,
      analysed: analysed.length,
      qualified: qualified.length,
      returned: selected.length,
      selections: selected,
      generatedAt,
      message,
    };
  });

export { parseIntent };
