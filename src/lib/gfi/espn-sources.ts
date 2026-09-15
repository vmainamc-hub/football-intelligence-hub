import type { MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamName, parseScoreCell } from "./identity";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

/**
 * ESPN public scoreboards are used as free discovery/enrichment sources.
 * No API key is required. One date-range request per competition keeps the
 * daily fixture sweep bounded and covers domestic cups plus major leagues.
 */
const LEAGUES: Array<{ slug: string; name: string; code: string }> = [
  { slug: "eng.1", name: "Premier League", code: "E0" },
  { slug: "eng.2", name: "Championship", code: "E1" },
  { slug: "eng.3", name: "League One", code: "E2" },
  { slug: "eng.4", name: "League Two", code: "E3" },
  { slug: "eng.5", name: "National League", code: "E5" },
  { slug: "eng.fa", name: "FA Cup", code: "FAC" },
  { slug: "eng.league_cup", name: "EFL Cup", code: "EFL" },
  { slug: "eng.trophy", name: "EFL Trophy", code: "EFLT" },
  { slug: "esp.1", name: "La Liga", code: "SP1" },
  { slug: "esp.2", name: "La Liga 2", code: "SP2" },
  { slug: "esp.copa_del_rey", name: "Copa del Rey", code: "CDR" },
  { slug: "ger.1", name: "Bundesliga", code: "D1" },
  { slug: "ger.2", name: "2. Bundesliga", code: "D2" },
  { slug: "ita.1", name: "Serie A", code: "I1" },
  { slug: "ita.2", name: "Serie B", code: "I2" },
  { slug: "fra.1", name: "Ligue 1", code: "F1" },
  { slug: "fra.2", name: "Ligue 2", code: "F2" },
  { slug: "ned.1", name: "Eredivisie", code: "N1" },
  { slug: "por.1", name: "Primeira Liga", code: "P1" },
  { slug: "sco.1", name: "Scottish Premiership", code: "SC0" },
  { slug: "bel.1", name: "Belgian Pro League", code: "B1" },
  { slug: "tur.1", name: "Turkish Super Lig", code: "T1" },
  { slug: "gre.1", name: "Greek Super League", code: "G1" },
  { slug: "aut.1", name: "Austrian Bundesliga", code: "A1" },
  { slug: "sui.1", name: "Swiss Super League", code: "Z1" },
  { slug: "dnk.1", name: "Danish Superliga", code: "DK1" },
  { slug: "nor.1", name: "Norwegian Eliteserien", code: "NOR1" },
  { slug: "swe.1", name: "Swedish Allsvenskan", code: "SWE1" },
  { slug: "usa.1", name: "MLS", code: "USA1" },
  { slug: "mex.1", name: "Liga MX", code: "MEX1" },
  { slug: "bra.1", name: "Brasileirão", code: "BRA1" },
  { slug: "conmebol.libertadores", name: "Copa Libertadores", code: "LIB" },
  { slug: "conmebol.sudamericana", name: "Copa Sudamericana", code: "SUD" },
  { slug: "uefa.champions", name: "UEFA Champions League", code: "UCL" },
  { slug: "uefa.europa", name: "UEFA Europa League", code: "UEL" },
  { slug: "uefa.europa.conf", name: "UEFA Conference League", code: "UECL" },
];

let cache: { key: string; at: number; rows: MatchRow[] } | null = null;

function withTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    signal: controller.signal,
    headers: { Accept: "application/json", "User-Agent": "Global-Football-Intelligence/1.0" },
  }).finally(() => clearTimeout(timer));
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

function parseEvents(payload: unknown, leagueName: string, code: string): MatchRow[] {
  if (!payload || typeof payload !== "object") return [];
  const events = Array.isArray((payload as { events?: unknown }).events)
    ? (payload as { events: unknown[] }).events
    : [];

  return events.flatMap((event, index) => {
    if (!event || typeof event !== "object") return [];
    const item = event as Record<string, unknown>;
    const competitions = Array.isArray(item.competitions)
      ? (item.competitions as Record<string, unknown>[])
      : [];
    const competition = competitions[0];
    const competitors = Array.isArray(competition?.competitors)
      ? (competition.competitors as Record<string, unknown>[])
      : [];
    const home = competitors.find((x) => x.homeAway === "home");
    const away = competitors.find((x) => x.homeAway === "away");
    const homeTeam = home?.team as Record<string, unknown> | undefined;
    const awayTeam = away?.team as Record<string, unknown> | undefined;
    const homeName = canonicalTeamName(
      String(homeTeam?.displayName ?? homeTeam?.name ?? "").trim(),
    );
    const awayName = canonicalTeamName(
      String(awayTeam?.displayName ?? awayTeam?.name ?? "").trim(),
    );
    const rawDate = String(item.date ?? "");
    if (!homeName || !awayName || !rawDate) return [];

    const homeScore = parseScoreCell(home?.score as string | number | undefined);
    const awayScore = parseScoreCell(away?.score as string | number | undefined);
    const status = item.status as Record<string, unknown> | undefined;
    const type = status?.type as Record<string, unknown> | undefined;
    const completed = type?.completed === true;

    return [
      {
        date: dateKey(rawDate),
        time: rawDate.match(/T(\d{2}:\d{2})/)?.[1],
        home: homeName,
        away: awayName,
        hg: completed ? homeScore : undefined,
        ag: completed ? awayScore : undefined,
        result:
          completed && homeScore !== undefined && awayScore !== undefined
            ? homeScore > awayScore
              ? "H"
              : homeScore < awayScore
                ? "A"
                : "D"
            : undefined,
        league: canonicalCompetitionName(leagueName),
        code,
        source: "espn",
        sourceId: String(item.id ?? `${code}-${index}`),
      } satisfies MatchRow,
    ];
  });
}

export async function fetchEspnFixtures(dateFrom: string, dateTo: string): Promise<MatchRow[]> {
  const cacheKey = `${dateFrom}|${dateTo}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const out: MatchRow[] = [];
  const chunkSize = 6;
  for (let start = 0; start < LEAGUES.length; start += chunkSize) {
    const batch = await Promise.allSettled(
      LEAGUES.slice(start, start + chunkSize).map(async (league) => {
        const dates = `${dateFrom.replace(/-/g, "")}-${dateTo.replace(/-/g, "")}`;
        const response = await withTimeout(`${BASE}/${league.slug}/scoreboard?dates=${dates}`);
        if (!response.ok) return [] as MatchRow[];
        return parseEvents(await response.json(), league.name, league.code);
      }),
    );
    for (const result of batch) if (result.status === "fulfilled") out.push(...result.value);
  }

  const seen = new Set<string>();
  const deduped = out.filter((row) => {
    const id = `${row.date}|${row.home.toLowerCase()}|${row.away.toLowerCase()}|${row.time ?? ""}|${row.source}|${row.sourceId}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return row.date >= dateFrom && row.date <= dateTo;
  });
  cache = { key: cacheKey, at: Date.now(), rows: deduped };
  return deduped;
}

export const ESPN_SOURCE_CATALOG = LEAGUES.map((x) => ({
  name: "ESPN Public Soccer API",
  league: x.name,
  slug: x.slug,
  free: true,
  requiresApiKey: false,
}));
