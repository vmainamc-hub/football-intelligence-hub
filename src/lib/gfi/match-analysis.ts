import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { researchFixture } from "./research-orchestrator";
import type { FreeLeague } from "./intelligence";

export type { AnalysisPipelineTrace, ServerMatchAnalysis } from "./server-pipeline";

function mergeMatches(rows: MatchRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.date}|${row.home.toLowerCase()}|${row.away.toLowerCase()}|${row.time ?? ""}|${row.hg ?? ""}|${row.ag ?? ""}|${row.source ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const analyzeFreeMatch = createServerFn({ method: "POST" })
  .validator((input: { code: string; fixture: MatchRow }) => input)
  .handler(async ({ data }): Promise<ServerMatchAnalysis> => {
    const [groups, research] = await Promise.all([
      loadFreeFixtures(),
      researchFixture({ data: { query: `${data.fixture.home} vs ${data.fixture.away} ${data.fixture.date}` } }).catch(
        () => ({
          matches: [],
          reservoirMatches: 0,
          liveMatches: 0,
          distinctSources: 0,
          sources: [],
          coverage: 0,
          query: "",
          searchedAt: new Date().toISOString(),
        }),
      ),
    ]);

    const researchRows = mergeMatches(research.matches);
    const targetGroup = groups.find(
      (item) => item.code === data.code || item.league === data.fixture.league,
    );
    const researchGroup: FreeLeague = {
      league: data.fixture.league ?? targetGroup?.league ?? "Worldwide Football",
      code: `RESEARCH_${data.code || "GLOBAL"}`,
      season: "research",
      matches: researchRows,
      sourceUrl: "reservoir-plus-live-public-research",
      fetchedAt: research.searchedAt,
    };

    const expandedGroups = [...groups, researchGroup];
    const analysis = analyzeLoadedFixture(
      data.fixture,
      targetGroup?.code ?? researchGroup.code,
      expandedGroups,
    );
    analysis.pipeline.historicalRowsLoaded = Math.max(
      analysis.pipeline.historicalRowsLoaded,
      research.reservoirMatches,
    );
    analysis.pipeline.competitionsLoaded = expandedGroups.length;
    analysis.warnings = [
      ...new Set([
        ...analysis.warnings,
        `Public research escalation: ${research.coverage}% coverage across ${research.distinctSources} source families (${research.reservoirMatches} stored observations, ${research.liveMatches} live/public observations).`,
      ]),
    ];
    analysis.aiReasoningPacket = {
      ...analysis.aiReasoningPacket,
      research: {
        reservoirMatches: research.reservoirMatches,
        liveMatches: research.liveMatches,
        distinctSources: research.distinctSources,
        sources: research.sources,
        coverage: research.coverage,
        searchedAt: research.searchedAt,
      },
      researchPolicy: "ESCALATE_PUBLIC_SOURCES_BEFORE_TERMINAL_NO_DATA_STATE",
    };

    // Never replace a real match analysis with a synthetic 0-0 or suppress the
    // result merely because one provider returned a thin sample. The research
    // ladder has already widened the evidence set. The engines expose quality,
    // conflict and risk so the user can judge the strength of the result.
    if (analysis.home.played < 4 || analysis.away.played < 4) {
      analysis.warnings = [
        ...new Set([
          ...analysis.warnings,
          `Research-expanded team sample remains ${analysis.home.played} home-team observations / ${analysis.away.played} away-team observations; result is marked WATCH by downstream market qualification rather than suppressed.`,
        ]),
      ];
      analysis.aiReasoningPacket = {
        ...analysis.aiReasoningPacket,
        researchState: "CONTINUE_PUBLIC_RESEARCH",
        predictionSuppressed: false,
      };
    }

    return analysis;
  });
