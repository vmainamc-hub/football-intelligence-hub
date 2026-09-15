import type { MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamName, parseScoreCell } from "./identity";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TIMEOUT_MS = 10_000;

/**
 * ESPN's public site scoreboard is used only as a discovery/enrichment source.
 * No API key is required. The date-range form keeps requests bounded while
 * covering leagues that are absent from Football-Data/OpenFootball (including
 * domestic cups).
 */
const LEAGUES: Array<{ slug: string; name: string; code: string }> = [
  { slug: "eng.1", name: "Premier League", code: "E0" },
  { slug: "eng.2", name: "Championship", code: "E1" },
  { slug: "esp.1", name: "La Liga", code: "SP1" },
  { slug: "esp.2", name: "La Liga 2", code: "SP2" },
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
  { slug: "nor.1", name: "Norwegian Eliteserien", code: "NOK1" },
  { slug: "swe.1", name: "Swedish Allsvenskan", code: "SW1" },
  { slug: "usa.1", name: "MLS", code: "USA1" },
  { slug: "mex.1", name: "Liga MX", code: "MEX1" },
  { slug: "bra.1", name: "Brasileirão", code: "BRA1" },
  { slug: "conmebol.libertadores", name: "Copa Libertadores", code: "LIB" },
  { slug: "conmebol.sudamericana", name: "Copa Sudamericana", code: "SUD" },
  { slug: "uefa.champions", name: "UEFA Champions League", code: "UCL" },
  { slug: "uefa.europa", name: "UEFA Europa League", code: "UEL" },
  { slug: "uefa.europa.conf", name: "UEFA Conference League", code: "UECL" },
];

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
    const homeName = canonicalTeamName(String(homeTeam?.displayName ?? homeTeam?.name ?? "").trim());
    const awayName = canonicalTeamName(String(awayTeam?.displayName ?? awayTeam?.name ?? "").trim());
    const rawDate = String(item.date ?? "");
    if (!homeName || !awayName || !rawDate) return [];

    const homeScore = parseScoreCell(home?.score as string | number | undefined);
    const awayScore = parseScoreCell(away?.score as string | number | undefined);
    const completed = Boolean(
      (item.status as Record<string, unknown> | undefined)?.type &&
        ((item.status as Record<string, unknown>).type as Record<string, unknown>).completed === true,
    );

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
  const range = `${dateFrom.replace(/-/g, "")}-${dateTo.replace(/-/g, "")}`;
  const settled = await Promise.allSettled(
    LEAGUES.map(async (league) => {
      const response = await withTimeout(`${BASE}/${league.slug}/scoreboard?dates=${range}`);
      if (!response.ok) return [] as MatchRow[];
      return parseEvents(await response.json(), league.name, league.code);
    }),
  );

  const seen = new Set<string>();
  const out: MatchRow[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const id = `${row.date}|${row.home.toLowerCase()}|${row.away.toLowerCase()}|${row.sourceId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (row.date >= dateFrom && row.date <= dateTo) out.push(row);
    }
  }
  return out;
}

export const ESPN_SOURCE_CATALOG = LEAGUES.map((x) => ({
  name: "ESPN Public Soccer API",
  league: x.name,
  slug: x.slug,
  free: true,
  requiresApiKey: false,
}));
