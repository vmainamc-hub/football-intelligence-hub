import type { MatchRow } from "./intelligence";
import type { EngineOutput, AuthoritativeMatchAnalysis } from "./authoritative";
import { analyzeAuthoritatively } from "./authoritative";
import { runAdvancedEngines } from "./advanced-engines";
import { simulationEngineOutput } from "./simulation-engine";

export const ACTIVE_ENGINE_FAMILIES = [
  "FORM","GOALS","VENUE","TOTALS","BTTS","CONSISTENCY","H2H","DATA_QUALITY",
  "ELO","BAYES_STRENGTH","DIXON_COLES","NEG_BINOMIAL","MOMENTUM","LOGISTIC_REGRESSION","CONSENSUS","SIMULATION",
] as const;
const avg=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const poisson=(lambda:number,k:number)=>{let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;};
const oneX2=(lh:number,la:number)=>{let h=0,d=0,a=0;for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const p=poisson(lh,i)*poisson(la,j);if(i>j)h+=p;else if(i===j)d+=p;else a+=p;}const z=h+d+a||1;return{home:h/z,draw:d/z,away:a/z};};

function consensus(core:EngineOutput[],advanced:EngineOutput[]):EngineOutput{
  const u=[...core,...advanced].filter(e=>e.probabilities);
  const weight=(e:EngineOutput)=>clamp(e.quality/100,.15,1.25);
  const total=u.reduce((s,e)=>s+weight(e),0)||1;
  const H=u.reduce((s,e)=>s+e.probabilities!.home*weight(e),0)/total;
  const D=u.reduce((s,e)=>s+e.probabilities!.draw*weight(e),0)/total;
  const A=u.reduce((s,e)=>s+e.probabilities!.away*weight(e),0)/total;
  const dis=avg(u.map(e=>0.5*(Math.abs(e.probabilities!.home-H)+Math.abs(e.probabilities!.draw-D)+Math.abs(e.probabilities!.away-A))));
  return {id:"CONSENSUS",name:"Evidence-weighted Consensus",version:"consensus-v7",signal:dis<.12?"SUPPORT":"CONTRADICTION",confidence:Math.round(clamp(1-dis)*100),quality:Math.round(clamp(avg(u.map(e=>e.quality))/100)*100),probabilities:{home:H,draw:D,away:A},values:{agreement:1-dis,conflict:dis,models:u.length},evidence:[`${u.length} probability-producing model families contributed.`,`Weights are based on model quality only; outcome probability is not used as confidence.`,`Cross-model probability dispersion: ${(dis*100).toFixed(1)}%.`],limitations:u.length<5?["Fewer than five probability-producing engines are available."]:[]};
}

function globalPrior(rows:MatchRow[]){
  const z=rows.filter(x=>x.hg!==undefined&&x.ag!==undefined);
  if(!z.length)return {home:0.44,draw:0.27,away:0.29,lh:1.35,la:1.10,total:2.45,n:0};
  let h=0,d=0,a=0;for(const x of z){if(x.hg!>x.ag!)h++;else if(x.hg===x.ag)d++;else a++;}
  const n=z.length||1;
  return {home:h/n,draw:d/n,away:a/n,lh:avg(z.map(x=>x.hg!))||1.35,la:avg(z.map(x=>x.ag!))||1.10,total:avg(z.map(x=>x.hg!+x.ag!))||2.45,n:z.length};
}
function sparseRepair(base:AuthoritativeMatchAnalysis, rows:MatchRow[]):AuthoritativeMatchAnalysis{
  const teamSample=base.home.played+base.away.played;
  if(teamSample>0)return base;
  const g=globalPrior(rows), p=oneX2(g.lh,g.la);
  const engines=base.engines.map(e=>{
    if(e.id==="FORM")return {...e,version:"form-sparse-prior-v1",probabilities:p,quality:35,confidence:35,values:{...e.values,priorMatches:g.n}};
    if(e.id==="GOALS")return {...e,version:"goals-global-prior-v1",probabilities:p,values:{...e.values,lambdaHome:g.lh,lambdaAway:g.la,expectedGoals:g.total},quality:45,confidence:35};
    if(e.id==="TOTALS"){
      const over=(line:number)=>1-[...Array(Math.floor(line)+1)].reduce((s,_,k)=>s+poisson(g.total,k),0);
      return {...e,version:"totals-global-prior-v1",values:{...e.values,expectedGoals:g.total,"over0.5":over(.5),"over1.5":over(1.5),"over2.5":over(2.5),"over3.5":over(3.5)},quality:45,confidence:35};
    }
    if(e.id==="BTTS"){
      const yes=(1-Math.exp(-g.lh))*(1-Math.exp(-g.la));
      return {...e,version:"btts-global-prior-v1",values:{...e.values,yes,no:1-yes},quality:45,confidence:35};
    }
    if(e.id==="VENUE")return {...e,version:"venue-global-prior-v1",probabilities:p,values:{...e.values,homeVenueWinRate:g.home},quality:35,confidence:35};
    if(e.probabilities)return {...e,version:`${e.id.toLowerCase()}-global-prior-v1`,probabilities:p,quality:35,confidence:35};
    if(e.id==="DATA_QUALITY")return {...e,quality:25,confidence:25,values:{...e.values,completedMatches:0,globalPriorMatches:g.n}};
    return e;
  });
  return {...base,engines,probabilities:p};
}

