import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Database, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { analyzeFreeMatch } from "@/lib/gfi/match-analysis";
import { buildMainstreamMarketMap, type MarketSignal } from "@/lib/gfi/market-map";
import { loadFreeFixtures, type MatchRow } from "@/lib/gfi/intelligence";

export const Route = createFileRoute("/match/$matchId")({ component: MatchPage });

type Fixture = MatchRow & { league: string; code: string; season: string };

function MatchPage() {
  const { matchId } = Route.useParams();
  const decoded = decodeURIComponent(matchId);
  const [home = "", away = "", date = ""] = decoded.split("__");

  const feed = useQuery({
    queryKey: ["free-fixtures", "match"],
    queryFn: loadFreeFixtures,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const fixture = useMemo<Fixture | undefined>(() => {
    const groups = feed.data ?? [];
    for (const group of groups) {
      const match = group.matches.find((item) => item.home === home && item.away === away && item.date === date);
      if (match) return { ...match, league: group.league, code: group.code, season: group.season };
    }
    return undefined;
  }, [feed.data, home, away, date]);

  const analysis = useQuery({
    queryKey: ["authoritative-analysis", fixture?.code, fixture?.season, fixture?.home, fixture?.away, fixture?.date, fixture?.time, fixture?.source, fixture?.sourceId],
    queryFn: () => analyzeFreeMatch({
      data: {
        code: fixture!.code,
        fixture: {
          ...fixture!,
          league: fixture!.league,
          source: fixture!.source,
          sourceId: fixture!.sourceId,
        },
      },
    }),
    enabled: !!fixture,
    staleTime: 10 * 60_000,
  });

  if (feed.isLoading) return <State title="Loading match intelligence" text="Building the fixture context from the live free-data layer…" />;
  if (!fixture) return <State title="Match not found" text="The selected fixture is no longer present in the current fixture registry." back />;
  if (analysis.isLoading) return <State title="Analysing match" text="The authoritative backend is calculating team form, goals, venue, BTTS, H2H, data quality and consensus for this specific fixture…" />;
  if (analysis.isError || !analysis.data) return <State title="Analysis unavailable" text={analysis.error instanceof Error ? analysis.error.message : "The authoritative backend could not produce a result for this fixture."} back />;

  const result = analysis.data;
  const markets = buildMainstreamMarketMap(result);
  const refresh = () => analysis.refetch();

  return <div className="min-h-screen">
    <header className="border-b border-border bg-background/95 px-5 py-5 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="label-xs inline-flex items-center gap-2 text-muted-foreground"><ArrowLeft className="size-3" /> BACK</Link>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="label-xs text-primary">{fixture.league} · {fixture.code} · {fixture.source ?? "free feed"}</div>
            <h1 className="mt-1 text-3xl font-semibold">{fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{fixture.date}{fixture.time ? ` · ${fixture.time}` : ""} · analysis {result.analysisVersion}</p>
          </div>
          <button onClick={refresh} className="button-primary inline-flex items-center justify-center gap-2"><RefreshCw className="size-4" /> Re-run analysis</button>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10">
      <section className="panel border-primary/30 p-6">
        <div className="label-xs text-primary">PRIMARY MATCH CALL</div>
        <div className="mt-2 text-3xl font-semibold">{result.finalPrediction}</div>
        <div className="mt-2 text-sm text-muted-foreground">Predicted score <span className="font-semibold text-foreground">{result.predictedScore.replace("-", " : ")}</span> · {result.decision}</div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <div><div className="label-xs text-primary">MAINSTREAM MARKET BOARD</div><h2 className="mt-1 text-xl font-semibold">Every match gets a usable market view</h2></div>
          <span className="text-xs text-muted-foreground">{markets.length} markets</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{markets.map((market) => <MarketCard key={`${market.market}-${market.selection}`} market={market} />)}</div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3"><Stat label="Home" value={`${Math.round(result.probabilities.home * 100)}%`} /><Stat label="Draw" value={`${Math.round(result.probabilities.draw * 100)}%`} /><Stat label="Away" value={`${Math.round(result.probabilities.away * 100)}%`} /></section>

      <section className="mt-6 grid gap-3 sm:grid-cols-4"><Stat label="Confidence" value={`${result.confidence}%`} /><Stat label="Quality" value={`${result.quality}/100`} /><Stat label="Robustness" value={result.robustness.label} /><Stat label="Risk" value={result.risk} /></section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5"><div className="label-xs text-primary">HOME EVIDENCE</div><h2 className="mt-1 text-lg font-semibold">{result.home.team}</h2><div className="mt-4 grid grid-cols-3 gap-3"><Stat label="Played" value={`${result.home.played}`} /><Stat label="Record" value={`${result.home.wins}-${result.home.draws}-${result.home.losses}`} /><Stat label="Goals" value={`${result.home.goalsFor}:${result.home.goalsAgainst}`} /></div><div className="mt-4 text-xs text-muted-foreground">Recent form: {result.home.recent.length ? result.home.recent.join(" · ") : "no completed sample"}</div></div>
        <div className="panel p-5"><div className="label-xs text-primary">AWAY EVIDENCE</div><h2 className="mt-1 text-lg font-semibold">{result.away.team}</h2><div className="mt-4 grid grid-cols-3 gap-3"><Stat label="Played" value={`${result.away.played}`} /><Stat label="Record" value={`${result.away.wins}-${result.away.draws}-${result.away.losses}`} /><Stat label="Goals" value={`${result.away.goalsFor}:${result.away.goalsAgainst}`} /></div><div className="mt-4 text-xs text-muted-foreground">Recent form: {result.away.recent.length ? result.away.recent.join(" · ") : "no completed sample"}</div></div>
      </section>

      <section className="panel mt-6 p-5"><div className="flex items-center gap-2"><Database className="size-4 text-primary" /><div className="label-xs text-primary">ENGINE TRACE</div></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{result.engines.map((engine) => <div key={engine.id} className="rounded border border-border px-3 py-3"><div className="text-sm font-semibold">{engine.name}</div><div className="mt-1 text-xs text-muted-foreground">{engine.signal} · quality {engine.quality} · v{engine.version}</div></div>)}</div></section>
    </main>
  </div>;
}

function MarketCard({ market }: { market: MarketSignal }) { return <div className={`panel p-5 ${market.tier === "PRIMARY" ? "border-primary/30" : ""}`}><div className="flex items-center justify-between gap-3"><div className="label-xs">{market.market}</div><span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{market.tier}</span></div><div className="mt-2 text-xl font-semibold">{market.selection}</div><div className="mt-3 flex items-baseline justify-between"><span className="text-2xl font-semibold">{Math.round(market.probability * 100)}%</span><span className="text-xs text-muted-foreground">market probability</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{market.rationale}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded border border-border bg-card p-3"><div className="label-xs">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>; }
function State({ title, text, back }: { title: string; text: string; back?: boolean }) { return <div className="grid min-h-screen place-items-center p-8"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p>{back && <Link to="/" className="button-primary mt-6 inline-flex">Return to matches</Link>}</div></div>; }
