import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeAuthoritatively, type AuthoritativeMatchAnalysis } from "./authoritative";

export type AnalysisPipelineTrace = {
  fixtureId: string;
  source: string;
  competition: string;
  historicalRowsLoaded: number;
  homeRowsMatched: number;
  awayRowsMatched: number;
  homeSample: number;
  awaySample: number;
  h2hSample: number;
  enginesRun: string[];
  generatedAt: string;
};

export type ServerMatchAnalysis = AuthoritativeMatchAnalysis & {
  pipeline: AnalysisPipelineTrace;
};

const normalizeName = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\bfootball club\b/g, "")
  .replace(/\b(afc|fc)\b/g, "")
  .replace(/[^a-z0-9]/g, "")
  .trim();

const aliases = (value: string) => {
  const base = normalizeName(value);
  const variants = new Set([base]);
  for (const suffix of ["united", "city", "town", "rovers", "athletic"]) {
    if (base.endsWith(suffix) && base.length > suffix.length + 3) variants.add(base.slice(0, -suffix.length));
  }
  return variants;
};

function sameTeam(a: string, b: string) {
  if (a === b) return true;
  const aa = aliases(a), bb = aliases(b);
  for (const value of aa) if (bb.has(value)) return true;
  return false;
}

function dateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function fixtureId(fixture: MatchRow) {
  return [dateKey(fixture.date), normalizeName(fixture.home), normalizeName(fixture.away), fixture.time ?? "", fixture.source ?? "free"].join("|");
}

function prepareHistoricalMatches(fixture: MatchRow, rows: MatchRow[]) {
  const aligned = rows
    .filter((row) => row.hg !== undefined && row.ag !== undefined)
    .filter((row) => dateKey(row.date) <= dateKey(fixture.date))
    .map((row) => ({
      ...row,
      home: sameTeam(row.home, fixture.home) ? fixture.home : sameTeam(row.home, fixture.away) ? fixture.away : row.home,
      away: sameTeam(row.away, fixture.home) ? fixture.home : sameTeam(row.away, fixture.away) ? fixture.away : row.away,
    }));

  return aligned.sort((a, b) => `${dateKey(a.date)} ${a.time ?? ""}`.localeCompare(`${dateKey(b.date)} ${b.time ?? ""}`));
}

export const analyzeFreeMatch = createServerFn({ method: "POST" })
  .validator((input: { code: string; fixture: MatchRow }) => input)
  .handler(async ({ data }): Promise<ServerMatchAnalysis> => {
    const groups = await loadFreeFixtures();
    const group = groups.find((item) => item.code === data.code);
    if (!group) throw new Error(`League ${data.code} is not available in FREE MODE.`);

    const historical = prepareHistoricalMatches(data.fixture, group.matches);
    const homeRows = historical.filter((row) => sameTeam(row.home, data.fixture.home) || sameTeam(row.away, data.fixture.home));
    const awayRows = historical.filter((row) => sameTeam(row.home, data.fixture.away) || sameTeam(row.away, data.fixture.away));
    const result = analyzeAuthoritatively({ ...data.fixture, home: data.fixture.home, away: data.fixture.away }, historical);
    const engineNames = result.engines.map((engine) => engine.id);
    const h2hSample = result.engines.find((engine) => engine.id === "H2H")?.values.matches ?? 0;
    const generatedAt = new Date().toISOString();

    return {
      ...result,
      pipeline: {
        fixtureId: fixtureId(data.fixture),
        source: data.fixture.source ?? "free-data",
        competition: data.fixture.league ?? group.league,
        historicalRowsLoaded: historical.length,
        homeRowsMatched: homeRows.length,
        awayRowsMatched: awayRows.length,
        homeSample: result.home.played,
        awaySample: result.away.played,
        h2hSample,
        enginesRun: engineNames,
        generatedAt,
      },
    };
  });
