import { fetchFreeLeagueCsv } from "./free-data";
import { fixtureIdentity, type ExternalFixture } from "./fixture-sources";
import { fetchUniversalFixtures } from "./universal-sources";
import { analyzeAuthoritatively } from "./authoritative";

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
  const splitCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i], next = line[i + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(cell); cell = ""; }
      else cell += char;
    }
    cells.push(cell);
    return cells;
  };
  const clean = (value: string) => value.trim();
  const headers = splitCsvLine(lines[0]).map(clean);
  const ix = (name: string) => headers.findIndex((header) => header === name);
  const di = ix("Date"), ti = ix("Time"), hi = ix("HomeTeam"), ai = ix("AwayTeam"), hgi = ix("FTHG"), agi = ix("FTAG"), ri = ix("FTR");
  if (hi < 0 || ai < 0) return [];
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const hg = Number(clean(cells[hgi] ?? "")), ag = Number(clean(cells[agi] ?? "")), result = clean(cells[ri] ?? "");
    return {
      date: clean(cells[di] ?? ""),
      time: clean(cells[ti] ?? "") || undefined,
      home: clean(cells[hi] ?? ""),
      away: clean(cells[ai] ?? ""),
      hg: Number.isFinite(hg) ? hg : undefined,
      ag: Number.isFinite(ag) ? ag : undefined,
      result: result === "H" || result === "D" || result === "A" ? result : undefined,
      source: "football-data",
    } satisfies MatchRow;
  }).filter((match) => match.home && match.away);
}

function kenyaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(dateKey: string, days: number) {
  const value = new Date(`${dateKey}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sourceDateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function normaliseLeague(value: string) {
  const n = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const aliases: Record<string, string> = {
    "liga portugal": "Primeira Liga",
    "liga portugal betclic": "Primeira Liga",
    "portuguese primeira liga": "Primeira Liga",
    "primeira liga": "Primeira Liga",
    "english premier league": "Premier League",
    "english championship": "Championship",
    "german bundesliga": "Bundesliga",
    "2 bundesliga": "2. Bundesliga",
    "spanish laliga": "La Liga",
    "spanish la liga": "La Liga",
    "italian serie a": "Serie A",
    "french ligue 1": "Ligue 1",
    "dutch eredivisie": "Eredivisie",
  };
  return aliases[n] ?? value.trim() || "Worldwide Football";
}

function dynamicCode(league: string) {
  let hash = 0;
  for (const char of league) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `G${hash.toString(36).slice(0, 7).toUpperCase()}`;
}

function addFallbackGroups(groups: FreeLeague[], fallback: ExternalFixture[]) {
  const byLeague = new Map<string, ExternalFixture[]>();
  for (const raw of fallback) {
    const league = normaliseLeague(raw.league ?? "Worldwide Football");
    const rows = byLeague.get(league) ?? [];
    rows.push({ ...raw, league });
    byLeague.set(league, rows);
  }
  const next = groups.map((group) => ({ ...group, matches: [...group.matches] }));
  for (const [league, rows] of byLeague) {
    const target = next.find((group) => normaliseLeague(group.league) === league);
    if (target) {
      const identities = new Set(target.matches.map(fixtureIdentity));
      target.matches.push(...rows.filter((match) => !identities.has(fixtureIdentity(match))).map((match) => ({ ...match, code: target.code, league: target.league })));
      continue;
    }
    const code = dynamicCode(league);
    const existing = next.find((group) => group.code === code);
    if (existing) {
      const identities = new Set(existing.matches.map(fixtureIdentity));
      existing.matches.push(...rows.filter((match) => !identities.has(fixtureIdentity(match))));
    } else {
      next.push({ league, code, season: currentSeasonCode(), matches: rows.map((match) => ({ ...match, code, league })), sourceUrl: "universal-free-sources", fetchedAt: new Date().toISOString() });
    }
  }
  return next;
}

export async function loadFreeFixtures(): Promise<FreeLeague[]> {
  const season = currentSeasonCode();
  const entries = Object.entries(LEAGUES);
  const settled = await Promise.allSettled(entries.map(async ([code, league]) => {
    const payload = await fetchFreeLeagueCsv({ data: { code, season } });
    const matches = parseCsv(payload.csv);
    if (!matches.length) throw new Error(`${league} returned no usable matches`);
    return { league, code, season: payload.season, matches, sourceUrl: payload.sourceUrl, fetchedAt: payload.fetchedAt } satisfies FreeLeague;
  }));
  let loaded = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  if (!loaded.length) {
    const failures = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item, index) => `${entries[index]?.[0] ?? "unknown"}: ${String(item.reason)}`).join("; ");
    throw new Error(`FREE football data feed unavailable for season ${season}. ${failures}`);
  }
  const today = kenyaDateKey();
  try {
    const fallback = await fetchUniversalFixtures({ data: { dateFrom: today, dateTo: addDays(today, 14) } });
    loaded = addFallbackGroups(loaded, fallback as ExternalFixture[]);
  } catch {
    // The primary statistical backbone stays available when an enrichment source is down.
  }
  return loaded;
}

function ukOffsetHours(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  const march = new Date(Date.UTC(year, 2, 31));
  const marchLastSunday = 31 - march.getUTCDay();
  const october = new Date(Date.UTC(year, 9, 31));
  const octoberLastSunday = 31 - october.getUTCDay();
  const start = `${year}-03-${String(marchLastSunday).padStart(2, "0")}`;
  const end = `${year}-10-${String(octoberLastSunday).padStart(2, "0")}`;
  return dateKey >= start && dateKey < end ? 2 : 3;
}

export function kickoffKenya(match: MatchRow) {
  if (!match.time) return undefined;
  const key = sourceDateKey(match.date);
  const m = match.time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const isUtc = match.source === "global-live" || match.source === "sportscore";
  const offset = isUtc ? 0 : ukOffsetHours(key);
  const minutes = Number(m[1]) * 60 + Number(m[2]) + offset * 60;
  const dayShift = Math.floor(minutes / 1440);
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${key}${dayShift ? `+${dayShift}` : ""} ${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function upcomingFixtures(all: FreeLeague[]) {
  const today = kenyaDateKey();
  return all.flatMap((group) => group.matches.filter((match) => match.hg === undefined && match.ag === undefined && sourceDateKey(match.date) >= today).map((match) => ({ ...match, league: group.league, code: group.code, season: group.season }))).sort((a, b) => (kickoffKenya(a) ?? `${sourceDateKey(a.date)} 99:99`).localeCompare(kickoffKenya(b) ?? `${sourceDateKey(b.date)} 99:99`));
}

export function findFixtures(all: FreeLeague[], query: string): (MatchRow & { league: string; code: string; season: string })[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const today = kenyaDateKey();
  return all.flatMap((group) => group.matches.filter((match) => `${match.home} ${match.away}`.toLowerCase().includes(q)).map((match) => ({ ...match, league: group.league, code: group.code, season: group.season }))).sort((a, b) => {
    const au = a.hg === undefined && a.ag === undefined, bu = b.hg === undefined && b.ag === undefined;
    const af = au && sourceDateKey(a.date) >= today, bf = bu && sourceDateKey(b.date) >= today;
    if (af !== bf) return af ? -1 : 1;
    return sourceDateKey(b.date).localeCompare(sourceDateKey(a.date));
  }).slice(0, 48);
}

export { analyzeAuthoritatively } from "./authoritative";
export type { AuthoritativeMatchAnalysis, EngineOutput, EngineId, EvidenceItem, ActionablePrediction } from "./authoritative";

export function analyzeMatch(fixture: MatchRow, allMatches: MatchRow[]): IntelligenceResult { return analyzeAuthoritatively(fixture, allMatches); }
export function leagueNames() { return LEAGUES; }
