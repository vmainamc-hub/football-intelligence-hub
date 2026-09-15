import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow, type FreeLeague } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { bestQualifiedMarket, buildMainstreamMarketMap, type MarketSignal } from "./market-map";
import { sameTeamIdentity } from "./identity";

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
  } else if (/\b(draw no bet|dnb)\b/.test(text)) {
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

  const scope: BatchIntent["scope"] = isNext || !/\b(today|todays|today's)\b/.test(text) ? "NEXT" : "TODAY";
  return { raw, count, scope, mode: market ? "MARKET" : mode, market, marketSelection };
}

function sameTeam(a: string, b: string) {
  return sameTeamIdentity(a, b) || normalizeText(a) === normalizeText(b);
}

function fixtureId(fixture: MatchRow) {
  return [dateKey(fixture.date), normalizeText(fixture.home), normalizeText(fixture.away), fixture.time ?? ""].join("|");
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

function exactMarketSignal(result: ServerMatchAnalysis, market: BatchIntent["market"], selection?: string) {
  if (!market) return undefined;
  const map = buildMainstreamMarketMap(result);

  if (market === "BTTS" && selection) {
    const engine = result.engines.find((e) => e.id === "BTTS");
    const yes = Number(engine?.values.yes);
    if (!Number.isFinite(yes)) return undefined;
    const probability = selection === "BTTS — NO" ? 1 - yes : yes;
    return {
      market: "BTTS",
      selection,
      probability,
      confidence: Math.round((result.confidence + probability * 100) / 2),
      tier: probability >= 0.62 ? "PRIMARY" : probability >= 0.56 ? "SECONDARY" : "WATCH",
      rationale: `BTTS model probability for ${selection} is ${(probability * 100).toFixed(1)}%.`,
    } satisfies MarketSignal;
  }

  if (market.startsWith("OVER/UNDER") && selection) {
    const line = market.replace("OVER/UNDER ", "");
    const engine = result.engines.find((e) => e.id === "TOTALS");
    const over = Number(engine?.values[`over${line}`]);
    if (!Number.isFinite(over)) return undefined;
    const probability = selection.startsWith("UNDER") ? 1 - over : over;
    return {
      market,
      selection,
      probability,
      confidence: Math.round((result.confidence + probability * 100) / 2),
      tier: probability >= 0.64 ? "PRIMARY" : probability >= 0.58 ? "SECONDARY" : "WATCH",
      rationale: `Totals model probability for ${selection} is ${(probability * 100).toFixed(1)}%.`,
    } satisfies MarketSignal;
  }

  if (market === "1X2" as never && selection) return map.find((m) => m.market === "1X2" && m.selection === selection);
  const candidates = map.filter((item) => item.market === market);
  return candidates.sort((a, b) => b.probability - a.probability)[0];
}

function directOutcomeSignal(result: ServerMatchAnalysis, outcome: "HOME" | "AWAY" | "DRAW"): MarketSignal {
  const p = result.probabilities[outcome === "HOME" ? "home" : outcome === "AWAY" ? "away" : "draw"];
  const label = outcome === "HOME" ? `${result.home.team} WIN` : outcome === "AWAY" ? `${result.away.team} WIN` : "DRAW";
  return {
    market: "1X2",
    selection: label,
    probability: p,
    confidence: result.confidence,
    tier: p >= 0.57 ? "PRIMARY" : p >= 0.5 ? "SECONDARY" : "WATCH",
    rationale: `Authoritative 1X2 probability for ${label} is ${(p * 100).toFixed(1)}%.`,
  };
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
  const base =
    signal.probability * 0.48 +
    (result.confidence / 100) * 0.18 +
    (result.robustness.score / 100) * 0.16 +
    (result.quality / 100) * 0.12 +
    result.consensus.agreement * 0.06;
  const conflictPenalty = result.consensus.conflict * 0.18;
  const modeBonus = mode === "SAFEST" && result.risk === "LOW" ? 0.06 : mode === "SAFEST" && result.risk === "MODERATE" ? 0.02 : mode === "SLIP" ? 0.02 : 0;
  return base + modeBonus - conflictPenalty;
}

function chooseMarket(result: ServerMatchAnalysis, intent: BatchIntent) {
  if (intent.mode === "MARKET") return exactMarketSignal(result, intent.market, intent.marketSelection);
  if (intent.mode === "HOME") return directOutcomeSignal(result, "HOME");
  if (intent.mode === "AWAY") return directOutcomeSignal(result, "AWAY");
  if (intent.mode === "DRAW") return directOutcomeSignal(result, "DRAW");
  return bestQualifiedMarket(result);
}

function targetCandidates(fixtures: ReturnType<typeof uniqueFixtures>, intent: BatchIntent) {
  const today = todayEAT();
  return fixtures.filter((fixture) => {
    const d = dateKey(fixture.date);
    return intent.scope === "TODAY" ? d === today : d >= today;
  });
}

export const runBatchAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { request?: string; limit?: number; includeUpcoming?: boolean })
  .handler(async ({ data }): Promise<BatchAnalysisResponse> => {
    const request = (data.request ?? (data.limit ? `Give me ${data.limit} safest picks` : "Predict today's next matches")).trim();
    const intent = parseIntent(request);
    const groups = await loadFreeFixtures();
    const candidates = targetCandidates(uniqueFixtures(groups), intent);
    const scanLimit = Math.min(120, Math.max(intent.count * 5, 50));
    const pool = candidates.slice(0, scanLimit);

    const analysed: BatchSelection[] = [];
    for (const fixture of pool) {
      try {
        const analysis = analyzeLoadedFixture(fixture, fixture.code, groups);
        const signal = chooseMarket(analysis, intent);
        if (!signal) continue;
        const gate = qualifyMarket(analysis, signal);
        const status: BatchSelection["status"] = gate.qualified ? "QUALIFIED" : gate.watch ? "WATCH" : "NO QUALIFIED MARKET";
        analysed.push({ fixture, analysis, market: signal, score: selectionScore(analysis, signal, intent.mode), status, reason: gate.reason });
      } catch {
        // Keep the batch alive when an individual fixture is malformed.
      }
    }

    const qualified = analysed.filter((row) => row.status === "QUALIFIED").sort((a, b) => b.score - a.score);
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
    const message = selected.length >= intent.count
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
