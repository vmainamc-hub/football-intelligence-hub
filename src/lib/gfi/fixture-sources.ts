import { createServerFn } from "@tanstack/react-start";
import type { MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamName, parseScoreCell } from "./identity";

export type FixtureSourceName = "football-data" | "openfootball" | "sportsdb";
export type ExternalFixture = MatchRow & {
  source: FixtureSourceName;
  sourceId?: string;
  sourceUpdatedAt?: string;
};

const OPENFOOTBALL_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";
const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const REQUEST_TIMEOUT_MS = 10_000;

const OPENFOOTBALL_LEAGUES: Array<{ code: string; league: string; file: string }> = [
  { code: "E0", league: "Premier League", file: "2026-27/en.1.json" },
  { code: "E1", league: "Championship", file: "2026-27/en.2.json" },
  { code: "D1", league: "Bundesliga", file: "2026-27/de.1.json" },
  { code: "SP1", league: "La Liga", file: "2026-27/es.1.json" },
  { code: "I1", league: "Serie A", file: "2026-27/it.1.json" },
  { code: "F1", league: "Ligue 1", file: "2026-27/fr.1.json" },
  { code: "N1", league: "Eredivisie", file: "2026-27/nl.1.json" },
  { code: "P1", league: "Primeira Liga", file: "2026-27/pt.1.json" },
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

function addDays(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseOpenFootball(payload: unknown, league: string, sourceUrl: string): ExternalFixture[] {
  if (!payload || typeof payload !== "object") return [];
  const matches = Array.isArray((payload as { matches?: unknown }).matches)
    ? (payload as { matches: unknown[] }).matches
    : [];
  return matches.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const date = typeof item.date === "string" ? item.date : "";
    const home = typeof item.team1 === "string" ? item.team1 : "";
    const away = typeof item.team2 === "string" ? item.team2 : "";
    if (!date || !home || !away) return [];
    const score =
      item.score && typeof item.score === "object"
        ? (item.score as Record<string, unknown>)
        : undefined;
    const ft = Array.isArray(score?.ft) ? (score.ft as unknown[]) : [];
    const hg = typeof ft[0] === "number" ? ft[0] : undefined;
    const ag = typeof ft[1] === "number" ? ft[1] : undefined;
    return [
      {
        date: sourceDateKey(date),
        time: typeof item.time === "string" ? item.time.slice(0, 5) : undefined,
        home: canonicalTeamName(home),
        away: canonicalTeamName(away),
        hg,
        ag,
        result:
          hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined,
        league: canonicalCompetitionName(league),
        source: "openfootball",
        sourceId: `${sourceUrl}#${index}`,
        sourceUpdatedAt: new Date().toISOString(),
      } satisfies ExternalFixture,
    ];
  });
}

function parseSportsDb(payload: unknown): ExternalFixture[] {
  if (!payload || typeof payload !== "object") return [];
  const events = Array.isArray((payload as { events?: unknown }).events)
    ? (payload as { events: unknown[] }).events
    : [];
  return events.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const home = typeof item.strHomeTeam === "string" ? item.strHomeTeam : "";
    const away = typeof item.strAwayTeam === "string" ? item.strAwayTeam : "";
    const date = typeof item.dateEvent === "string" ? item.dateEvent : "";
    if (!home || !away || !date) return [];
    const hg =
      typeof item.intHomeScore === "number"
        ? item.intHomeScore
        : parseScoreCell(typeof item.intHomeScore === "string" ? item.intHomeScore : undefined);
    const ag =
      typeof item.intAwayScore === "number"
        ? item.intAwayScore
        : parseScoreCell(typeof item.intAwayScore === "string" ? item.intAwayScore : undefined);
    return [
      {
        date: sourceDateKey(date),
        time: typeof item.strTime === "string" ? item.strTime.slice(0, 5) : undefined,
        home: canonicalTeamName(home),
        away: canonicalTeamName(away),
        hg,
        ag,
        result:
          hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined,
        league: canonicalCompetitionName(
          typeof item.strLeague === "string" ? item.strLeague : "Worldwide Football",
        ),
        source: "sportsdb",
        sourceId: String(item.idEvent ?? index),
        sourceUpdatedAt: new Date().toISOString(),
      } satisfies ExternalFixture,
    ];
  });
}

async function collectSportsDb(from: string, to: string) {
  const days = Math.max(
    1,
    Math.min(
      14,
      Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) +
        1,
    ),
  );
  const out: ExternalFixture[] = [];
  const concurrency = 3;
  for (let start = 0; start < days; start += concurrency) {
    const batch = await Promise.allSettled(
      Array.from({ length: Math.min(concurrency, days - start) }, (_, offset) => {
        const date = addDays(from, start + offset);
        return withTimeout(`${SPORTSDB_BASE}/eventsday.php?d=${date}&s=Soccer`, {
          headers: { Accept: "application/json" },
        })
          .then(async (response) => (response.ok ? parseSportsDb(await response.json()) : []))
          .catch(() => [] as ExternalFixture[]);
      }),
    );
    for (const item of batch) if (item.status === "fulfilled") out.push(...item.value);
  }
  return out;
}

export const fetchGlobalFallbackFixtures = createServerFn({ method: "GET" })
  .validator((input: { dateFrom: string; dateTo: string }) => input)
  .handler(async ({ data }): Promise<ExternalFixture[]> => {
    const results: ExternalFixture[] = [];
    const openfootball = await Promise.allSettled(
      OPENFOOTBALL_LEAGUES.map(async (entry) => {
        const response = await withTimeout(`${OPENFOOTBALL_BASE}/${entry.file}`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`OpenFootball ${entry.file}: HTTP ${response.status}`);
        return parseOpenFootball(
          await response.json(),
          entry.league,
          response.url || `${OPENFOOTBALL_BASE}/${entry.file}`,
        );
      }),
    );
    for (const result of openfootball)
      if (result.status === "fulfilled") results.push(...result.value);

    const sportsDb = await collectSportsDb(data.dateFrom, data.dateTo);
    results.push(...sportsDb);

    const seen = new Set<string>();
    return results.filter((match) => {
      const date = sourceDateKey(match.date);
      if (date < data.dateFrom || date > data.dateTo) return false;
      const id = `${date}|${match.home.toLowerCase()}|${match.away.toLowerCase()}|${match.time ?? ""}|${match.source}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });

export function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|afc|cf|sc|club|city|united)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fixtureIdentity(match: Pick<MatchRow, "date" | "home" | "away">) {
  return `${sourceDateKey(match.date)}|${normalizeTeamName(match.home)}|${normalizeTeamName(match.away)}`;
}
