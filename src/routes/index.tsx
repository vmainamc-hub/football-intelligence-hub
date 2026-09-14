import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Database, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { findFixtures, loadFreeFixtures, type MatchRow } from "@/lib/gfi/intelligence";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [query, setQuery] = useState("");
  const data = useQuery({ queryKey: ["free-fixtures"], queryFn: loadFreeFixtures, staleTime: 30 * 60_000 });
  const results = useMemo(() => findFixtures(data.data ?? [], query), [data.data, query]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-field" />
      <div className="relative mx-auto max-w-6xl px-5 py-12 lg:px-10 lg:py-20">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 label-xs"><span className="pulse-dot size-1.5 rounded-full bg-primary" /> FREE MODE · LIVE DATA PIPELINE</div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-positive" /> No paid key required</div>
        </div>
        <section className="max-w-4xl">
          <p className="label-xs text-primary">GLOBAL FOOTBALL INTELLIGENCE</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Find the match. <span className="text-primary">Interrogate the evidence.</span></h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">A multi-engine football intelligence terminal built around transparent probabilities, contradiction detection and evidence quality — without treating bookmaker prices as truth.</p>
        </section>
        <div className="panel mt-10 max-w-4xl p-2 shadow-panel">
          <div className="flex items-center gap-3 px-4">
            <Search className="size-5 text-primary" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a fixture — e.g. Lyon Monaco" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
            {data.isFetching ? <span className="label-xs">loading</span> : <span className="label-xs">{data.data?.length ?? 0} leagues</span>}
          </div>
        </div>
        {query && <div className="mt-3 max-w-4xl overflow-hidden rounded-lg border border-border bg-card">
          {results.length ? results.map((m, i) => <FixtureRow key={`${m.home}-${m.away}-${m.date}-${i}`} fixture={m} />) : <div className="p-5 text-sm text-muted-foreground">No matching fixture found in the free historical fixture feed. Try a team name or wait for the data feed to finish loading.</div>}
        </div>}
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          <Signal icon={Database} title="Free evidence layer" text="Public fixture/results data is ingested locally. Paid providers are enhancements, never hard dependencies." />
          <Signal icon={Sparkles} title="Model transparency" text="Every probability carries sample quality, warnings and evidence instead of false precision." />
          <Signal icon={Zap} title="Decision discipline" text="The engine can return NO STRONG EDGE when the evidence does not justify a selection." />
        </div>
        <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["Batch Intelligence", "Simulation Lab", "Engine Arena", "Evidence Intelligence"].map((x) => <Link key={x} to="/batch" className="panel group p-5 hover:border-primary/50"><div className="label-xs">MODULE</div><div className="mt-2 flex items-center justify-between font-medium">{x}<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div></Link>)}
        </section>
      </div>
    </div>
  );
}

function FixtureRow({ fixture }: { fixture: MatchRow & { league: string } }) {
  const id = encodeURIComponent(`${fixture.home}__${fixture.away}__${fixture.date}`);
  return <Link to="/match/$matchId" params={{ matchId: id }} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0 hover:bg-muted/40">
    <div className="min-w-0 flex-1"><div className="font-medium">{fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}</div><div className="label-xs mt-1">{fixture.league} · {fixture.date || "scheduled"}</div></div>
    <div className="label-xs">OPEN INTELLIGENCE <ArrowRight className="ml-1 inline size-3" /></div>
  </Link>;
}

function Signal({ icon: Icon, title, text }: { icon: typeof Database; title: string; text: string }) {
  return <div className="panel p-5"><Icon className="size-5 text-primary" /><h3 className="mt-4 font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}
