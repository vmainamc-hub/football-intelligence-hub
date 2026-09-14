import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Database, Search, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { findFixtures, kickoffKenya, loadFreeFixtures, upcomingFixtures, type MatchRow } from "@/lib/gfi/intelligence";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [query, setQuery] = useState("");
  const data = useQuery({ queryKey: ["free-fixtures"], queryFn: loadFreeFixtures, staleTime: 30 * 60_000 });
  const results = useMemo(() => findFixtures(data.data ?? [], query), [data.data, query]);
  const upcoming = useMemo(() => upcomingFixtures(data.data ?? [], 21).slice(0, 18), [data.data]);

  return <div className="relative min-h-screen overflow-hidden">
    <div className="relative mx-auto max-w-6xl px-5 py-10 lg:px-10 lg:py-16">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="label-xs"><span className="pulse-dot mr-2 inline-block size-1.5 rounded-full bg-primary" /> GLOBAL FOOTBALL INTELLIGENCE</div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> FREE MODE</div>
      </div>
      <section className="max-w-4xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Find the match. <span className="text-primary">Get the prediction.</span></h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Type a team or fixture. The intelligence engine does the calculations; this screen shows only the actionable predictions and final verdict.</p>
      </section>
      <div className="panel mt-8 max-w-4xl p-2 shadow-panel">
        <div className="flex items-center gap-3 px-4"><Search className="size-5 text-primary"/><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a match — e.g. Newcastle" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"/>{data.isFetching ? <span className="label-xs">loading</span> : <span className="label-xs">{data.data?.length ?? 0} leagues</span>}</div>
      </div>
      {query ? <div className="mt-3 max-w-4xl overflow-hidden rounded-lg border border-border bg-card">{results.length ? results.map((m, i) => <FixtureRow key={`${m.home}-${m.away}-${m.date}-${i}`} fixture={m}/>) : <div className="p-5 text-sm text-muted-foreground">No matching fixture found in the current fixture feed.</div>}</div> : <section className="mt-10 max-w-5xl"><div className="flex items-end justify-between"><div><div className="label-xs text-primary">UPCOMING</div><h2 className="mt-1 text-2xl font-semibold">Today from 21:00 Kenya time</h2></div><span className="text-xs text-muted-foreground">{upcoming.length} shown</span></div><div className="mt-4 grid gap-3 md:grid-cols-2">{upcoming.map((m, i) => <FixtureRow key={`${m.home}-${m.away}-${m.date}-${i}`} fixture={m}/>)}</div>{!upcoming.length && !data.isFetching && <div className="panel mt-4 p-6 text-sm text-muted-foreground">No fixture with a published kickoff at or after 21:00 EAT is currently present in the free feed. Search any team above to inspect its available fixture.</div>}</section>}
      <div className="mt-12 grid gap-3 md:grid-cols-3"><Signal icon={Database} title="Free data" text="The free results feed is the hard dependency. Paid providers are optional enhancements."/><Signal title="Actionable output" text="The interface prioritizes meaningful markets such as match result, Over 2.5 and BTTS."/><Signal title="One verdict" text="All quantitative engines feed one authoritative decision."/></div>
    </div>
  </div>;
}

function FixtureRow({ fixture }: { fixture: MatchRow & { league?: string; code?: string } }) {
  const id = encodeURIComponent(`${fixture.home}__${fixture.away}__${fixture.date}`);
  const kenya = kickoffKenya(fixture);
  const time = kenya?.match(/ (\d{2}:\d{2})$/)?.[1];
  return <Link to="/match/$matchId" params={{ matchId: id }} className="flex items-center gap-4 border-b border-border bg-card px-5 py-4 last:border-0 hover:bg-muted/40"><div className="min-w-0 flex-1"><div className="font-medium">{fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}</div><div className="label-xs mt-1">{fixture.league} · {time ? `${time} EAT` : fixture.date}</div></div><ArrowRight className="size-4 text-muted-foreground"/></Link>;
}

function Signal({ icon: Icon, title, text }: { icon?: typeof Database; title: string; text: string }) {
  return <div className="panel p-5">{Icon && <Icon className="size-5 text-primary"/>}<h3 className="mt-3 font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}
