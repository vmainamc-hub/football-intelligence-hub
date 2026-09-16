import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { researchTeamOrFixture } from "./research-orchestrator";
import { loadLivingEvidence } from "./living-evidence";
import { requestFixtureMining } from "./on-demand-evidence";
import { deriveConsensusActionability } from "./actionability";
import { runFootballExpertPanel } from "./football-expert-panel";
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
function historicalOnly(rows: MatchRow[], fixture: MatchRow) {
  const cutoff = fixture.date.slice(0, 10);
  return rows.filter(
    (row) => row.hg !== undefined && row.ag !== undefined && row.date.slice(0, 10) < cutoff,
  );
}
function livingGroup(
  fixture: MatchRow,
  living: Awaited<ReturnType<typeof loadLivingEvidence>>,
): FreeLeague | undefined {
  const rows = mergeMatches(
    historicalOnly(
      [...living.matchRows, ...living.homeTeamRows, ...living.awayTeamRows, ...living.h2hRows],
      fixture,
    ),
  );
  if (!rows.length) return undefined;
  return {
    league: fixture.league ?? "Worldwide Football",
    code: `LIVING_${living.status}`,
    season: "living-reservoir",
    matches: rows,
    sourceUrl: "supabase-living-intelligence-cells",
    fetchedAt: living.lastMinedAt ?? new Date().toISOString(),
  };
}

