import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { searchUniversalFixtures } from "./universal-sources";

export type { AnalysisPipelineTrace, ServerMatchAnalysis } from "./server-pipeline";

export const analyzeFreeMatch = createServerFn({ method: "POST" })
  .validator((input: { code: string; fixture: MatchRow }) => input)
  .handler(async ({ data }): Promise<ServerMatchAnalysis> => {
    const groups = await loadFreeFixtures();
    const hasGroup = groups.some((item) => item.code === data.code || item.league === data.fixture.league);
    if (hasGroup) return analyzeLoadedFixture(data.fixture, data.code, groups);

    // Universal discovery fallback: a valid match from a worldwide source may not yet belong to a registered competition group.
    const discovered = await searchUniversalFixtures({ data: { query: `${data.fixture.home} vs ${data.fixture.away}` } });
    const relevant = discovered.filter((row) => row.home && row.away);
    if (!relevant.length) throw new Error(`Competition ${data.code} is not available in FREE MODE and no universal match context was found.`);
    const synthetic = { league: data.fixture.league ?? relevant[0].league ?? "Worldwide Football", code: data.code || "GLOBAL", season: "global", matches: relevant, sourceUrl: "universal-discovery", fetchedAt: new Date().toISOString() };
    return analyzeLoadedFixture(data.fixture, synthetic.code, [...groups, synthetic]);
  });
