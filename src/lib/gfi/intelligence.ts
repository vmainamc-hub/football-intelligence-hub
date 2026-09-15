import { createServerFn } from "@tanstack/react-start";
import { fetchFreeLeagueCsv, getFreeLeagueCsv } from "./free-data";
import { fixtureIdentity, type ExternalFixture } from "./fixture-sources";
import { fetchUniversalFixtures, getUniversalFixtures } from "./universal-sources";
import { syncReservoir } from "./data-reservoir";
import { analyzeAuthoritatively } from "./authoritative";
import {
  canonicalCompetitionName,
  canonicalTeamName,
  parseResultCell,
  parseScoreCell,
} from "./identity";

export type MatchRow = {
  date: string;
  time?: string;
  home: string;
  away: string;
  hg?: number;
  ag?: number;
  result?: "H" | "D" | "A";
  league?: string;
  code?: string;
  source?: string;
  sourceId?: string;
};

export type TeamSnapshot = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  homeOrAwayRate: number;
  recent: string[];
};

export type IntelligenceResult = {
  home: TeamSnapshot;
  away: TeamSnapshot;
  probabilities: { home: number; draw: number; away: number };
  totals: Record<string, number>;
  btts: { yes: number; no: number };
  confidence: number;
  quality: number;
  verdict: string;
  warnings: string[];
  evidence: string[];
};

export const LEAGUES: Record<string, string> = {
  E0: "Premier League",
  E1: "Championship",
  D1: "Bundesliga",
  D2: "2. Bundesliga",
  I1: "Serie A",
  I2: "Serie B",
  SP1: "La Liga",
  SP2: "La Liga 2",
  F1: "Ligue 1",
  F2: "Ligue 2",
  N1: "Eredivisie",
  P1: "Primeira Liga",
};

export type FreeLeague = {
  league: string;
  code: string;
  season: string;
  matches: MatchRow[];
  sourceUrl: string;
  fetchedAt: string;
};

