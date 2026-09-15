import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";
import { researchFixture } from "./research-orchestrator";
import { loadLivingEvidence } from "./living-evidence";
import { requestFixtureMining } from "./on-demand-evidence";
import type { FreeLeague } from "./intelligence";

export type { AnalysisPipelineTrace, ServerMatchAnalysis } from "./server-pipeline";
function mergeMatches(rows: MatchRow[]) { const seen = new Set<string>(); return rows.filter(row => { const key=`${row.date}|${row.home.toLowerCase()}|${row.away.toLowerCase()}|${row.time??""}|${row.hg??""}|${row.ag??""}|${row.source??""}`; if(seen.has(key))return false; seen.add(key); return true; }); }
function historicalOnly(rows: MatchRow[], fixture: MatchRow) { const cutoff=fixture.date.slice(0,10); return rows.filter(row=>row.hg!==undefined&&row.ag!==undefined&&row.date.slice(0,10)<cutoff); }
function livingGroup(fixture: MatchRow,living:Awaited<ReturnType<typeof loadLivingEvidence>>):FreeLeague|undefined { const rows=mergeMatches(historicalOnly([...living.matchRows,...living.homeTeamRows,...living.awayTeamRows,...living.h2hRows],fixture)); if(!rows.length)return undefined; return{league:fixture.league??"Worldwide Football",code:`LIVING_${living.status}`,season:"living-reservoir",matches:rows,sourceUrl:"supabase-living-intelligence-cells",fetchedAt:living.lastMinedAt??new Date().toISOString()}; }

export const analyzeFreeMatch=createServerFn({method:"POST"}).validator((input:{code:string;fixture:MatchRow})=>input).handler(async({data}):Promise<ServerMatchAnalysis>=>{
  let [groups,research,living]=await Promise.all([
    loadFreeFixtures(),
    researchFixture({data:{query:`${data.fixture.home} vs ${data.fixture.away} ${data.fixture.date}`}}).catch(()=>({matches:[],reservoirMatches:0,liveMatches:0,distinctSources:0,sources:[],coverage:0,query:"",searchedAt:new Date().toISOString(),web:{configured:false,attempted:false,queries:[],hits:0,relevantHits:0,fetchedPages:0,extractedRows:[],sources:[],sourceFamilies:[],facts:[],errors:[]}})),
    loadLivingEvidence(data.fixture).catch(()=>({matchRows:[],h2hRows:[],homeTeamRows:[],awayTeamRows:[],sourceFamilies:[],sourceFamilyCounts:{},matchCompleteness:0,homeCompleteness:0,awayCompleteness:0,evidenceCount:0,sourceCount:0,status:"NO_CELL" as const})),
  ]);
  const directLivingRows=living.matchRows.length+living.homeTeamRows.length+living.awayTeamRows.length+living.h2hRows.length;
  if(directLivingRows===0){ await requestFixtureMining(data.fixture); living=await loadLivingEvidence(data.fixture).catch(()=>living); }
  const researchRows=mergeMatches(research.matches);
  const targetGroup=groups.find(item=>item.code===data.code||item.league===data.fixture.league);
  const researchGroup:FreeLeague={league:data.fixture.league??targetGroup?.league??"Worldwide Football",code:`RESEARCH_${data.code||"GLOBAL"}`,season:"research",matches:researchRows,sourceUrl:"authoritative-public-web-research",fetchedAt:research.searchedAt};
  const livingEvidenceGroup=livingGroup(data.fixture,living);
  const expandedGroups=[...groups,...(livingEvidenceGroup?[livingEvidenceGroup]:[]),researchGroup];
  const analysis=analyzeLoadedFixture(data.fixture,targetGroup?.code??livingEvidenceGroup?.code??researchGroup.code,expandedGroups);
  analysis.pipeline.historicalRowsLoaded=Math.max(analysis.pipeline.historicalRowsLoaded,research.reservoirMatches+living.matchRows.length+living.homeTeamRows.length+living.awayTeamRows.length+(research.web?.extractedRows.length??0));
  analysis.pipeline.competitionsLoaded=expandedGroups.length;
  const web=research.web;
  analysis.warnings=[...new Set([...analysis.warnings,`Public evidence ladder: ${research.coverage}% coverage across ${research.distinctSources} source families (${research.reservoirMatches} stored observations, ${research.liveMatches} structured/web observations).`,`Web evidence acquisition: ${web?.attempted?"ATTEMPTED":"NOT ACTIVATED"}; ${web?.hits??0} search hits, ${web?.relevantHits??0} relevant, ${web?.fetchedPages??0} pages inspected, ${web?.facts.length??0} grounded facts, ${web?.extractedRows.length??0} dated score rows extracted.`,...(web?.errors?.length?[`Web research warnings: ${web.errors.slice(0,3).join("; ")}`]:[]),`Living evidence cell: ${living.evidenceCount} accumulated observations, ${living.sourceCount} source records, ${living.sourceFamilies.length} distinct source families, ${living.matchCompleteness}% match completeness.`])];
  analysis.aiReasoningPacket={...analysis.aiReasoningPacket,research:{reservoirMatches:research.reservoirMatches,liveMatches:research.liveMatches,distinctSources:research.distinctSources,sources:research.sources,coverage:research.coverage,searchedAt:research.searchedAt,webSearchAttempted:web?.attempted??false,webSearchConfigured:web?.configured??false,webQueries:web?.queries??[],webHits:web?.hits??0,webRelevantHits:web?.relevantHits??0,webFetchedPages:web?.fetchedPages??0,webSources:web?.sources??[],webSourceFamilies:web?.sourceFamilies??[],webFacts:web?.facts??[],webExtractedRows:web?.extractedRows.length??0},livingEvidence:{status:living.status,evidenceCount:living.evidenceCount,sourceCount:living.sourceCount,sourceFamilies:living.sourceFamilies,sourceFamilyCounts:living.sourceFamilyCounts,matchCompleteness:living.matchCompleteness,homeCompleteness:living.homeCompleteness,awayCompleteness:living.awayCompleteness,lastMinedAt:living.lastMinedAt,reusableHistoricalRows:living.matchRows.length+living.homeTeamRows.length+living.awayTeamRows.length,reusableH2HRows:living.h2hRows.length},researchPolicy:"AUTHORITATIVE_EVIDENCE_LADDER_WITH_AUTOMATIC_WEB_CIRCUIT_BREAKER",onDemandMiningAttempted:directLivingRows===0};
  if(analysis.home.played<4||analysis.away.played<4){analysis.warnings=[...new Set([...analysis.warnings,`Research-expanded team sample remains ${analysis.home.played} home-team observations / ${analysis.away.played} away-team observations; result remains mathematically available but downstream market qualification will not authorize a strong action.`])];analysis.aiReasoningPacket={...analysis.aiReasoningPacket,researchState:"CONTINUE_PUBLIC_RESEARCH",predictionSuppressed:false};}
  return analysis;
});
