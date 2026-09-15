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
      researchFixture({ data: { query: `${data.fixture.home} vs ${data.fixture.away}` } }).catch(
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
      sourceUrl: "reservoir-plus-live-research",
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
        `Research coverage ${research.coverage}% across ${research.distinctSources} source families.`,
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
    };

    // Never turn a thin-data state into a synthetic 0-0 / Under 3.5 answer.
    // The scoring engine uses mathematical floors when observations are absent;
    // those floors are useful internally but are not evidence and must not be
    // presented as a forecast.
    if (
      analysis.decision === "INSUFFICIENT INTELLIGENCE" ||
      analysis.home.played < 4 ||
      analysis.away.played < 4
    ) {
      analysis.predictedScore = "—";
      analysis.finalPrediction = "Insufficient intelligence";
      analysis.predictions = [];
      analysis.warnings = [
        ...new Set([
          ...analysis.warnings,
          `Prediction suppressed because usable team history is ${analysis.home.played} home-team observations / ${analysis.away.played} away-team observations.`,
        ]),
      ];
      analysis.aiReasoningPacket = {
        ...analysis.aiReasoningPacket,
        predictionSuppressed: true,
        suppressionReason: "LOW_TEAM_SAMPLE",
      };
    }

    return analysis;
  });
