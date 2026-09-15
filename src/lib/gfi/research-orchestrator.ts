import { createServerFn } from "@tanstack/react-start";
import { reservoirHistoricalContext, type ReservoirMatch } from "./data-reservoir";
import { searchUniversalFixtures } from "./universal-sources";
import { fetchEspnFixtures } from "./espn-sources";
import { acquireWebEvidence, type WebEvidenceResult } from "./web-evidence-acquisition";
import type { MatchRow } from "./intelligence";

export type ResearchResult={query:string;matches:MatchRow[];reservoirMatches:number;liveMatches:number;distinctSources:number;sources:string[];coverage:number;searchedAt:string;web?:WebEvidenceResult};
const identity=(r:MatchRow)=>`${r.date}|${r.home.toLowerCase()}|${r.away.toLowerCase()}|${r.time??""}|${r.hg??""}|${r.ag??""}`;
const toMatch=(r:ReservoirMatch):MatchRow=>({date:r.date,time:r.time,home:r.home,away:r.away,hg:r.hg,ag:r.ag,result:r.result,league:r.league,code:r.code,source:r.source,sourceId:r.reservoirId});
const addDays=(v:string,n:number)=>{const d=new Date(`${v}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dateFromQuery=(q:string)=>q.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
const stripDate=(q:string)=>q.replace(/\b20\d{2}-\d{2}-\d{2}\b/g," ").replace(/\s+/g," ").trim();
const parseTeams=(q:string)=>{const clean=stripDate(q),m=clean.match(/^(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+)$/i);return m?{home:m[1].trim(),away:m[2].trim()}:{home:clean,away:""}};
const norm=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const emptyWeb=():WebEvidenceResult=>({configured:false,attempted:false,queries:[],hits:0,relevantHits:0,fetchedPages:0,extractedRows:[],sources:[],sourceFamilies:[],facts:[],errors:[]});

export const researchFixture=createServerFn({method:"GET"}).validator((input:{query:string})=>input).handler(async({data}):Promise<ResearchResult>=>{
  const query=data.query.trim(),searchedAt=new Date().toISOString();
  if(!query)return{query,matches:[],reservoirMatches:0,liveMatches:0,distinctSources:0,sources:[],coverage:0,searchedAt,web:emptyWeb()};
  const {home,away}=parseTeams(query),fixtureDate=dateFromQuery(query),today=new Date().toISOString().slice(0,10),from=fixtureDate?addDays(fixtureDate,-3):addDays(today,-3),to=fixtureDate?addDays(fixtureDate,3):addDays(today,3);
  const [stored,live,espn]=await Promise.all([
    reservoirHistoricalContext(home,away,500).catch(()=>[] as ReservoirMatch[]),
    searchUniversalFixtures({data:{query:stripDate(query)}}).catch(()=>[] as MatchRow[]),
    fetchEspnFixtures(from,to).catch(()=>[] as MatchRow[]),
  ]);
  const merged=new Map<string,MatchRow>();
  for(const r of stored){const m=toMatch(r);merged.set(identity(m),m)}
  for(const r of live)merged.set(identity(r),r);
  const hk=norm(home),ak=norm(away);let matchedEspn=0;
  for(const r of espn){const rh=norm(r.home),ra=norm(r.away),exact=hk&&ak&&((rh.includes(hk)||hk.includes(rh))&&(ra.includes(ak)||ak.includes(ra))),reverse=hk&&ak&&((rh.includes(ak)||ak.includes(rh))&&(ra.includes(hk)||hk.includes(ra)));if(exact||reverse){matchedEspn++;merged.set(identity(r),r)}}
  const initial=[...merged.values()].sort((a,b)=>`${a.date}|${a.time??""}`.localeCompare(`${b.date}|${b.time??""}`));
  const initialHistory=initial.filter(r=>r.hg!==undefined&&r.ag!==undefined).length;
  // Web search is a sparse-data circuit breaker, not a permanent first resort.
  // It activates automatically when the local/structured evidence ladder is weak.
  const web=(!fixtureDate || initialHistory<12 || initial.length<6) && home && away
    ? await acquireWebEvidence(home,away,fixtureDate??today).catch(()=>emptyWeb())
    : emptyWeb();
  for(const r of web.extractedRows)merged.set(identity(r),r);
  const matches=[...merged.values()].sort((a,b)=>`${a.date}|${a.time??""}`.localeCompare(`${b.date}|${b.time??""}`));
  const sources=[...new Set([...matches.map(r=>r.source??"unknown"),...web.sourceFamilies.map(s=>`web:${s}`)])];
  const history=matches.filter(r=>r.hg!==undefined&&r.ag!==undefined).length;
  const fixtureEvidence=matches.some(r=>fixtureDate?r.date===fixtureDate:r.hg===undefined||r.ag===undefined);
  const evidenceBonus=Math.min(20,web.relevantHits*2)+(web.sourceFamilies.length>=2?8:0)+(web.facts.length?7:0);
  const coverage=Math.min(100,Math.round(Math.min(50,history*2)+(fixtureEvidence?20:0)+(sources.length>=2?20:0)+(history>10?10:0)+evidenceBonus));
  return{query,matches,reservoirMatches:stored.length,liveMatches:live.length+matchedEspn+web.extractedRows.length,distinctSources:sources.length,sources,coverage,searchedAt,web};
});
export async function researchTeamOrFixture(query:string){return researchFixture({data:{query}})}
