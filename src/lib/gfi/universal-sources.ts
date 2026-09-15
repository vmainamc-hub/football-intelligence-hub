import { createServerFn } from "@tanstack/react-start";
import {
  getGlobalFallbackFixtures,
  fetchGlobalFallbackFixtures,
  type ExternalFixture,
} from "./fixture-sources";
import type { MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamName } from "./identity";

const BASE = "https://sportscore.com";
const TIMEOUT_MS = 9000;
function withTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    signal: controller.signal,
    headers: { Accept: "application/json", "User-Agent": "Global-Football-Intelligence/1.0" },
  }).finally(() => clearTimeout(timer));
}
function sourceDate(value: unknown) {
  if (typeof value !== "string") return "";
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : value.slice(0, 10);
}
function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  for (const key of ["matches", "events", "fixtures", "data", "results"]) {
    if (Array.isArray(o[key])) return o[key] as unknown[];
    if (o[key] && typeof o[key] === "object") {
      const nested = firstArray(o[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}
function teamName(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object")
    return String((value as Record<string, unknown>).name ?? "").trim();
  return "";
}
function parseSportScore(payload: unknown, sourceIdPrefix: string): MatchRow[] {
  return firstArray(payload).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const home = teamName(
      item.home ?? item.home_team ?? item.homeTeam ?? item.strHomeTeam ?? item.team1,
    );
    const away = teamName(
      item.away ?? item.away_team ?? item.awayTeam ?? item.strAwayTeam ?? item.team2,
    );
    const rawDate =
      item.date ??
      item.dateEvent ??
      item.time ??
      item.kickoffUtc ??
      item.utc_date ??
      item.startTime ??
      item.start_time;
    const date = sourceDate(rawDate);
    if (!home || !away || !date) return [];
    const timeValue =
      item.time ??
      item.strTime ??
      item.kickoffUtc ??
      item.utc_date ??
      item.startTime ??
      item.start_time;
    const timeMatch =
      typeof timeValue === "string" ? timeValue.match(/(?:T|\s)(\d{1,2}):(\d{2})/) : null;
    const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined;
    const score =
      item.score && typeof item.score === "object"
        ? (item.score as Record<string, unknown>)
        : undefined;
    const hgRaw =
      item.home_score ?? item.homeScore ?? item.intHomeScore ?? score?.home ?? score?.home_score;
    const agRaw =
      item.away_score ?? item.awayScore ?? item.intAwayScore ?? score?.away ?? score?.away_score;
    const hg =
      typeof hgRaw === "number"
        ? hgRaw
        : Number.isFinite(Number(hgRaw)) && String(hgRaw).trim() !== ""
          ? Number(hgRaw)
          : undefined;
    const ag =
      typeof agRaw === "number"
        ? agRaw
        : Number.isFinite(Number(agRaw)) && String(agRaw).trim() !== ""
          ? Number(agRaw)
          : undefined;
    const league = String(
      item.competition ?? item.league ?? item.strLeague ?? item.tournament ?? "Worldwide Football",
    ).trim();
    return [
      {
        date,
        time,
        home: canonicalTeamName(home),
        away: canonicalTeamName(away),
        hg,
        ag,
        result:
          hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined,
        league: canonicalCompetitionName(league),
        source: "sportscore",
        sourceId: `${sourceIdPrefix}-${String(item.id ?? item.event_id ?? index)}`,
      } satisfies MatchRow,
    ];
  });
}
function slugifyTeam(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function dedupe(rows: MatchRow[]) {
  const seen = new Set<string>();
  return rows.filter((m) => {
    const id = `${m.date}|${m.home.toLowerCase()}|${m.away.toLowerCase()}|${m.time ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
export async function getUniversalFixtures(
  dateFrom: string,
  dateTo: string,
): Promise<MatchRow[]> {
  const results: MatchRow[] = [];
  try {
    results.push(...(await getGlobalFallbackFixtures(dateFrom, dateTo)));
  } catch {
    // Ignore fallback failures and continue with other sources
  }
  try {
    const r = await withTimeout(`${BASE}/api/widget/matches/?sport=football&limit=50`);
    if (r.ok) results.push(...parseSportScore(await r.json(), "broad"));
  } catch {
    // Ignore network failures and continue with fallback results
  }
  return dedupe(results).filter((m) => m.date >= dateFrom && m.date <= dateTo);
}

export const fetchUniversalFixtures = createServerFn({ method: "GET" })
  .validator((input: { dateFrom: string; dateTo: string }) => input)
  .handler(async ({ data }): Promise<MatchRow[]> => {
    return getUniversalFixtures(data.dateFrom, data.dateTo);
  });

export async function queryUniversalFixtures(query: string): Promise<MatchRow[]> {
  const q = query.trim();
  if (!q) return [];
  const tokens = q
    .split(/\s+(?:vs?|v|versus)\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  const teamTerms = (tokens.length >= 2 ? tokens : [q]).slice(0, 2);
  const results: MatchRow[] = [];
  const searches = teamTerms.map((team) =>
    withTimeout(
      `${BASE}/api/widget/team/?sport=football&slug=${encodeURIComponent(slugifyTeam(team))}&limit=30`,
    )
      .then(async (r) =>
        r.ok ? parseSportScore(await r.json(), `team-${slugifyTeam(team)}`) : [],
      )
      .catch(() => [] as MatchRow[]),
  );
  for (const rows of await Promise.all(searches)) results.push(...rows);
  // Team-history enrichment must return the UNION of both clubs' histories.
  // Requiring both names in each row accidentally reduced this source to H2H-only.
  const normalizedTerms = teamTerms.map((term) => term.toLowerCase());
  return dedupe(results)
    .filter((m) => {
      const fixture = `${m.home} ${m.away}`.toLowerCase();
      return normalizedTerms.some((term) => fixture.includes(term));
    })
    .sort((a, b) => `${a.date}|${a.time ?? ""}`.localeCompare(`${b.date}|${b.time ?? ""}`));
}

export const searchUniversalFixtures = createServerFn({ method: "GET" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<MatchRow[]> => {
    return queryUniversalFixtures(data.query);
  });
export type UniversalSourceStatus = {
  name: string;
  role: string;
  free: boolean;
  configured: boolean;
};
export const UNIVERSAL_SOURCES: UniversalSourceStatus[] = [
  {
    name: "Football-Data.co.uk",
    role: "historical results backbone",
    free: true,
    configured: true,
  },
  { name: "OpenFootball", role: "open fixture/result enrichment", free: true, configured: true },
  { name: "TheSportsDB", role: "daily global fixture fallback", free: true, configured: true },
  {
    name: "SportScore",
    role: "worldwide fixture/team discovery and enrichment",
    free: true,
    configured: true,
  },
  { name: "StatArea", role: "external prediction opinion", free: true, configured: false },
  {
    name: "Public news sources",
    role: "news/injuries/team context",
    free: true,
    configured: false,
  },
];
