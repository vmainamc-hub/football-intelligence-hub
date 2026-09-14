import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Database, ShieldCheck, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { loadFreeFixtures, type AuthoritativeMatchAnalysis, type MatchRow } from "@/lib/gfi/intelligence";
import { analyzeFreeMatch, type ServerMatchAnalysis } from "@/lib/gfi/match-analysis";
import { buildMainstreamMarketMap, type MarketSignal } from "@/lib/gfi/market-map";
import { saveAuthoritativePrediction } from "@/lib/gfi/workbench";

export const Route = createFileRoute("/match/$matchId")({ component: MatchIntelligence });
type Fixture = MatchRow & { league: string; code: string; season: string };

function decodeFixture(value: string) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed && typeof parsed === "object" && parsed.h && parsed.a && parsed.d) return parsed as { h: string; a: string; d: string; t?: string; c?: string; s?: string; i?: string };
  } catch {
    // Backward compatibility for old URLs.
  }
  const [h = "", a = "", d = ""] = decodeURIComponent(value).split("__");
  return { h, a, d, t: "", c: "", s: "", i: "" };
}

function MatchIntelligence() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const parsed = decodeFixture(matchId);
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["free-fixtures", "match-intelligence"], queryFn: loadFreeFixtures, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 });
  const fixture = useMemo(() => {
    return (query.data ?? []).flatMap(g => g.matches.map(m => ({ ...m, league: g.league, code: g.code, season: g.season }))).find(m => m.home === parsed.h && m.away === parsed.a && m.date === parsed.d && (!parsed.c || m.code === parsed.c) && (!parsed.i || m.sourceId === parsed.i)) as Fixture | undefined;
  }, [query.data, parsed.h, parsed.a, parsed.d, parsed.c, parsed.i]);
  const analysisQuery = useQuery({
    queryKey: ["authoritative-match", fixture?.code, fixture?.season, fixture?.home, fixture?.away, fixture?.date, fixture?.time, fixture?.source, fixture?.sourceId],
    queryFn: () => analyzeFreeMatch({ data: { code: fixture!.code, fixture: fixture! } }),
    enabled: !!fixture,
    staleTime: 10 * 60_000,
  });
  const result = analysisQuery.data as ServerMatchAnalysis | undefined;

  if (query.isLoading) return <State title="Calculating" text="Loading the selected fixture from the current free-data registry…"/>;
  if (!fixture || !result) return <State title="Match unavailable" text={analysisQuery.error instanceof Error ? analysisQuery.error.message : "The selected fixture is not available in the current registry."} back/>;

  const marketMap = buildMainstreamMarketMap(result);
  const primary = marketMap[0];
  const save = () => { saveAuthoritativePrediction(result, fixture); setSaved(true); };

  return <div className="min-h-screen">
    <header className="border-b border-border bg-background/95 px-5 py-5 lg:px-10"><div className="mx-auto max-w-6xl"><button onClick={() => navigate({ to: "/" })} className="label-xs inline-flex items-center gap-2 text-muted-foreground"><ArrowLeft className="size-3"/> Back</button><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="label-xs text-primary">{fixture.league} · {fixture.code} · {fixture.source ?? "free feed"}</div><h1 className="mt-1 text-3xl font-semibold">{fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}</h1><p className="mt-1 text-xs text-muted-foreground">{fixture.date}{fixture.time ? ` · ${fixture.time}` : ""} · {result.analysisVersion}</p></div><button onClick={save} className="button-primary inline-flex items-center gap-2"><Database className="size-4"/>{saved ? "Saved" : "Save prediction"}</button></div></div></header>
    <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10">
      <section className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]"><div className="panel border-primary/30 p-6"><div className="flex items-center justify-between gap-3"><div className="label-xs text-primary">PRIMARY MATCH CALL</div><span className="rounded-full border border-primary/30 px-3 py-1 text-[10px] uppercase tracking-wider text-primary">Always available</span></div><div className="mt-2 text-3xl font-semibold">{primary.selection}</div><div className="mt-2 text-sm text-muted-foreground">{Math.round(primary.probability * 100)}% model probability · {primary.confidence}% intelligence confidence</div><p className="mt-4 text-xs text-muted-foreground">{primary.rationale} This is the strongest mainstream 1X2 direction even when it does not qualify as a strong edge.</p></div><div className="panel p-6"><div className="label-xs">SCENARIO</div><div className="mt-2 text-2xl font-semibold">{result.predictedScore.replace("-", " : ")}</div><p className="mt-2 text-xs text-muted-foreground">Most likely scoreline from the goal model. Scenario, not certainty.</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4"/> {result.robustness.label} · Risk {result.risk}</div></div></section>
      <section className="mt-6"><div className="flex items-end justify-between"><div><div className="label-xs text-primary">MARKET INTELLIGENCE</div><h2 className="mt-1 text-xl font-semibold">One match. Multiple mainstream angles.</h2></div><span className="text-xs text-muted-foreground">{marketMap.length} markets</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{marketMap.map((market) => <MarketCard key={market.market} market={market}/>)}</div></section>
      <section className="mt-6"><div className="flex items-end justify-between"><div><div className="label-xs text-primary">MODEL PREDICTIONS</div><h2 className="mt-1 text-xl font-semibold">Engine-qualified selections</h2></div><span className="text-xs text-muted-foreground">{result.predictions.length} qualified</span></div>{result.predictions.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{result.predictions.map(p => <PredictionCard key={p.market} prediction={p}/>)}</div> : <div className="mt-3 panel border-dashed p-5 text-sm text-muted-foreground">No selection crossed the stronger-action threshold. The mainstream board above still gives the best available baseline across major markets.</div>}</section>
      <section className="mt-6 grid gap-3 sm:grid-cols-3"><Stat label={result.home.team} value={`${Math.round(result.probabilities.home * 100)}%`}/><Stat label="Draw" value={`${Math.round(result.probabilities.draw * 100)}%`}/><Stat label={result.away.team} value={`${Math.round(result.probabilities.away * 100)}%`}/></section>
      <section className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="rounded border border-border px-3 py-2">Confidence {result.confidence}%</span><span className="rounded border border-border px-3 py-2">Quality {result.quality}</span><span className="rounded border border-border px-3 py-2">Robustness {result.robustness.label}</span><span className="rounded border border-border px-3 py-2">Risk {result.risk}</span></section>
      <section className="panel mt-6 p-5"><div className="flex items-center gap-2"><Database className="size-4 text-primary"/><div className="label-xs text-primary">BACKEND LINEAGE</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Line label="Fixture identity" value={result.pipeline.fixtureId}/><Line label="Source" value={result.pipeline.source}/><Line label="Historical rows" value={`${result.pipeline.historicalRowsLoaded}`}/><Line label="Home sample" value={`${result.pipeline.homeSample}`}/><Line label="Away sample" value={`${result.pipeline.awaySample}`}/><Line label="H2H sample" value={`${result.pipeline.h2hSample}`}/><Line label="Home matches matched" value={`${result.pipeline.homeRowsMatched}`}/><Line label="Away matches matched" value={`${result.pipeline.awayRowsMatched}`}/></div></section>
      <section className="panel mt-6 p-5"><div className="label-xs text-primary">AUTHORITATIVE ENGINE TRACE</div><div className="mt-4 grid gap-2 sm:grid-cols-3">{result.engines.map(engine => <div key={engine.id} className="rounded border border-border px-3 py-3"><div className="text-sm font-semibold">{engine.name}</div><div className="mt-1 text-xs text-muted-foreground">{engine.signal} · quality {engine.quality} · {engine.version}</div></div>)}</div></section>
      <section className="mt-6 rounded-lg border border-border bg-muted/20 p-4"><div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary"/> Prediction governance</div><p className="mt-1 text-xs leading-5 text-muted-foreground">The primary call is always populated, but it is not mislabeled as a strong edge. Stronger selections remain separately qualified by the authoritative engine.</p></section>
    </main>
  </div>;
}

