import { createServerFn } from "@tanstack/react-start";
import type { MatchRow } from "./intelligence";

export type FixtureSourceName = "football-data" | "openfootball" | "global-live" | "sportsdb";
export type ExternalFixture = MatchRow & { source: FixtureSourceName; sourceId?: string; sourceUpdatedAt?: string };

const OPENFOOTBALL_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";
const GLOBAL_LIVE_BASE = "https://worldcup26.ir/get/soccer";
const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const REQUEST_TIMEOUT_MS = 10_000;

const OPENFOOTBALL_LEAGUES: Array<{ code: string; league: string; file: string }> = [
  { code: "E0", league: "Premier League", file: "2026-27/en.1.json" },
  { code: "E1", league: "Championship", file: "2026-27/en.2.json" },
  { code: "E2", league: "League One", file: "2026-27/en.3.json" },
  { code: "E3", league: "League Two", file: "2026-27/en.4.json" },
  { code: "D1", league: "Bundesliga", file: "2026-27/de.1.json" },
  { code: "D2", league: "2. Bundesliga", file: "2026-27/de.2.json" },
  { code: "D3", league: "3. Liga", file: "2026-27/de.3.json" },
  { code: "SP1", league: "La Liga", file: "2026-27/es.1.json" },
  { code: "SP2", league: "La Liga 2", file: "2026-27/es.2.json" },
  { code: "I1", league: "Serie A", file: "2026-27/it.1.json" },
  { code: "I2", league: "Serie B", file: "2026-27/it.2.json" },
  { code: "F1", league: "Ligue 1", file: "2026-27/fr.1.json" },
  { code: "F2", league: "Ligue 2", file: "2026-27/fr.2.json" },
  { code: "N1", league: "Eredivisie", file: "2026-27/nl.1.json" },
  { code: "N2", league: "Eerste Divisie", file: "2026-27/nl.2.json" },
  { code: "P1", league: "Primeira Liga", file: "2026-27/pt.1.json" },
  { code: "B1", league: "Belgian First Division A", file: "2026-27/be.1.json" },
  { code: "A1", league: "Austrian Bundesliga", file: "2026-27/at.1.json" },
  { code: "CH1", league: "Swiss Super League", file: "2026-27/ch.1.json" },
  { code: "SC0", league: "Scottish Premiership", file: "2026-27/sc.1.json" },
];

const LIVE_LEAGUES = [
  { code: "E0", league: "Premier League", slug: "eng.1" },
  { code: "E1", league: "Championship", slug: "eng.2" },
  { code: "SP1", league: "La Liga", slug: "esp.1" },
  { code: "SP2", league: "La Liga 2", slug: "esp.2" },
];

function sourceDateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function withTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function parseOpenFootball(payload: unknown, league: string, sourceUrl: string): ExternalFixture[] {
  if (!payload || typeof payload !== "object") return [];
  const matches = Array.isArray((payload as { matches?: unknown }).matches) ? (payload as { matches: unknown[] }).matches : [];
  return matches.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const date = typeof item.date === "string" ? item.date : "";
    const home = typeof item.team1 === "string" ? item.team1 : "";
    const away = typeof item.team2 === "string" ? item.team2 : "";
    if (!date || !home || !away) return [];
    const time = typeof item.time === "string" ? item.time.slice(0, 5) : undefined;
    const score = item.score && typeof item.score === "object" ? item.score as Record<string, unknown> : undefined;
    const ft = Array.isArray(score?.ft) ? score.ft as unknown[] : undefined;
    const hg = typeof ft?.[0] === "number" ? ft[0] : undefined;
    const ag = typeof ft?.[1] === "number" ? ft[1] : undefined;
    return [{ date: sourceDateKey(date), time, home, away, hg, ag, result: hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined, league, source: "openfootball", sourceId: `${sourceUrl}#${index}`, sourceUpdatedAt: new Date().toISOString() } satisfies ExternalFixture];
  });
}

