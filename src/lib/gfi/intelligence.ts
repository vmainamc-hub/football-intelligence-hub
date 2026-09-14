export type MatchRow = {
  date: string;
  home: string;
  away: string;
  hg?: number;
  ag?: number;
  result?: "H" | "D" | "A";
  league?: string;
  code?: string;
};

export type TeamSnapshot = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  homeOrAwayRate: number;
  recent: string[];
};

export type IntelligenceResult = {
  home: TeamSnapshot;
  away: TeamSnapshot;
  probabilities: { home: number; draw: number; away: number };
  totals: Record<string, number>;
  btts: { yes: number; no: number };
  confidence: number;
  quality: number;
  verdict: string;
  warnings: string[];
  evidence: string[];
};

export const LEAGUES: Record<string, string> = {
  E0: "Premier League", E1: "Championship", D1: "Bundesliga", D2: "2. Bundesliga",
  I1: "Serie A", I2: "Serie B", SP1: "La Liga", SP2: "La Liga 2",
  F1: "Ligue 1", F2: "Ligue 2", N1: "Eredivisie", P1: "Primeira Liga",
};

function csvUrl(code: string) { return `https://www.football-data.co.uk/mmz4281/2627/${code}.csv`; }

function parseCsv(text: string): MatchRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, ""));
  const index = (name: string) => headers.findIndex(h => h === name);
  const di=index("Date"), hi=index("HomeTeam"), ai=index("AwayTeam"), hgi=index("FTHG"), agi=index("FTAG"), ri=index("FTR");
  return lines.slice(1).map(line => {
    const cells=line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.slice(0,headers.length)??[];
    const clean=(v:string)=>v.replace(/^"|"$/g,"").replace(/""/g,'"').trim();
    const hg=Number(clean(cells[hgi]??"")), ag=Number(clean(cells[agi]??"")), r=clean(cells[ri]??"");
    return { date:clean(cells[di]??""), home:clean(cells[hi]??""), away:clean(cells[ai]??""), hg:Number.isFinite(hg)?hg:undefined, ag:Number.isFinite(ag)?ag:undefined, result:r==="H"||r==="D"||r==="A"?r:undefined } satisfies MatchRow;
  }).filter(m=>m.home&&m.away);
}

export async function loadFreeFixtures(): Promise<{ league:string; code:string; matches:MatchRow[] }[]> {
  const settled=await Promise.allSettled(Object.entries(LEAGUES).map(async ([code,league])=>({code,league,matches:parseCsv(await (await fetch(csvUrl(code),{cache:"no-store"})).text())})));
  return settled.flatMap(x=>x.status==="fulfilled"?[x.value]:[]);
}

export function findFixtures(all:{league:string;code:string;matches:MatchRow[]}[],query:string){
  const q=query.trim().toLowerCase(); if(!q)return [];
  return all.flatMap(g=>g.matches.filter(m=>`${m.home} ${m.away}`.toLowerCase().includes(q)).slice(-12).map(m=>({...m,league:g.league,code:g.code}))).slice(0,24);
}

export { analyzeAuthoritatively } from "./authoritative";
import { analyzeAuthoritatively } from "./authoritative";
export type { AuthoritativeMatchAnalysis, EngineOutput, EngineId, EvidenceItem } from "./authoritative";

export function analyzeMatch(fixture: MatchRow, allMatches: MatchRow[]): IntelligenceResult {
  return analyzeAuthoritatively(fixture, allMatches);
}

export function leagueNames(){ return LEAGUES; }
