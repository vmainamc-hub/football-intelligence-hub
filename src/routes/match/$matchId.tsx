import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle, CheckCircle2, Gauge, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { analyzeMatch, loadFreeFixtures, type MatchRow } from "@/lib/gfi/intelligence";

export const Route = createFileRoute("/match/$matchId")({ component: MatchPage });

function MatchPage() {
  const { matchId } = Route.useParams();
  const decoded = decodeURIComponent(matchId);
  const [home = "", away = "", date = ""] = decoded.split("__");
  const feed = useQuery({ queryKey: ["free-fixtures"], queryFn: loadFreeFixtures, staleTime: 30 * 60_000 });
  const fixture = useMemo(() => {
    const all = feed.data?.flatMap((g) => g.matches) ?? [];
    return all.find((m) => m.home === home && m.away === away && m.date === date) ?? { home, away, date };
  }, [feed.data, home, away, date]);
  const all = feed.data?.flatMap((g) => g.matches) ?? [];
  const result = analyzeMatch(fixture, all);

  return <div className="mx-auto max-w-7xl px-5 py-7 lg:px-10">
    <Link to="/" className="label-xs inline-flex items-center gap-2 hover:text-foreground"><ArrowLeft className="size-3" /> SEARCH</Link>
    <header className="mt-8 border-b border-border pb-7">
      <div className="label-xs text-primary">MATCH INTELLIGENCE · FREE MODE</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <div><h1 className="text-3xl font-semibold tracking-tight">{home} <span className="text-muted-foreground">vs</span> {away}</h1><p className="mt-2 text-sm text-muted-foreground">{date || "Scheduled fixture"} · local statistical engine</p></div>
        <div className="rounded-md border border-border bg-card px-5 py-3"><div className="label-xs">VERDICT</div><div className="mt-1 text-lg font-semibold text-primary">{result.verdict}</div></div>
      </div>
    </header>

    <section className="mt-6 grid gap-3 md:grid-cols-4">
      <Metric title="Home" value={`${Math.round(result.probabilities.home * 100)}%`} note="model probability" />
      <Metric title="Draw" value={`${Math.round(result.probabilities.draw * 100)}%`} note="model probability" />
      <Metric title="Away" value={`${Math.round(result.probabilities.away * 100)}%`} note="model probability" />
      <Metric title="Quality" value={`${result.quality}/100`} note={`${result.confidence}% confidence`} />
    </section>

    <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-border p-5"><div className="label-xs">MARKET MATRIX</div><h2 className="mt-1 text-lg font-semibold">Probability surface</h2></div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <Cell label="OVER 0.5" value={result.totals.over0.5} />
          <Cell label="OVER 1.5" value={result.totals.over1.5} />
          <Cell label="OVER 2.5" value={result.totals.over2.5} />
          <Cell label="OVER 3.5" value={result.totals.over3.5} />
          <Cell label="BTTS YES" value={result.btts.yes} />
          <Cell label="BTTS NO" value={result.btts.no} />
          <Cell label="HOME FORM" value={result.home.played ? result.home.points / (result.home.played * 3) : 0} />
          <Cell label="AWAY FORM" value={result.away.played ? result.away.points / (result.away.played * 3) : 0} />
        </div>
      </section>
      <section className="panel p-5">
        <div className="label-xs">EVIDENCE STATUS</div>
        <div className="mt-4 space-y-4">{result.evidence.map((x) => <div key={x} className="flex gap-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" /><span>{x}</span></div>)}{result.warnings.map((x) => <div key={x} className="flex gap-3 text-sm text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{x}</span></div>)}</div>
      </section>
    </div>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      <Team title={result.home.team} data={result.home} venue="HOME" />
      <Team title={result.away.team} data={result.away} venue="AWAY" />
    </section>

    <section className="panel mt-6 p-5">
      <div className="flex items-center gap-3"><Gauge className="size-5 text-primary" /><div><div className="label-xs">MODEL GOVERNANCE</div><h2 className="font-semibold">What this result does — and does not — claim</h2></div></div>
      <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground">This first working engine uses completed match results available in the free data layer. It deliberately does not fabricate xG, injuries, lineups, odds or news. Those evidence domains remain unpopulated until a source actually supplies them. A high probability is therefore not treated as a betting instruction.</p>
      <div className="mt-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/5 p-4 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" /><span>Before a strong edge can be promoted, the production pipeline should require independent evidence, market comparison and stability checks.</span></div>
    </section>
  </div>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <div className="panel p-4"><div className="label-xs">{title}</div><div className="metric mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></div>; }
function Cell({ label, value }: { label: string; value: number }) { return <div className="bg-card p-4"><div className="label-xs">{label}</div><div className="metric mt-2 text-xl font-semibold">{Math.round(value * 100)}%</div></div>; }
function Team({ title, data, venue }: { title: string; data: ReturnType<typeof import("@/lib/gfi/intelligence").analyzeMatch>["home"]; venue: string }) { return <section className="panel p-5"><div className="label-xs">{venue} TEAM PROFILE</div><h2 className="mt-1 text-lg font-semibold">{title}</h2><div className="mt-5 grid grid-cols-3 gap-3"><Metric title="Played" value={`${data.played}`} note="latest sample" /><Metric title="Points" value={`${data.points}`} note={`${data.wins}W ${data.draws}D ${data.losses}L`} /><Metric title="Goals" value={`${data.goalsFor}:${data.goalsAgainst}`} note="for : against" /></div><div className="mt-5"><div className="label-xs">RECENT FORM</div><div className="mt-2 flex gap-1">{data.recent.length ? data.recent.map((r, i) => <span key={`${r}-${i}`} className={`grid size-8 place-items-center rounded border text-xs font-semibold ${r === "W" ? "border-positive/50 text-positive" : r === "D" ? "border-warning/50 text-warning" : "border-destructive/50 text-destructive"}`}>{r}</span>) : <span className="text-sm text-muted-foreground">No completed matches in the feed.</span>}</div></div></section>; }
