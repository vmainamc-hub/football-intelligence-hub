import { createServerFn } from "@tanstack/react-start";
import { fetchGlobalFallbackFixturesInternal, type ExternalFixture } from "./fixture-sources";
import type { MatchRow } from "./intelligence";

const BASE = "https://sportscore.com";
const TIMEOUT_MS = 9000;

function withTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "Global-Football-Intelligence/1.0" } }).finally(() => clearTimeout(timer));
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

function parseSportScore(payload: unknown, sourceIdPrefix: string): MatchRow[] {
  return firstArray(payload).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const homeObj = item.home && typeof item.home === "object" ? item.home as Record<string, unknown> : undefined;
    const awayObj = item.away && typeof item.away === "object" ? item.away as Record<string, unknown> : undefined;
    const home = String(item.home_team ?? item.homeTeam ?? item.strHomeTeam ?? homeObj?.name ?? item.team1 ?? "").trim();
    const away = String(item.away_team ?? item.awayTeam ?? item.strAwayTeam ?? awayObj?.name ?? item.team2 ?? "").trim();
    const rawDate = item.date ?? item.dateEvent ?? item.kickoffUtc ?? item.utc_date ?? item.startTime ?? item.start_time;
    const date = sourceDate(rawDate);
    if (!home || !away || !date) return [];
    const timeValue = item.time ?? item.strTime ?? item.kickoffUtc ?? item.utc_date ?? item.startTime ?? item.start_time;
    const timeMatch = typeof timeValue === "string" ? timeValue.match(/(?:T|\s)(\d{1,2}):(\d{2})/) : null;
    const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined;
    const score = item.score && typeof item.score === "object" ? item.score as Record<string, unknown> : undefined;
    const hgRaw = item.home_score ?? item.homeScore ?? item.intHomeScore ?? score?.home ?? score?.home_score;
    const agRaw = item.away_score ?? item.awayScore ?? item.intAwayScore ?? score?.away ?? score?.away_score;
    const hg = typeof hgRaw === "number" ? hgRaw : Number.isFinite(Number(hgRaw)) && String(hgRaw).trim() !== "" ? Number(hgRaw) : undefined;
    const ag = typeof agRaw === "number" ? agRaw : Number.isFinite(Number(agRaw)) && String(agRaw).trim() !== "" ? Number(agRaw) : undefined;
    const league = String(item.competition ?? item.league ?? item.strLeague ?? item.tournament ?? "Worldwide Football").trim();
    return [{ date, time, home, away, hg, ag, result: hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined, league, source: "sportscore", sourceId: `${sourceIdPrefix}-${String(item.id ?? item.event_id ?? index)}` } satisfies MatchRow];
  });
}

function slugifyTeam(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function filterSearchResults(results: MatchRow[], q: string, teamTerms: string[]) {
  const needle = q.toLowerCase().replace(/\s+/g, " ");
  const seen = new Set<string>();
  return results.filter((m) => `${m.home} ${m.away}`.toLowerCase().includes(needle) || (teamTerms.length >= 1 && teamTerms.every((t) => `${m.home} ${m.away}`.toLowerCase().includes(t.toLowerCase())))).filter((m) => {
    const id = `${m.date}|${m.home}|${m.away}|${m.time ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchUniversalFixturesInternal(data: { dateFrom: string; dateTo: string }): Promise<MatchRow[]> {
  const results: MatchRow[] = await fetchGlobalFallbackFixturesInternal(data);
  try {
    const r = await withTimeout(`${BASE}/api/widget/matches/?sport=football&limit=50`);
    if (r.ok) results.push(...parseSportScore(await r.json(), "broad"));
  } catch {
    // SportScore is enrichment only.
  }
  return results.filter((m) => m.date >= data.dateFrom && m.date <= data.dateTo || m.source === "global-live");
}

export const fetchUniversalFixtures = createServerFn({ method: "GET" })
  .validator((input: { dateFrom: string; dateTo: string }) => input)
  .handler(async ({ data }) => fetchUniversalFixturesInternal(data));

export async function searchUniversalFixturesInternal(q: string): Promise<MatchRow[]> {
  const query = q.trim();
  if (!query) return [];
  const tokens = query.split(/\s+(?:vs?|v|versus)\s+/i).map((x) => x.trim()).filter(Boolean);
  const candidates = tokens.length >= 2 ? tokens : [query];
  const teamTerms = candidates.slice(0, 2);
  const results: MatchRow[] = [];
  const searches = teamTerms.map((team) => withTimeout(`${BASE}/api/widget/team/?sport=football&slug=${encodeURIComponent(slugifyTeam(team))}&limit=30`).then(async (r) => r.ok ? parseSportScore(await r.json(), `team-${slugifyTeam(team)}`) : []).catch(() => []));
  for (const rows of await Promise.all(searches)) results.push(...rows);
  let filtered = filterSearchResults(results, query, teamTerms);
  if (!filtered.length) {
    const today = new Date().toISOString().slice(0, 10);
    const next30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const fallback = await fetchGlobalFallbackFixturesInternal({ dateFrom: today, dateTo: next30 }).catch(() => [] as ExternalFixture[]);
    filtered = filterSearchResults(fallback, query, teamTerms);
  }
  return filtered.slice(0, 48);
}

export const searchUniversalFixtures = createServerFn({ method: "GET" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }) => searchUniversalFixturesInternal(data.query));

export type UniversalSourceStatus = { name: string; role: string; free: boolean; configured: boolean };
export const UNIVERSAL_SOURCES: UniversalSourceStatus[] = [
  { name: "Football-Data.co.uk", role: "historical results backbone", free: true, configured: true },
  { name: "OpenFootball", role: "open fixture/result enrichment", free: true, configured: true },
  { name: "Global-Live", role: "current fixture/live enrichment", free: true, configured: true },
  { name: "TheSportsDB", role: "daily global fixture fallback", free: true, configured: true },
  { name: "SportScore", role: "worldwide fixture/team discovery and enrichment", free: true, configured: true },
  { name: "StatArea", role: "external prediction opinion", free: true, configured: false },
  { name: "Public news sources", role: "news/injuries/team context", free: true, configured: false },
];