export async function runMatchAnalysis(
  code: string,
  fixture: MatchRow,
  preloadedGroups?: FreeLeague[],
): Promise<ServerMatchAnalysis> {
  const groups = preloadedGroups ?? (await loadFreeFixtures());
  const [research, initialLiving] = await Promise.all([
    researchTeamOrFixture(`${fixture.home} vs ${fixture.away} ${fixture.date}`).catch((err) => {
      console.error("[runMatchAnalysis] researchTeamOrFixture failed:", err);
      return {
        matches: [],
        reservoirMatches: 0,
        liveMatches: 0,
        webMatches: 0,
        distinctSources: 0,
        sources: [],
        coverage: 0,
        query: "",
        searchedAt: new Date().toISOString(),
      };
    }),
    loadLivingEvidence(fixture).catch(() => ({
      matchRows: [],
      h2hRows: [],
      homeTeamRows: [],
      awayTeamRows: [],
      publicRows: [],
      sourceFamilies: [],
      sourceFamilyCounts: {},
      matchCompleteness: 0,
      homeCompleteness: 0,
      awayCompleteness: 0,
      evidenceCount: 0,
      sourceCount: 0,
      status: "NO_CELL" as const,
    })),
  ]);
  let living = initialLiving;

  const directLivingRows =
    living.matchRows.length +
    living.homeTeamRows.length +
    living.awayTeamRows.length +
    living.h2hRows.length;
  if (directLivingRows === 0) {
    await requestFixtureMining(fixture);
    living = await loadLivingEvidence(fixture).catch(() => living);
  }

  const researchRows = mergeMatches(research.matches);
  const targetGroup = groups.find((item) => item.code === code || item.league === fixture.league);
  const researchGroup: FreeLeague = {
    league: fixture.league ?? targetGroup?.league ?? "Worldwide Football",
    code: `RESEARCH_${code || "GLOBAL"}`,
    season: "research",
    matches: researchRows,
    sourceUrl: "reservoir-plus-live-public-research",
    fetchedAt: research.searchedAt,
  };
  const livingEvidenceGroup = livingGroup(fixture, living);
  const expandedGroups = [
    ...groups,
    ...(livingEvidenceGroup ? [livingEvidenceGroup] : []),
    researchGroup,
  ];
  const analysis = analyzeLoadedFixture(
    fixture,
    targetGroup?.code ?? livingEvidenceGroup?.code ?? researchGroup.code,
    expandedGroups,
  );
  analysis.pipeline.historicalRowsLoaded = Math.max(
    analysis.pipeline.historicalRowsLoaded,
    research.reservoirMatches +
      research.webMatches +
      living.matchRows.length +
      living.homeTeamRows.length +
      living.awayTeamRows.length,
  );
  analysis.pipeline.competitionsLoaded = expandedGroups.length;

  const actionable = deriveConsensusActionability(analysis);
  analysis.qualification = actionable;
  analysis.finalPrediction = actionable.actionableMarket?.selection ?? analysis.finalPrediction;

  const actionSelection = actionable.actionableMarket?.selection ?? "";
  if (actionable.actionableMarket?.market === "1X2") {
    if (actionSelection === `${analysis.home.team} Win`) analysis.decision = "HOME EDGE";
    else if (actionSelection === `${analysis.away.team} Win`) analysis.decision = "AWAY EDGE";
    else if (actionSelection === "Draw") analysis.decision = "DRAW LEAN";
  } else {
    analysis.decision = "NO STRONG EDGE";
  }
  analysis.verdict = analysis.decision;
  analysis.aiReasoningPacket = {
    ...analysis.aiReasoningPacket,
    decision: analysis.decision,
    finalPrediction: analysis.finalPrediction,
    qualification: actionable,
    actionablePrediction: actionable.actionableMarket,
    actionabilityPolicy:
      "Every fixture receives one best-supported actionable market when a probability surface exists. Selection is based on cross-engine support and market specificity, not lowest odds. Uncertainty remains visible in confidence/risk/evidence health.",
  };
  if (actionable.actionableMarket) {
    analysis.warnings = [
      ...new Set([...analysis.warnings, actionable.statusMessage]),
    ];
  }

  const additionalWarnings: string[] = [
    `Public evidence ladder: ${research.coverage}% live/public coverage across ${research.distinctSources} live source families (${research.reservoirMatches} stored observations, ${research.liveMatches} live/public observations, ${research.webMatches ?? 0} web observations).`,
    `Living evidence cell: ${living.evidenceCount} accumulated observations, ${living.sourceCount} source records, ${living.sourceFamilies.length} distinct source families, ${living.matchCompleteness}% match completeness.`,
  ];
  if (research.webEvidence?.attempted) {
    additionalWarnings.push(
      `Web evidence mining (Tavily): acquired ${research.webEvidence.usefulFootballResults} verified football sources, extracting ${research.webEvidence.datedScoreRows.length} dated score observations and ${research.webEvidence.structuredFacts.length} structured facts.`,
    );
  }
  analysis.warnings = [...new Set([...analysis.warnings, ...additionalWarnings])];
  if (research.webEvidence?.structuredFacts?.length) {
    research.webEvidence.structuredFacts.slice(0, 5).forEach((fact, idx) => {
      analysis.evidenceLedger.push({
        id: `TAVILY_${fact.sourceDomain}_${idx}`,
        source: "OPTIONAL_PROVIDER",
        provider: "Tavily / web",
        sourceFamily: "Tavily / web",
        provenance: fact.sourceUrl || `https://${fact.sourceDomain}`,
        statement: `Web evidence (${fact.sourceDomain}): ${fact.title}`,
        quality: fact.factType === "score" ? 75 : 60,
      });
    });
  }
  analysis.aiReasoningPacket = {
    ...analysis.aiReasoningPacket,
    research: {
      reservoirMatches: research.reservoirMatches,
      liveMatches: research.liveMatches,
      webMatches: research.webMatches ?? 0,
      distinctSources: research.distinctSources,
      sources: research.sources,
      coverage: research.coverage,
      searchedAt: research.searchedAt,
      webEvidence: research.webEvidence
        ? {
            configured: research.webEvidence.configured,
            attempted: research.webEvidence.attempted,
            searchesAttempted: research.webEvidence.searchesAttempted,
            resultsReturned: research.webEvidence.resultsReturned,
            usefulFootballResults: research.webEvidence.usefulFootballResults,
            datedScoreRowsCount: research.webEvidence.datedScoreRows.length,
            factsCount: research.webEvidence.structuredFacts.length,
            sources: research.webEvidence.sources,
          }
        : undefined,
    },
    livingEvidence: {
      status: living.status,
      evidenceCount: living.evidenceCount,
      sourceCount: living.sourceCount,
      sourceFamilies: living.sourceFamilies,
      sourceFamilyCounts: living.sourceFamilyCounts,
      matchCompleteness: living.matchCompleteness,
      homeCompleteness: living.homeCompleteness,
      awayCompleteness: living.awayCompleteness,
      lastMinedAt: living.lastMinedAt,
      reusableHistoricalRows:
        living.matchRows.length + living.homeTeamRows.length + living.awayTeamRows.length,
      reusableH2HRows: living.h2hRows.length,
    },
    researchPolicy: "ACCUMULATE_AND_REUSE_PUBLIC_EVIDENCE_BEFORE_TERMINAL_NO_DATA_STATE",
    onDemandMiningAttempted: directLivingRows === 0,
  };

  const footballExpertPanel = await runFootballExpertPanel({
    fixture,
    analysis,
    evidenceFacts: (research.webEvidence?.structuredFacts ?? []).slice(0, 20).map((fact) => ({
      title: fact.title,
      factType: fact.factType,
      sourceDomain: fact.sourceDomain,
      sourceUrl: fact.sourceUrl,
    })),
  });
  analysis.aiReasoningPacket = {
    ...analysis.aiReasoningPacket,
    footballExpertPanel,
    aiRole: "QUANTITATIVE_AUTHORITY_WITH_AI_FOOTBALL_EXPERT_COUNCIL",
  };
  if (footballExpertPanel.status === "ACTIVE") {
    const chair = footballExpertPanel.chair;
    if (chair.decision !== "SUPPORT") {
      analysis.warnings = [
        ...new Set([
          ...analysis.warnings,
          `Football Expert Council: ${chair.decision} / ${chair.severity}. ${chair.revalidationReason || chair.summary}`,
        ]),
      ];
    }
  }
  return analysis;
}

export const analyzeFreeMatch = createServerFn({ method: "POST" })
  .validator((input: { code: string; fixture: MatchRow }) => input)
  .handler(async ({ data }): Promise<ServerMatchAnalysis> => {
    return runMatchAnalysis(data.code, data.fixture);
  });