function currentSeasonCode(now = new Date()): string {
  const year = now.getUTCFullYear();
  const seasonStart = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${String(seasonStart).slice(-2)}${String(seasonStart + 1).slice(-2)}`;
}
function parseCsv(text: string): MatchRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const split = (line: string) => {
    const cells: string[] = [];
    let cell = "",
      quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i],
        next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    cells.push(cell);
    return cells;
  };
  const headers = split(lines[0]).map((v) => v.trim()),
    ix = (n: string) => headers.findIndex((h) => h === n),
    di = ix("Date"),
    ti = ix("Time"),
    hi = ix("HomeTeam"),
    ai = ix("AwayTeam"),
    hgi = ix("FTHG"),
    agi = ix("FTAG"),
    ri = ix("FTR");
  if (hi < 0 || ai < 0) return [];
  return lines
    .slice(1)
    .map((line) => {
      const c = split(line);
      const home = (c[hi] ?? "").trim(),
        away = (c[ai] ?? "").trim();
      return {
        date: (c[di] ?? "").trim(),
        time: (c[ti] ?? "").trim() || undefined,
        home: canonicalTeamName(home),
        away: canonicalTeamName(away),
        hg: parseScoreCell(c[hgi]),
        ag: parseScoreCell(c[agi]),
        result: parseResultCell(c[ri]),
        source: "football-data",
      } satisfies MatchRow;
    })
    .filter((m) => m.home && m.away);
}
function kenyaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function addDays(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function sourceDateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const y = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${String(y).padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function normaliseLeague(value: string) {
  return canonicalCompetitionName(value);
}
function dynamicCode(league: string) {
  let h = 0;
  for (const ch of league) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `G${h.toString(36).slice(0, 7).toUpperCase()}`;
}
function addFallbackGroups(groups: FreeLeague[], fallback: ExternalFixture[]) {
  const by = new Map<string, ExternalFixture[]>();
  for (const raw of fallback) {
    const league = normaliseLeague(raw.league ?? "Worldwide Football");
    const rows = by.get(league) ?? [];
    rows.push({ ...raw, league });
    by.set(league, rows);
  }
  const next = groups.map((g) => ({ ...g, matches: [...g.matches] }));
  for (const [league, rows] of by) {
    const target = next.find((g) => normaliseLeague(g.league) === league);
    if (target) {
      const ids = new Set(target.matches.map(fixtureIdentity));
      target.matches.push(
        ...rows
          .filter((m) => !ids.has(fixtureIdentity(m)))
          .map((m) => ({ ...m, code: target.code, league: target.league })),
      );
      continue;
    }
    const code = dynamicCode(league);
    next.push({
      league,
      code,
      season: currentSeasonCode(),
      matches: rows.map((m) => ({ ...m, code, league })),
      sourceUrl: "universal-free-sources",
      fetchedAt: new Date().toISOString(),
    });
  }
  return next;
}
export type GlobalDiscoveryStatus = {
  status: "OPTIMAL" | "DEGRADED";
  externalFixturesFound: number;
  totalGroups: number;
  message?: string;
  checkedAt: string;
};

let lastDiscoveryStatus: GlobalDiscoveryStatus = {
  status: "OPTIMAL",
  externalFixturesFound: 0,
  totalGroups: 0,
  checkedAt: new Date().toISOString(),
};

export function getGlobalDiscoveryStatus(): GlobalDiscoveryStatus {
  return lastDiscoveryStatus;
}

export const fetchFreeFixtures = createServerFn({ method: "GET" }).handler(
  async (): Promise<FreeLeague[]> => {
    return loadFreeFixturesInternal();
  },
);

export async function loadFreeFixtures(): Promise<FreeLeague[]> {
  if (typeof window !== "undefined") {
    return fetchFreeFixtures();
  }
  return loadFreeFixturesInternal();
}

async function loadFreeFixturesInternal(): Promise<FreeLeague[]> {
  const season = currentSeasonCode(),
    entries = Object.entries(LEAGUES);
  const settled = await Promise.allSettled(
    entries.map(async ([code, league]) => {
      const payload = await getFreeLeagueCsv(code, season);
      const matches = parseCsv(payload.csv);
      if (!matches.length) throw new Error(`${league} returned no usable matches`);
      return {
        league,
        code,
        season: payload.season,
        matches,
        sourceUrl: payload.sourceUrl,
        fetchedAt: payload.fetchedAt,
      } satisfies FreeLeague;
    }),
  );
  let loaded = settled.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
  if (!loaded.length) throw new Error(`FREE football data feed unavailable for season ${season}.`);
  const today = kenyaDateKey();
  let externalFound = 0;
  try {
    const fallback = await getUniversalFixtures(today, addDays(today, 14));
    externalFound = fallback.length;
    loaded = addFallbackGroups(loaded, fallback as ExternalFixture[]);
    lastDiscoveryStatus = {
      status: externalFound > 0 ? "OPTIMAL" : "DEGRADED",
      externalFixturesFound: externalFound,
      totalGroups: loaded.length,
      message:
        externalFound > 0
          ? undefined
          : "GLOBAL DISCOVERY DEGRADED: external providers returned 0 upcoming fixtures.",
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    lastDiscoveryStatus = {
      status: "DEGRADED",
      externalFixturesFound: 0,
      totalGroups: loaded.length,
      message: `GLOBAL DISCOVERY DEGRADED: ${err instanceof Error ? err.message : String(err)}`,
      checkedAt: new Date().toISOString(),
    };
  }
  const reservoirRows = loaded.flatMap((group) =>
    group.matches.map((match) => ({ ...match, league: group.league, code: group.code })),
  );
  if (reservoirRows.length)
    void syncReservoir({
      data: { rows: reservoirRows, dataset: `live-${season}` },
    }).catch(() => undefined);
  return loaded;
}
function ukOffsetHours(key: string) {
  const y = Number(key.slice(0, 4)),
    march = new Date(Date.UTC(y, 2, 31)),
    oct = new Date(Date.UTC(y, 9, 31)),
    start = `${y}-03-${String(31 - march.getUTCDay()).padStart(2, "0")}`,
    end = `${y}-10-${String(31 - oct.getUTCDay()).padStart(2, "0")}`;
  return key >= start && key < end ? 2 : 3;
}
function sourceToKenyaOffsetHours(source: string | undefined, dateKey: string): number {
  if (source === "betika") {
    // Betika times are published in Kenya time (EAT = UTC+3)
    return 0;
  }
  if (source === "football-data") {
    // Football-Data CSV times are UK local times (GMT in winter = UTC+3 to EAT; BST in summer = UTC+2 to EAT)
    return ukOffsetHours(dateKey);
  }
  // ESPN, SportScore, TheSportsDB, OpenFootball provide UTC times.
  // Kenya is UTC+3, so the offset from UTC to Kenya EAT is +3 hours.
  return 3;
}

export function kickoffKenya(match: MatchRow) {
  if (!match.time) return undefined;
  const key = sourceDateKey(match.date),
    m = match.time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const offset = sourceToKenyaOffsetHours(match.source, key),
    minutes = Number(m[1]) * 60 + Number(m[2]) + offset * 60,
    dayShift = Math.floor(minutes / 1440),
    normalized = ((minutes % 1440) + 1440) % 1440;
  return `${key}${dayShift ? `+${dayShift}` : ""} ${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}
export function upcomingFixtures(all: FreeLeague[]) {
  const today = kenyaDateKey();
  return all
    .flatMap((g) =>
      g.matches
        .filter((m) => m.hg === undefined && m.ag === undefined && sourceDateKey(m.date) >= today)
        .map((m) => ({ ...m, league: g.league, code: g.code, season: g.season })),
    )
    .sort((a, b) =>
      (kickoffKenya(a) ?? `${sourceDateKey(a.date)} 99:99`).localeCompare(
        kickoffKenya(b) ?? `${sourceDateKey(b.date)} 99:99`,
      ),
    );
}
export function findFixtures(
  all: FreeLeague[],
  query: string,
): (MatchRow & { league: string; code: string; season: string })[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const today = kenyaDateKey();
  return all
    .flatMap((g) =>
      g.matches
        .filter((m) => `${m.home} ${m.away}`.toLowerCase().includes(q))
        .map((m) => ({ ...m, league: g.league, code: g.code, season: g.season })),
    )
    .sort((a, b) => {
      const au = a.hg === undefined && a.ag === undefined,
        bu = b.hg === undefined && b.ag === undefined,
        af = au && sourceDateKey(a.date) >= today,
        bf = bu && sourceDateKey(b.date) >= today;
      if (af !== bf) return af ? -1 : 1;
      return sourceDateKey(b.date).localeCompare(sourceDateKey(a.date));
    })
    .slice(0, 96);
}
export { analyzeAuthoritatively } from "./authoritative";
export { analyzeActiveAuthoritatively } from "./authoritative-runtime";
export type {
  AuthoritativeMatchAnalysis,
  EngineOutput,
  EngineId,
  EvidenceItem,
  ActionablePrediction,
} from "./authoritative";
export function analyzeMatch(fixture: MatchRow, allMatches: MatchRow[]): IntelligenceResult {
  return analyzeActiveAuthoritatively(fixture, allMatches);
}
export function leagueNames() {
  return LEAGUES;
}