export function analyzeActiveAuthoritatively(f:MatchRow,rows:MatchRow[]):AuthoritativeMatchAnalysis{
  const base=sparseRepair(analyzeAuthoritatively(f,rows),rows);
  const advanced=runAdvancedEngines(f,rows) as unknown as EngineOutput[];
  const core=base.engines.filter(e=>e.id!=="CONSENSUS");
  const initial=[...core,...advanced];
  const con=consensus(core,advanced);
  const sim=simulationEngineOutput({...base,engines:initial,consensus:{home:con.probabilities!.home,draw:con.probabilities!.draw,away:con.probabilities!.away,agreement:Number(con.values.agreement),conflict:Number(con.values.conflict),leader:"none"}} as AuthoritativeMatchAnalysis,10000);
  const engines=[...initial,con,sim.engine];
  const p=con.probabilities!;
  const teamSample=base.home.played+base.away.played;
  const teamCoverage=clamp(teamSample/30);
  const globalCoverage=clamp(rows.filter(x=>x.hg!==undefined&&x.ag!==undefined).length/300);
  const engineCoverage=clamp(initial.filter(e=>e.probabilities).length/14);
  const agreement=Number(con.values.agreement);
  const quality=Math.round(clamp(.20+.60*teamCoverage+.12*globalCoverage+.08*engineCoverage)*100);
  const confidence=Math.round(clamp(.20+.45*teamCoverage+.15*globalCoverage+.20*agreement)*100);
  const top=Math.max(p.home,p.draw,p.away), spread=top-Math.min(p.home,p.draw,p.away), conflict=Number(con.values.conflict);
  let decision:AuthoritativeMatchAnalysis["decision"]="NO STRONG EDGE";
  if(conflict>=.24&&spread<.18)decision="HIGH MODEL CONFLICT";
  else if(teamSample>=8&&top>=.52&&conflict<.20)decision=p.home===top?"HOME EDGE":p.away===top?"AWAY EDGE":"DRAW LEAN";
  else if(teamSample>=8&&p.draw===top&&top>=.40&&conflict<.20)decision="DRAW LEAN";
  const risk:AuthoritativeMatchAnalysis["risk"]=confidence<40?"VERY HIGH":confidence<55?"HIGH":confidence<70?"MODERATE":"LOW";
  const robustnessScore=Math.round(clamp(quality/100*.55+agreement*.45)*100);
  const robustness={score:robustnessScore,label:(robustnessScore>=78?"ROBUST":robustnessScore>=62?"STABLE":robustnessScore>=45?"FRAGILE":"UNSTABLE") as AuthoritativeMatchAnalysis["robustness"]["label"]};
  const ledger:AuthoritativeMatchAnalysis["evidenceLedger"]=base.evidenceLedger.concat(advanced.flatMap(e=>e.evidence.map((statement,i)=>({id:`${e.id}-${i}`,source:"DERIVED_MODEL" as const,statement,quality:e.quality}))));
  const scoreGoal=engines.find(e=>e.id==="GOALS");
  const gp=globalPrior(rows);
  const lh=Number(scoreGoal?.values.lambdaHome??gp.lh),la=Number(scoreGoal?.values.lambdaAway??gp.la);
  const predictedScore=(()=>{let best="1-1",bp=0;for(let h=0;h<=8;h++)for(let a=0;a<=8;a++){const q=poisson(lh,h)*poisson(la,a);if(q>bp){bp=q;best=`${h}-${a}`;}}return best;})();
  const totals=engines.find(e=>e.id==="TOTALS")?.values??{};
  const bttsE=engines.find(e=>e.id==="BTTS")?.values??{};
  const candidates:AuthoritativeMatchAnalysis["predictions"]=[
    {market:"HOME",label:base.home.team,probability:p.home,strength:p.home-1/3},
    {market:"DRAW",label:"Draw",probability:p.draw,strength:p.draw-1/3},
    {market:"AWAY",label:base.away.team,probability:p.away,strength:p.away-1/3},
    {market:"OVER 1.5",label:"Over 1.5",probability:Number(totals["over1.5"]??0),strength:Number(totals["over1.5"]??0)-.5},
    {market:"OVER 2.5",label:"Over 2.5",probability:Number(totals["over2.5"]??0),strength:Number(totals["over2.5"]??0)-.5},
    {market:"OVER 3.5",label:"Over 3.5",probability:Number(totals["over3.5"]??0),strength:Number(totals["over3.5"]??0)-.5},
    {market:"BTTS",label:"BTTS",probability:Number(bttsE.yes??0),strength:Number(bttsE.yes??0)-.5},
  ].filter(x=>Number.isFinite(x.probability)).sort((a,b)=>b.strength-a.strength).slice(0,5);
  const finalPrediction=decision==="HOME EDGE"?`${base.home.team} win`:decision==="AWAY EDGE"?`${base.away.team} win`:decision==="DRAW LEAN"?"Draw":(candidates[0]?.label??"No strong prediction");
  const sparseWarning=teamSample===0?`No direct historical match was matched to either team in the assembled context. Probabilities therefore use an explicit global prior (${rows.filter(x=>x.hg!==undefined&&x.ag!==undefined).length} completed rows), not a low-goal fallback.`:teamSample<8?`Only ${teamSample} direct team observations were matched; probabilities are available but epistemic confidence is reduced.`:undefined;
  const warnings=[...new Set([...base.warnings,...engines.flatMap(e=>e.limitations),sparseWarning].filter(Boolean) as string[])];
  const totalValues=Object.fromEntries(["over0.5","over1.5","over2.5","over3.5"].map(k=>[k,Number(totals[k]??0)]));
  const yes=Number(bttsE.yes??0);
  return {...base,analysisVersion:"gfi-authoritative-v7",engines,evidenceLedger:ledger,probabilities:p,totals:{...base.totals,...totalValues},btts:{yes,no:1-yes},quality,confidence,decision,verdict:decision,finalPrediction,predictedScore,predictions:candidates,warnings,consensus:{home:p.home,draw:p.draw,away:p.away,agreement,conflict,leader:top<.42?"none":p.home===top?"home":p.draw===top?"draw":"away"},robustness,risk,aiReasoningPacket:{...base.aiReasoningPacket,analysisVersion:"gfi-authoritative-v7",aiRole:"SINGLE_AUTHORITATIVE_EVIDENCE_WEIGHTED_ENGINE",confidenceDefinition:"Epistemic confidence is evidence/coverage/consensus quality; it is never equal to event probability.",teamSample,globalHistoricalRows:rows.filter(x=>x.hg!==undefined&&x.ag!==undefined).length,teamCoverage,globalCoverage,engineCoverage,quality,confidence,decision,finalPrediction,predictedScore,evidenceLedger:ledger,sparsePriorUsed:teamSample===0,activeEngineFamilies:ACTIVE_ENGINE_FAMILIES}};
}
