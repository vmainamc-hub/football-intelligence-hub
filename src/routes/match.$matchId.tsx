import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { analyzeAuthoritatively, loadFreeFixtures, type AuthoritativeMatchAnalysis, type MatchRow } from "@/lib/gfi/intelligence";
import { saveAuthoritativePrediction } from "@/lib/gfi/workbench";

export const Route = createFileRoute("/match/$matchId")({ component: MatchIntelligence });
type Fixture = MatchRow & { league: string; code: string };

function MatchIntelligence() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["free-fixtures", "match-intelligence"], queryFn: loadFreeFixtures, staleTime: 30 * 60_000 });
  const fixture = useMemo(() => {
    const [home, away, date] = decodeURIComponent(matchId).split("__");
    return (query.data ?? []).flatMap(g => g.matches.map(m => ({ ...m, league: g.league, code: g.code }))).find(m => m.home === home && m.away === away && m.date === date) as Fixture | undefined;
  }, [query.data, matchId]);
  const allMatches = useMemo(() => query.data?.find(g => g.code === fixture?.code)?.matches ?? [], [query.data, fixture?.code]);
  const result = useMemo(() => fixture ? analyzeAuthoritatively(fixture, allMatches) : null, [fixture, allMatches]);

  if (query.isLoading) return <State title="Loading" text="Preparing match intelligence…"/>;
  if (!fixture || !result) return <State title="Match not found" text="This fixture is not available in the current free feed." back/>;

  const save = () => { saveAuthoritativePrediction(result, fixture); setSaved(true); };
  return <div className="min-h-screen">
    <header className="border-b border-border bg-background/95 px-5 py-5 lg:px-10"><div className="mx-auto max-w-6xl"><button onClick={() => navigate({ to: "/" })} className="label-xs inline-flex items-center gap-2 text-muted-foreground"><ArrowLeft className="size-3"/> Back</button><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="label-xs text-primary">{fixture.league}</div><h1 className="mt-1 text-3xl font-semibold">{fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}</h1><p className="mt-1 text-xs text-muted-foreground">{fixture.date}{fixture.time ? ` · ${fixture.time}` : ""}</p></div><button onClick={save} className="button-primary inline-flex items-center gap-2"> <Database className="size-4"/>{saved ? "Saved" : "Save prediction"}</button></div></div></header>
    <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10">
      <section className="panel border-primary/30 p-6"><div className="label-xs text-primary">FINAL VERDICT</div><div className="mt-2 text-3xl font-semibold">{result.finalPrediction}</div><div className="mt-2 text-sm text-muted-foreground">Predicted score <span className="font-semibold text-foreground">{result.predictedScore.replace("-", " : ")}</span></div></section>
      <section className="mt-5"><div className="flex items-end justify-between"><div><div className="label-xs text-primary">BEST PREDICTIONS</div><h2 className="mt-1 text-xl font-semibold">Actionable markets</h2></div><span className="text-xs text-muted-foreground">{result.predictions.length} selected</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{result.predictions.map(p => <PredictionCard key={p.market} prediction={p}/>)}</div></section>
      <section className="mt-6 grid gap-3 sm:grid-cols-3"><Stat label="Home" value={`${Math.round(result.probabilities.home * 100)}%`}/><Stat label="Draw" value={`${Math.round(result.probabilities.draw * 100)}%`}/><Stat label="Away" value={`${Math.round(result.probabilities.away * 100)}%`}/></section>
      <section className="mt-6 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="rounded border border-border px-3 py-2">Confidence {result.confidence}%</span><span className="rounded border border-border px-3 py-2">Quality {result.quality}</span><span className="rounded border border-border px-3 py-2">Robustness {result.robustness.label}</span><span className="rounded border border-border px-3 py-2">Risk {result.risk}</span></section>
      <p className="mt-8 text-center text-xs text-muted-foreground">The calculations, engine comparison and evidence audit stay behind the interface. This screen shows the conclusions.</p>
    </main>
  </div>;
}

function PredictionCard({ prediction }: { prediction: AuthoritativeMatchAnalysis["predictions"][number] }) { return <div className="panel p-5"><div className="label-xs">{prediction.market}</div><div className="mt-2 text-xl font-semibold">{prediction.label}</div><div className="mt-3 flex items-baseline justify-between"><span className="text-2xl font-semibold">{Math.round(prediction.probability * 100)}%</span><span className="text-xs text-muted-foreground">model probability</span></div></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="panel p-4"><div className="label-xs">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>; }
function State({ title, text, back }: { title: string; text: string; back?: boolean }) { return <div className="grid min-h-screen place-items-center p-8"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p>{back && <Link to="/" className="button-primary mt-6 inline-flex">Return to search</Link>}</div></div>; }
