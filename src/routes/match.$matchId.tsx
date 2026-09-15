import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Database, ShieldCheck, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { loadFreeFixtures, type AuthoritativeMatchAnalysis, type MatchRow } from "@/lib/gfi/intelligence";
import { analyzeFreeMatch, type ServerMatchAnalysis } from "@/lib/gfi/match-analysis";
import { searchUniversalFixtures } from "@/lib/gfi/universal-sources";
import { bestQualifiedMarket, buildMainstreamMarketMap, type MarketSignal } from "@/lib/gfi/market-map";
import { buildMatchReasoning } from "@/lib/gfi/reasoning";
import { saveAuthoritativePrediction } from "@/lib/gfi/prediction-ledger";

export const Route = createFileRoute("/match/$matchId")({ component: MatchIntelligence });
type Fixture = MatchRow & { league: string; code: string; season: string };
function decodeFixture(value: string) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed && typeof parsed === "object" && parsed.h && parsed.a && parsed.d)
      return parsed as { h: string; a: string; d: string; t?: string; c?: string; s?: string; i?: string };
  } catch {}
  const [h = "", a = "", d = ""] = decodeURIComponent(value).split("__");
  return { h, a, d, t: "", c: "", s: "", i: "" };
}

function MatchIntelligence() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const parsed = decodeFixture(matchId);
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["free-fixtures", "match-intelligence"], queryFn: loadFreeFixtures, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 });
  const localFixture = useMemo(() => (query.data ?? [])
    .flatMap((g) => g.matches.map((m) => ({ ...m, league: g.league, code: g.code, season: g.season })))
    .find((m) => m.home === parsed.h && m.away === parsed.a && m.date === parsed.d && (!parsed.c || m.code === parsed.c) && (!parsed.i || m.sourceId === parsed.i)) as Fixture | undefined,
    [query.data, parsed.h, parsed.a, parsed.d, parsed.c, parsed.i]);
  const remoteQuery = useQuery({ queryKey: ["universal-match", parsed.h, parsed.a, parsed.d], queryFn: () => searchUniversalFixtures({ data: { query: `${parsed.h} vs ${parsed.a}` } }), enabled: !localFixture && !!parsed.h && !!parsed.a, staleTime: 60_000 });
  const directFixture = useMemo<Fixture | undefined>(() => {
    if (!parsed.h || !parsed.a || !parsed.d) return undefined;
    return { home: parsed.h, away: parsed.a, date: parsed.d, time: parsed.t ?? "", league: "Worldwide Football", code: parsed.c || "GLOBAL", season: parsed.s || "unknown", source: "route-fixture", sourceId: parsed.i || "route" };
  }, [parsed.h, parsed.a, parsed.d, parsed.t, parsed.c, parsed.s, parsed.i]);
  const fixture = useMemo(() => localFixture ?? ((remoteQuery.data ?? []).find((m) => m.date === parsed.d || !parsed.d) as Fixture | undefined) ?? directFixture,
    [localFixture, remoteQuery.data, parsed.d, directFixture]);
  const analysisQuery = useQuery({
    queryKey: ["authoritative-match", fixture?.code, fixture?.season, fixture?.home, fixture?.away, fixture?.date, fixture?.time, fixture?.source, fixture?.sourceId],
    queryFn: () => analyzeFreeMatch({ data: { code: fixture!.code ?? "GLOBAL", fixture: fixture! } }),
    enabled: !!fixture,
    staleTime: 10 * 60_000,
  });
  const result = analysisQuery.data as ServerMatchAnalysis | undefined;
  if (!fixture) return <State title={remoteQuery.isFetching || query.isFetching ? "Resolving fixture" : "Match unavailable"} text={remoteQuery.isFetching || query.isFetching ? "Checking the connected public-source fabric…" : "The route did not contain enough fixture information to investigate this match."} back />;
  if (analysisQuery.isLoading && !result) return <State title="Building intelligence" text="The fixture is resolved. Historical context, research evidence and model engines are now being assembled." />;
  if (analysisQuery.error && !result) return <State title="Analysis unavailable" text={analysisQuery.error instanceof Error ? analysisQuery.error.message : "The authoritative analysis request failed."} back />;
  if (!result) return <State title="Analysis pending" text="Waiting for the authoritative result…" />;

  const marketMap = buildMainstreamMarketMap(result);
  const oneX2 = marketMap.find((m) => m.market === "1X2") ?? marketMap[0];
  const bestAction = bestQualifiedMarket(result);
  const reasoning = buildMatchReasoning(fixture, result);
  const save = () => { saveAuthoritativePrediction(result, fixture); setSaved(true); };
  const aiStatus = String(result.aiReasoningPacket?.aiStatus ?? "Deterministic model synthesis");
  const aiRole = String(result.aiReasoningPacket?.aiRole ?? "DETERMINISTIC_MULTI_MODEL_SYNTHESIS");
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/95 px-5 py-5 lg:px-10"><div className="mx-auto max-w-6xl">
        <button onClick={() => navigate({ to: "/" })} className="label-xs inline-flex items-center gap-2 text-muted-foreground"><ArrowLeft className="size-3" /> Back</button>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div>
          <div className="label-xs text-primary">{fixture.league ?? "Worldwide Football"} · {fixture.code ?? "GLOBAL"} · {fixture.source ?? "public source"}</div>
          <h1 className="mt-1 text-3xl font-semibold">{fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{fixture.date}{fixture.time ? ` · ${fixture.time}` : ""} · {result.analysisVersion}</p>
        </div><button onClick={save} className="button-primary inline-flex items-center gap-2"><Database className="size-4" />{saved ? "Saved" : "Save prediction"}</button></div>
      </div></header>
      <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10">
        <section className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
          <div className="panel border-primary/30 p-6"><div className="label-xs text-primary">AI INTELLIGENCE READ</div><div className="mt-2 flex items-center gap-2 text-2xl font-semibold"><Sparkles className="size-5 text-primary" />{reasoning.headline}</div><p className="mt-3 text-sm leading-6 text-muted-foreground">{reasoning.summary}</p><div className="mt-4 grid gap-2">{reasoning.claims.slice(0, 4).map((c, idx) => <div key={`${c.id}-${idx}`} className="rounded border border-border px-3 py-2 text-xs"><span className="label-xs mr-2">{c.signal}</span>{c.statement}<div className="mt-1 text-muted-foreground">{c.evidence}</div></div>)}</div></div>
          <div className="panel p-6"><div className="label-xs">SCENARIO</div><div className="mt-2 text-2xl font-semibold">{result.predictedScore.replace("-", " : ")}</div><p className="mt-2 text-xs text-muted-foreground">Most likely scoreline from the goal/scenario layer, not certainty.</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> {result.robustness.label} · Risk {result.risk}</div></div>
        </section>
        <section className="mt-6 panel border-primary/20 p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="label-xs text-primary">BEST ACTIONABLE MARKET</div><h2 className="mt-1 text-xl font-semibold">{bestAction.selection}</h2></div><span className="text-xs text-muted-foreground">{Math.round(bestAction.probability * 100)}% · {bestAction.market}</span></div><div className="mt-4 grid gap-3 md:grid-cols-3">{[bestAction, oneX2, ...marketMap.filter((m) => m.market !== "1X2" && m !== bestAction).sort((a,b) => b.probability-a.probability).slice(0,1)].map((m, i) => <MarketCard key={`${m.market}-${i}`} market={m} />)}</div></section>
        <section className="mt-6"><div className="flex items-end justify-between"><div><div className="label-xs text-primary">AUTHORITATIVE 1X2 CALL</div><h2 className="mt-1 text-xl font-semibold">{oneX2.selection}</h2></div><span className="text-xs text-muted-foreground">{Math.round(oneX2.probability * 100)}% model probability</span></div><div className="mt-3 panel p-5"><p className="text-sm text-muted-foreground">{oneX2.rationale}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded border border-border px-3 py-1.5">Decision {result.decision}</span><span className="rounded border border-border px-3 py-1.5">Confidence {result.confidence}%</span><span className="rounded border border-border px-3 py-1.5">Quality {result.quality}</span><span className="rounded border border-border px-3 py-1.5">Agreement {Math.round(result.consensus.agreement * 100)}%</span></div></div></section>
        <section className="mt-6 grid gap-4 lg:grid-cols-2"><div className="panel p-5"><div className="label-xs text-primary">AI / MODEL STATUS</div><div className="mt-2 text-sm font-semibold">{aiRole}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{aiStatus}</p><p className="mt-3 text-xs text-muted-foreground">The prediction authority is the deterministic multi-model ensemble. No separate generative AI model is currently inventing or overriding the selection.</p></div><div className="panel p-5"><div className="label-xs text-primary">EVIDENCE HEALTH</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><HealthStat label="Historical rows" value={String(result.pipeline.historicalRowsLoaded)} /><HealthStat label="Model rows" value={String(result.pipeline.modelContextRows)} /><HealthStat label="Home sample" value={String(result.pipeline.homeSample)} /><HealthStat label="Away sample" value={String(result.pipeline.awaySample)} /><HealthStat label="Evidence mode" value={result.pipeline.evidenceMode} /><HealthStat label="Context" value={result.pipeline.modelContext} /></div></div></section>
        <section className="mt-6"><div className="label-xs text-primary">MARKET INTELLIGENCE</div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{marketMap.map((m) => <MarketCard key={m.market} market={m} />)}</div></section>
        <section className="mt-6"><div className="label-xs text-primary">ENGINE GRAPH</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{result.engines.map((e, idx) => <div key={`${e.id}-${idx}`} className="rounded border border-border p-3"><div className="text-sm font-semibold">{e.name}</div><div className="mt-1 text-xs text-muted-foreground">{e.signal} · Q{e.quality} · {e.version}</div></div>)}</div></section>
        <section className="mt-6 panel p-5"><div className="flex items-center gap-2"><Database className="size-4 text-primary" /><div className="label-xs text-primary">EVIDENCE LINEAGE</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Source",result.pipeline.source],["Competition",result.pipeline.competition],["Historical rows",String(result.pipeline.historicalRowsLoaded)],["Model rows",String(result.pipeline.modelContextRows)],["Home sample",String(result.pipeline.homeSample)],["Away sample",String(result.pipeline.awaySample)],["H2H sample",String(result.pipeline.h2hSample)],["Evidence mode",result.pipeline.evidenceMode],["Generated",result.pipeline.generatedAt]].map(([k,v]) => <div key={k} className="rounded border border-border bg-card p-3"><div className="label-xs">{k}</div><div className="mt-1 break-all text-xs font-medium">{v}</div></div>)}</div></section>
      </main>
    </div>
  );
}
function State({ title, text, back = false }: { title: string; text: string; back?: boolean }) { return <div className="mx-auto max-w-3xl px-5 py-16">{back && <Link to="/" className="label-xs">← HOME</Link>}<h1 className="mt-5 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p></div>; }
function MarketCard({ market }: { market: MarketSignal }) { return <div className="panel p-4"><div className="label-xs">{market.market}</div><div className="mt-2 text-lg font-semibold">{market.selection}</div><div className="mt-1 text-xs text-muted-foreground">{Math.round(market.probability * 100)}% · {market.rationale}</div></div>; }
function HealthStat({ label, value }: { label: string; value: string }) { return <div className="rounded border border-border bg-card p-3"><div className="label-xs">{label}</div><div className="mt-1 font-semibold">{value}</div></div>; }
