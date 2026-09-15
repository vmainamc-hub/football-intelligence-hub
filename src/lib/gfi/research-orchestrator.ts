import { createServerFn } from "@tanstack/react-start";
import { searchReservoir, reservoirHistoricalContext, type ReservoirMatch } from "./data-reservoir";
import { searchUniversalFixtures } from "./universal-sources";
import { fetchEspnFixtures } from "./espn-sources";
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
  return {
    date: row.date,
    time: row.time,
    home: row.home,
    away: row.away,
    hg: row.hg,
    ag: row.ag,
    result: row.result,
    league: row.league,
    code: row.code,
    source: row.source,
    sourceId: row.reservoirId,
  };
}

function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateFromQuery(query: string) {
  const found = query.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return found?.[1];
}

export const researchFixture = createServerFn({ method: "GET" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<ResearchResult> => {
    const query = data.query.trim();
    if (!query)
      return {
        query,
        matches: [],
        reservoirMatches: 0,
        liveMatches: 0,
        distinctSources: 0,
        sources: [],
        coverage: 0,
        searchedAt: new Date().toISOString(),
      };

    const [homeRaw = "", awayRaw = ""] = query.split(/\s+(?:vs?|v|versus)\s+/i);
    const fixtureDate = dateFromQuery(query);
    const from = fixtureDate ? addDays(fixtureDate, -3) : new Date().toISOString().slice(0, 10);
    const to = fixtureDate ? addDays(fixtureDate, 3) : addDays(from, 3);

    // Escalation ladder: stored reservoir -> universal public discovery -> ESPN
    // public scoreboard. Research widens evidence; it never silently overrides
    // the deterministic authority with another provider's prediction.
    const [stored, live, espn] = await Promise.all([
      reservoirHistoricalContext(homeRaw, awayRaw, 500).catch(() => []),
      searchUniversalFixtures({ data: { query } }).catch(() => []),
      fetchEspnFixtures(from, to).catch(() => []),
    ]);

    const merged = new Map<string, MatchRow>();
    for (const row of stored) merged.set(identity(row), toMatch(row));
    for (const row of live) merged.set(identity(row), row);

    const homeKey = homeRaw.trim().toLowerCase();
    const awayKey = awayRaw.trim().toLowerCase();
    for (const row of espn) {
      const text = `${row.home} ${row.away}`.toLowerCase();
      const homeMatch = !homeKey || text.includes(homeKey);
      const awayMatch = !awayKey || text.includes(awayKey);
      if ((homeKey && awayKey && homeMatch && awayMatch) || (!homeKey && !awayKey)) {
        merged.set(identity(row), row);
      }
    }

    const matches = [...merged.values()].sort((a, b) =>
      `${a.date}|${a.time ?? ""}`.localeCompare(`${b.date}|${b.time ?? ""}`),
    );
    const sources = [...new Set(matches.map((row) => row.source ?? "unknown"))];
    const historyCount = matches.filter((row) => row.hg !== undefined && row.ag !== undefined).length;
    const hasFixtureEvidence = matches.some((row) =>
      fixtureDate ? row.date === fixtureDate : row.hg === undefined || row.ag === undefined,
    );
    const hasMultipleSources = sources.length >= 2;
    const coverage = Math.min(
      100,
      Math.round(
        Number(historyCount > 0) * 25 +
          Math.min(35, historyCount) +
          Number(hasFixtureEvidence) * 20 +
          Number(hasMultipleSources) * 20,
      ),
    );

    return {
      query,
      matches,
      reservoirMatches: stored.length,
      liveMatches: live.length + espn.length,
      distinctSources: sources.length,
      sources,
      coverage,
      searchedAt: new Date().toISOString(),
    };
  });

export async function researchTeamOrFixture(query: string) {
  return researchFixture({ data: { query } });
}
