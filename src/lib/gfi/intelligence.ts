import { fetchFreeLeagueCsv } from "./free-data";
import { analyzeAuthoritatively } from "./authoritative";

export type MatchRow = {
  date: string;
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
  // European football seasons span two calendar years. July is treated as
  // the start of the new season so the app follows the live season without
  // hard-coding 2627 forever.
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
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else {
        cell += char;
      }
    }

    cells.push(cell);
    return cells;
  };

  const clean = (value: string) => value.trim();
  const headers = splitCsvLine(lines[0]).map(clean);
  const ix = (name: string) => headers.findIndex((header) => header === name);
  const di = ix("Date");
  const hi = ix("HomeTeam");
  const ai = ix("AwayTeam");
  const hgi = ix("FTHG");
  const agi = ix("FTAG");
  const ri = ix("FTR");

  if (hi < 0 || ai < 0) return [];

  return lines
    .slice(1)
    .map((line) => {
      const cells = splitCsvLine(line);
      const hg = Number(clean(cells[hgi] ?? ""));
      const ag = Number(clean(cells[agi] ?? ""));
      const result = clean(cells[ri] ?? "");

      return {
        date: clean(cells[di] ?? ""),
        home: clean(cells[hi] ?? ""),
        away: clean(cells[ai] ?? ""),
        hg: Number.isFinite(hg) ? hg : undefined,
        ag: Number.isFinite(ag) ? ag : undefined,
        result: result === "H" || result === "D" || result === "A" ? result : undefined,
      } satisfies MatchRow;
    })
    .filter((match) => match.home && match.away);
}

export async function loadFreeFixtures(): Promise<FreeLeague[]> {
  const season = currentSeasonCode();
  const entries = Object.entries(LEAGUES);

  const settled = await Promise.allSettled(
    entries.map(async ([code, league]) => {
      const payload = await fetchFreeLeagueCsv({ data: { code, season } });
      const matches = parseCsv(payload.csv);

      if (!matches.length) {
        throw new Error(`${league} returned no usable matches`);
      }

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

  const loaded = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));

  if (!loaded.length) {
    const failures = settled
      .filter((item): item is PromiseRejectedResult => item.status === "rejected")
      .map((item, index) => `${entries[index]?.[0] ?? "unknown"}: ${String(item.reason)}`)
      .join("; ");
    throw new Error(`FREE football data feed unavailable for season ${season}. ${failures}`);
  }

  return loaded;
}

export function findFixtures(
  all: FreeLeague[],
  query: string,
): (MatchRow & { league: string; code: string; season: string })[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return all
    .flatMap((group) =>
      group.matches
        .filter((match) => `${match.home} ${match.away}`.toLowerCase().includes(q))
        .slice(-12)
        .map((match) => ({ ...match, league: group.league, code: group.code, season: group.season })),
    )
    .slice(0, 24);
}

export { analyzeAuthoritatively } from "./authoritative";
export type { AuthoritativeMatchAnalysis, EngineOutput, EngineId, EvidenceItem } from "./authoritative";

export function analyzeMatch(fixture: MatchRow, allMatches: MatchRow[]): IntelligenceResult {
  return analyzeAuthoritatively(fixture, allMatches);
}

export function leagueNames() {
  return LEAGUES;
}
