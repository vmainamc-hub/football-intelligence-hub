import { createServerFn } from "@tanstack/react-start";
import { ingestReservoirMatches } from "./data-reservoir";
import type { MatchRow } from "./intelligence";

const BASE_URL = "https://www.football-data.co.uk/mmz4281";
const CODES = [
  ["E0", "Premier League"], ["E1", "Championship"], ["D1", "Bundesliga"], ["D2", "2. Bundesliga"],
  ["I1", "Serie A"], ["I2", "Serie B"], ["SP1", "La Liga"], ["SP2", "La Liga 2"],
  ["F1", "Ligue 1"], ["F2", "Ligue 2"], ["N1", "Eredivisie"], ["P1", "Primeira Liga"],
] as const;
const TIMEOUT_MS = 15000;

function splitCsv(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(csv: string, code: string, league: string): MatchRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsv(lines[0]).map((x) => x.trim());
  const ix = (name: string) => headers.findIndex((x) => x === name);
  const di = ix("Date"), ti = ix("Time"), hi = ix("HomeTeam"), ai = ix("AwayTeam"), hgi = ix("FTHG"), agi = ix("FTAG"), ri = ix("FTR");
  if (hi < 0 || ai < 0 || di < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const c = splitCsv(line);
    const home = (c[hi] ?? "").trim(), away = (c[ai] ?? "").trim(), date = (c[di] ?? "").trim();
    if (!home || !away || !date) return [];
    // Blank FTHG/FTAG means "not played yet" — never score 0.
    const hg = parseScoreCell(c[hgi]), ag = parseScoreCell(c[agi]);
    return [{ date, time: (c[ti] ?? "").trim() || undefined,
      home: canonicalTeamName(home), away: canonicalTeamName(away), hg, ag,
      result: parseResultCell(c[ri]),
      league: canonicalCompetitionName(league), code, source: "football-data" } satisfies MatchRow];
  });
}

async function fetchSeason(code: string, league: string, season: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/${season}/${code}.csv`, {
      signal: controller.signal,
      headers: { Accept: "text/csv,text/plain,*/*", "User-Agent": "Global-Football-Intelligence/1.0" },
    });
    if (!response.ok) return { rows: [] as MatchRow[], error: `HTTP ${response.status}` };
    const rows = parseCsv(await response.text(), code, league);
    return { rows, error: rows.length ? undefined : "empty-or-invalid" };
  } catch (error) {
    return { rows: [] as MatchRow[], error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export const harvestHistoricalSeasons = createServerFn({ method: "POST" })
  .validator((input: { seasons?: string[] }) => input)
  .handler(async ({ data }) => {
    const seasons = [...new Set((data.seasons ?? ["2627", "2526", "2425"]).filter((x) => /^\d{4}$/.test(x)))].slice(0, 3);
    const totals = { requested: 0, successful: 0, failed: 0, matches: 0, teams: 0, competitions: 0 };
    const errors: string[] = [];
    const allRows: MatchRow[] = [];
    for (const season of seasons) {
      for (let i = 0; i < CODES.length; i += 4) {
        const batch = CODES.slice(i, i + 4);
        const settled = await Promise.all(batch.map(([code, league]) => fetchSeason(code, league, season)));
        for (let j = 0; j < settled.length; j += 1) {
          const [code, league] = batch[j];
          const outcome = settled[j];
          totals.requested += 1;
          if (outcome.rows.length) { totals.successful += 1; allRows.push(...outcome.rows); }
          else { totals.failed += 1; errors.push(`${season}/${code} ${league}: ${outcome.error ?? "unknown"}`); }
        }
      }
    }
    totals.matches = allRows.length;
    totals.teams = new Set(allRows.flatMap((r) => [r.home, r.away])).size;
    totals.competitions = new Set(allRows.map((r) => `${r.code}|${r.season ?? ""}|${r.league}`)).size;
    if (allRows.length) await ingestReservoirMatches(allRows, `football-data-historical-${seasons.join("-")}`);
    return { ...totals, errors: errors.slice(0, 40), seasons };
  });
