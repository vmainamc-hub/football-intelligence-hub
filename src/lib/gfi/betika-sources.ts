import { createServerFn } from "@tanstack/react-start";
import type { MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamName } from "./identity";

export type BetikaFixture = MatchRow & {
  source: "betika";
  sourceId: string;
  sourceUpdatedAt: string;
};

const BETIKA_BASE = "https://www.betika.com/lite/en-ke/";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 5 * 60_000;

type Cache = {
  key: string;
  expiresAt: number;
  fixtures: BetikaFixture[];
};

let cache: Cache | null = null;

function withTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; GlobalFootballIntelligence/1.0)",
      ...(init.headers ?? {}),
    },
  }).finally(() => clearTimeout(timer));
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function visibleText(html: string) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "\n")
      .replace(/<br\s*\/?>(?=.)/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function dateFromBetika(value: string, now = new Date()) {
  const [day, month] = value.split("/").map(Number);
  if (!day || !month) return "";
  let year = now.getUTCFullYear();
  const monthNow = now.getUTCMonth() + 1;
  if (monthNow >= 11 && month <= 2) year += 1;
  if (monthNow <= 2 && month >= 11) year -= 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cleanTeam(value: string) {
  return canonicalTeamName(
    value
      .replace(/\s+/g, " ")
      .replace(/^[:|·\-–—]+\s*/, "")
      .replace(/\s*[:|·\-–—]+$/, "")
      .trim(),
  );
}

function parsePage(html: string, now = new Date()): BetikaFixture[] {
  const text = visibleText(html);
  const fixtures: BetikaFixture[] = [];

  // Betika's Lite pages expose each football event as a visible "TEAM vs. TEAM
  // (+markets)" anchor, preceded by its competition and kickoff. We parse the
  // fixture identity from that stable public representation rather than using
  // bookmaker odds as prediction input.
  const fixturePattern =
    /([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ .&'’()/_-]{1,70}?)\s+vs\.?\s+([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ .&'’()/_-]{1,90}?)\s*\(\+\d+\)/gi;
  const prefixPattern =
    /Soccer,\s*([^,]+),\s*([^0-9]{1,40}?)\s*(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})\s+Soccer,/gi;
  const prefixes: Array<{
    index: number;
    league: string;
    country: string;
    date: string;
    time: string;
  }> = [];
  for (const match of text.matchAll(prefixPattern)) {
    prefixes.push({
      index: match.index ?? 0,
      league: match[1]?.trim() ?? "Worldwide Football",
      country: match[2]?.trim() ?? "",
      date: match[3] ?? "",
      time: match[4] ?? "",
    });
  }

  for (const match of text.matchAll(fixturePattern)) {
    const index = match.index ?? 0;
    const prefix = [...prefixes]
      .reverse()
      .find((entry) => entry.index <= index && index - entry.index < 1400);
    if (!prefix) continue;
    const home = cleanTeam(match[1] ?? "");
    const away = cleanTeam(match[2] ?? "");
    if (!home || !away || home === away) continue;
    const date = dateFromBetika(prefix.date, now);
    if (!date) continue;
    const league = canonicalCompetitionName(prefix.league || `${prefix.country} Football`);
    fixtures.push({
      date,
      time: prefix.time,
      home,
      away,
      league,
      source: "betika",
      sourceId: `betika:${date}:${home}:${away}`,
      sourceUpdatedAt: now.toISOString(),
    });
  }

  const seen = new Set<string>();
  return fixtures.filter((fixture) => {
    const id = `${fixture.date}|${fixture.home}|${fixture.away}|${fixture.time ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function fetchBetikaPages(maxPages = 8) {
  const pages = Array.from({ length: maxPages }, (_, i) => i + 1);
  const results: BetikaFixture[] = [];
  for (let start = 0; start < pages.length; start += 3) {
    const batch = await Promise.allSettled(
      pages.slice(start, start + 3).map(async (page) => {
        const separator = page === 1 ? "?ck=1" : `?page=${page}&ck=1`;
        const response = await withTimeout(`${BETIKA_BASE}${separator}`);
        if (!response.ok) throw new Error(`Betika HTTP ${response.status}`);
        return parsePage(await response.text());
      }),
    );
    for (const item of batch) if (item.status === "fulfilled") results.push(...item.value);
  }
  return results;
}

export const fetchBetikaFixtures = createServerFn({ method: "GET" })
  .validator((input: { dateFrom: string; dateTo: string }) => input)
  .handler(async ({ data }): Promise<BetikaFixture[]> => {
    const key = `${data.dateFrom}|${data.dateTo}`;
    if (cache && cache.key === key && cache.expiresAt > Date.now()) return cache.fixtures;

    const fixtures = await fetchBetikaPages();
    const filtered = fixtures.filter(
      (fixture) => fixture.date >= data.dateFrom && fixture.date <= data.dateTo,
    );
    cache = { key, fixtures: filtered, expiresAt: Date.now() + CACHE_TTL_MS };
    return filtered;
  });

export { parsePage as parseBetikaHtml };
