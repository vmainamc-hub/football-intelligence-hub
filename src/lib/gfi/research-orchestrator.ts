import { createServerFn } from "@tanstack/react-start";
import { searchReservoir, reservoirHistoricalContext, type ReservoirMatch } from "./data-reservoir";
import { searchUniversalFixtures } from "./universal-sources";
import type { MatchRow } from "./intelligence";

export type ResearchResult = {
  query: string;
  matches: MatchRow[];
  reservoirMatches: number;
  liveMatches: number;
  distinctSources: number;
  sources: string[];
  coverage: number;
  searchedAt: string;
};

function identity(row: MatchRow) {
  return `${row.date}|${row.home.toLowerCase()}|${row.away.toLowerCase()}|${row.time ?? ""}|${row.hg ?? ""}|${row.ag ?? ""}`;
}

function toMatch(row: ReservoirMatch): MatchRow {
  return { date: row.date, time: row.time, home: row.home, away: row.away, hg: row.hg, ag: row.ag, result: row.result, league: row.league, code: row.code, source: row.source, sourceId: row.reservoirId };
}

export const researchFixture = createServerFn({ method: "GET" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<ResearchResult> => {
    const query = data.query.trim();
    if (!query) return { query, matches: [], reservoirMatches: 0, liveMatches: 0, distinctSources: 0, sources: [], coverage: 0, searchedAt: new Date().toISOString() };
    const [stored, live] = await Promise.all([
      reservoirHistoricalContext(query.split(/\s+(?:vs?|v|versus)\s+/i)[0], query.split(/\s+(?:vs?|v|versus)\s+/i)[1] ?? "", 300).catch(() => []),
      searchUniversalFixtures({ data: { query } }).catch(() => []),
    ]);
    const merged = new Map<string, MatchRow>();
    for (const row of stored) merged.set(identity(row), toMatch(row));
    for (const row of live) merged.set(identity(row), row);
    const matches = [...merged.values()].sort((a, b) => `${a.date}|${a.time ?? ""}`.localeCompare(`${b.date}|${b.time ?? ""}`));
    const sources = [...new Set(matches.map((row) => row.source ?? "unknown"))];
    const hasHistory = stored.some((row) => row.hg !== undefined && row.ag !== undefined);
    const hasFuture = matches.some((row) => row.hg === undefined || row.ag === undefined);
    const hasMultipleSources = sources.length >= 2;
    const coverage = Math.round((Number(stored.length > 0) * 35 + Number(hasHistory) * 25 + Number(hasFuture) * 20 + Number(hasMultipleSources) * 20));
    return { query, matches, reservoirMatches: stored.length, liveMatches: live.length, distinctSources: sources.length, sources, coverage, searchedAt: new Date().toISOString() };
  });

export async function researchTeamOrFixture(query: string) {
  return researchFixture({ data: { query } });
}
