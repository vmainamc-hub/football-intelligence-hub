import { fetchFreeLeagueCsv } from "./free-data";
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
    } satisfies MatchRow;
  }).filter((match) => match.home && match.away);
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
  const loaded = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  if (!loaded.length) {
    const failures = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item, index) => `${entries[index]?.[0] ?? "unknown"}: ${String(item.reason)}`).join("; ");
    throw new Error(`FREE football data feed unavailable for season ${season}. ${failures}`);
  }
  return loaded;
}

function kenyaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function sourceDateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
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
  const minutes = Number(m[1]) * 60 + Number(m[2]) + ukOffsetHours(key) * 60;
  const dayShift = Math.floor(minutes / 1440);
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${key}${dayShift ? `+${dayShift}` : ""} ${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function upcomingFixtures(all: FreeLeague[], minimumHourEAT = 21) {
  const today = kenyaDateKey();
  const todayCutoff = minimumHourEAT * 60;
  return all.flatMap((group) => group.matches.filter((match) => {
    if (match.hg !== undefined || match.ag !== undefined) return false;
    const dateKey = sourceDateKey(match.date);
    if (dateKey > today) return true;
    if (dateKey < today) return false;
    if (!match.time) return false;
    const kenya = kickoffKenya(match);
    if (!kenya) return false;
    const hm = kenya.match(/ (\d{2}):(\d{2})$/);
    return !!hm && Number(hm[1]) * 60 + Number(hm[2]) >= todayCutoff;
  }).map((match) => ({ ...match, league: group.league, code: group.code, season: group.season })) as Array<MatchRow & { league: string; code: string; season: string }>).sort((a, b) => `${sourceDateKey(a.date)} ${a.time ?? "99:99"}`.localeCompare(`${sourceDateKey(b.date)} ${b.time ?? "99:99"}`));
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
  }).slice(0, 24);
}

export { analyzeAuthoritatively } from "./authoritative";
export type { AuthoritativeMatchAnalysis, EngineOutput, EngineId, EvidenceItem, ActionablePrediction } from "./authoritative";

export function analyzeMatch(fixture: MatchRow, allMatches: MatchRow[]): IntelligenceResult { return analyzeAuthoritatively(fixture, allMatches); }
export function leagueNames() { return LEAGUES; }