function parseGlobalLive(payload: unknown, league: string): ExternalFixture[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : undefined;
  const candidates = [root.fixtures, root.matches, root.events, root.data, data?.fixtures, data?.matches, data?.events];
  const matches = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!matches) return [];
  return matches.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const homeTeam = item.home_team && typeof item.home_team === "object" ? item.home_team as Record<string, unknown> : undefined;
    const awayTeam = item.away_team && typeof item.away_team === "object" ? item.away_team as Record<string, unknown> : undefined;
    const home = typeof item.home === "string" ? item.home : typeof homeTeam?.name === "string" ? homeTeam.name : typeof item.strHomeTeam === "string" ? item.strHomeTeam : "";
    const away = typeof item.away === "string" ? item.away : typeof awayTeam?.name === "string" ? awayTeam.name : typeof item.strAwayTeam === "string" ? item.strAwayTeam : "";
    const kickoff = typeof item.kickoffUtc === "string" ? item.kickoffUtc : typeof item.utc_date === "string" ? item.utc_date : typeof item.date === "string" ? item.date : "";
    if (!home || !away || !kickoff) return [];
    const parsed = new Date(kickoff);
    if (Number.isNaN(parsed.getTime())) return [];
    const score = item.score && typeof item.score === "object" ? item.score as Record<string, unknown> : undefined;
    const hg = typeof item.home_score === "number" ? item.home_score : typeof score?.home === "number" ? score.home : undefined;
    const ag = typeof item.away_score === "number" ? item.away_score : typeof score?.away === "number" ? score.away : undefined;
    return [{ date: parsed.toISOString().slice(0, 10), time: parsed.toISOString().slice(11, 16), home, away, hg, ag, result: hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined, league, source: "global-live", sourceId: String(item.id ?? item.event_id ?? index), sourceUpdatedAt: new Date().toISOString() } satisfies ExternalFixture];
  });
}

function parseSportsDb(payload: unknown): ExternalFixture[] {
  if (!payload || typeof payload !== "object") return [];
  const events = Array.isArray((payload as { events?: unknown }).events) ? (payload as { events: unknown[] }).events : [];
  return events.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const home = typeof item.strHomeTeam === "string" ? item.strHomeTeam : "";
    const away = typeof item.strAwayTeam === "string" ? item.strAwayTeam : "";
    const date = typeof item.dateEvent === "string" ? item.dateEvent : "";
    if (!home || !away || !date) return [];
    const time = typeof item.strTime === "string" ? item.strTime.slice(0, 5) : undefined;
    const hg = typeof item.intHomeScore === "number" ? item.intHomeScore : undefined;
    const ag = typeof item.intAwayScore === "number" ? item.intAwayScore : undefined;
    return [{ date: sourceDateKey(date), time, home, away, hg, ag, result: hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined, league: typeof item.strLeague === "string" ? item.strLeague : "Worldwide Football", source: "sportsdb", sourceId: String(item.idEvent ?? index), sourceUpdatedAt: new Date().toISOString() } satisfies ExternalFixture];
  });
}

export async function fetchGlobalFallbackFixturesInternal(data: { dateFrom: string; dateTo: string }): Promise<ExternalFixture[]> {
  const results: ExternalFixture[] = [];
  const openfootball = await Promise.allSettled(OPENFOOTBALL_LEAGUES.map(async (entry) => {
    const response = await withTimeout(`${OPENFOOTBALL_BASE}/${entry.file}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`OpenFootball ${entry.file}: HTTP ${response.status}`);
    return parseOpenFootball(await response.json(), entry.league, response.url || `${OPENFOOTBALL_BASE}/${entry.file}`);
  }));
  for (const result of openfootball) if (result.status === "fulfilled") results.push(...result.value);

  const live = await Promise.allSettled(LIVE_LEAGUES.map(async (entry) => {
    const url = `${GLOBAL_LIVE_BASE}/${entry.slug}/fixtures?status=all&from=${data.dateFrom.replaceAll("-", "")}&to=${data.dateTo.replaceAll("-", "")}`;
    const response = await withTimeout(url, { headers: { Accept: "application/json", "User-Agent": "Global-Football-Intelligence/1.0" } });
    if (!response.ok) throw new Error(`Global live ${entry.slug}: HTTP ${response.status}`);
    return parseGlobalLive(await response.json(), entry.league);
  }));
  for (const result of live) if (result.status === "fulfilled") results.push(...result.value);

  try {
    const response = await withTimeout(`${SPORTSDB_BASE}/eventsday.php?d=${data.dateFrom}&s=Soccer`, { headers: { Accept: "application/json" } });
    if (response.ok) results.push(...parseSportsDb(await response.json()));
  } catch {
    // Optional source failure never blocks the other public sources.
  }

  return results.filter((match) => {
    const date = sourceDateKey(match.date);
    return date >= data.dateFrom && date <= data.dateTo;
  });
}

export const fetchGlobalFallbackFixtures = createServerFn({ method: "GET" })
  .validator((input: { dateFrom: string; dateTo: string }) => input)
  .handler(async ({ data }) => fetchGlobalFallbackFixturesInternal(data));

export function normalizeTeamName(value: string) {
  return value.toLowerCase().replace(/\b(fc|afc|cf|sc|club|city|united)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function fixtureIdentity(match: Pick<MatchRow, "date" | "home" | "away">) {
  return `${sourceDateKey(match.date)}|${normalizeTeamName(match.home)}|${normalizeTeamName(match.away)}`;
}