function MarketCard({ market }: { market: MarketSignal }) { return <div className={`panel p-5 ${market.tier === "PRIMARY" ? "border-primary/30" : ""}`}><div className="flex items-center justify-between gap-3"><div className="label-xs">{market.market}</div><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{market.tier}</span></div><div className="mt-2 text-lg font-semibold">{market.selection}</div><div className="mt-3 flex items-baseline justify-between"><span className="text-2xl font-semibold">{Math.round(market.probability * 100)}%</span><span className="text-xs text-muted-foreground">model probability</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{market.rationale}</p></div>; }
function PredictionCard({ prediction }: { prediction: AuthoritativeMatchAnalysis["predictions"][number] }) { return <div className="panel p-5"><div className="label-xs">{prediction.market}</div><div className="mt-2 text-xl font-semibold">{prediction.label}</div><div className="mt-3 flex items-baseline justify-between"><span className="text-2xl font-semibold">{Math.round(prediction.probability * 100)}%</span><span className="text-xs text-muted-foreground">qualified signal</span></div></div>; }
function Line({ label, value }: { label: string; value: string }) { return <div className="rounded border border-border bg-card p-3"><div className="label-xs">{label}</div><div className="mt-1 break-all text-xs font-medium">{value}</div></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="panel p-4"><div className="label-xs">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
function State({ title, text, back }: { title: string; text: string; back?: boolean }) { return <div className="grid min-h-screen place-items-center p-8"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p>{back && <Link to="/" className="button-primary mt-6 inline-flex">Return to search</Link>}</div></div>; }
