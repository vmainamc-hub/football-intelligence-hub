import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Database, ShieldCheck, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  loadFreeFixtures,
  type AuthoritativeMatchAnalysis,
  type MatchRow,
} from "@/lib/gfi/intelligence";
import { analyzeFreeMatch, type ServerMatchAnalysis } from "@/lib/gfi/match-analysis";
import { searchUniversalFixtures } from "@/lib/gfi/universal-sources";
import {
  bestQualifiedMarket,
  buildMainstreamMarketMap,
  buildSevenMarketComparison,
  type MarketSignal,
} from "@/lib/gfi/market-map";
import { buildMatchReasoning } from "@/lib/gfi/reasoning";
import { saveAuthoritativePrediction } from "@/lib/gfi/prediction-ledger";
import { canonicalCompetitionName } from "@/lib/gfi/identity";

export const Route = createFileRoute("/match/$matchId")({ component: MatchIntelligence });
type Fixture = MatchRow & { league: string; code: string; season: string };
function decodeFixture(value: string) {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed && typeof parsed === "object" && parsed.h && parsed.a && parsed.d)
      return parsed as {
        h: string;
        a: string;
        d: string;
        t?: string;
        c?: string;
        l?: string;
        s?: string;
        i?: string;
      };
  } catch {
    // Malformed payload falls back to delimiter decoding
  }
  const [h = "", a = "", d = ""] = decodeURIComponent(value).split("__");
  return { h, a, d, t: "", c: "", l: "", s: "", i: "" };
}

function MatchIntelligence() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const parsed = useMemo(() => decodeFixture(matchId), [matchId]);
  const [saved, setSaved] = useState(false);

  const fixture = useMemo<Fixture | undefined>(() => {
    if (!parsed.h || !parsed.a || !parsed.d) return undefined;
    return {
      home: parsed.h,
      away: parsed.a,
      date: parsed.d,
      time: parsed.t ?? "",
      league: canonicalCompetitionName(parsed.l || "Worldwide Football"),
      code: parsed.c || "GLOBAL",
      season: parsed.s || "unknown",
      source: "route-fixture",
      sourceId: parsed.i || "route",
    };
  }, [parsed]);

  const analysisQuery = useQuery({
    queryKey: ["authoritative-match", matchId],
    queryFn: () =>
      analyzeFreeMatch({ data: { code: fixture!.code ?? "GLOBAL", fixture: fixture! } }),
    enabled: !!fixture,
    staleTime: 10 * 60_000,
  });
  const result = analysisQuery.data as ServerMatchAnalysis | undefined;
  const phase = !fixture
    ? "RESOLVING FIXTURE"
    : result
      ? "ANALYSIS READY"
      : "BUILDING INTELLIGENCE";

  if (!fixture)
    return (
      <State
        title="Match unavailable"
        text="The link did not carry enough fixture information to investigate this match."
        back
      />
    );

  if (analysisQuery.isLoading || (analysisQuery.isPending && !result))
    return (
      <State
        title="Building intelligence"
        text={`${fixture.home} vs ${fixture.away} is resolved. RESOLVING FIXTURE ✓ → BUILDING INTELLIGENCE … historical context, research evidence, model engines and simulation are being assembled on the server.`}
      />
    );

  const queryError = analysisQuery.error;
  const errPayload = result as Record<string, unknown> | undefined;
  const isResultInvalid =
    !result ||
    typeof result !== "object" ||
    "error" in result ||
    errPayload?.status === "error" ||
    !result.probabilities ||
    typeof result.probabilities.home !== "number";

  if (queryError || isResultInvalid) {
    const errorMsg =
      queryError instanceof Error
        ? queryError.message
        : typeof errPayload?.error === "string"
          ? errPayload.error
          : typeof errPayload?.message === "string"
            ? errPayload.message
            : !result
              ? "The authoritative analysis request failed to return data."
              : "The analysis pipeline could not assemble complete model probabilities.";
    return <State title="Analysis unavailable" text={errorMsg} back />;
  }

  const marketMap = buildMainstreamMarketMap(result);
  const sevenMarkets = buildSevenMarketComparison(result);
  const oneX2 = marketMap.find((m) => m.market === "1X2") ?? marketMap[0];
  const bestAction = bestQualifiedMarket(result);
  const reasoning = buildMatchReasoning(fixture, result);
  const save = () => {
    saveAuthoritativePrediction(result, fixture);
    setSaved(true);
  };
  const aiStatus = String(result.aiReasoningPacket?.aiStatus ?? "Deterministic model synthesis");
  const aiRole = String(result.aiReasoningPacket?.aiRole ?? "DETERMINISTIC_MULTI_MODEL_SYNTHESIS");
  const living = (result.aiReasoningPacket as Record<string, unknown> | undefined)?.livingEvidence as Record<string, unknown> | undefined;
  const livingFamilies = Array.isArray(living?.sourceFamilies) ? living.sourceFamilies.filter((x): x is string => typeof x === "string") : [];
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/95 px-5 py-5 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={() => navigate({ to: "/" })}
            className="label-xs inline-flex items-center gap-2 text-muted-foreground"
          >
            <ArrowLeft className="size-3" /> Back
          </button>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="label-xs text-primary">
                {fixture.league ?? "Worldwide Football"} · {fixture.code ?? "GLOBAL"} ·{" "}
                {fixture.source ?? "public source"} · {phase}
              </div>
              <h1 className="mt-1 text-3xl font-semibold">
                {fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {fixture.date}
                {fixture.time ? ` · ${fixture.time}` : ""} · {result.analysisVersion}
              </p>
            </div>
            <button onClick={save} className="button-primary inline-flex items-center gap-2">
              <Database className="size-4" />
              {saved ? "Saved" : "Save prediction"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-6 lg:px-10">
        <section className="panel border-primary/40 p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="border-b border-border pb-4 md:border-b-0 md:border-r md:pr-6">
              <div className="label-xs text-primary">BEST ACTIONABLE MARKET</div>
              <h2 className="mt-2 text-2xl font-bold">{bestAction.selection}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {bestAction.market}
                </span>
                <span className="font-semibold text-foreground">
                  {Math.round(bestAction.probability * 100)}% probability
                </span>
                <span className="text-muted-foreground">· {bestAction.confidence}% confidence</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {bestAction.rationale}
              </p>
            </div>

            <div className="border-b border-border pb-4 md:border-b-0 md:border-r md:pr-6">
              <div className="label-xs text-primary">AUTHORITATIVE 1X2 CALL</div>
              <h2 className="mt-2 text-2xl font-bold">{oneX2.selection}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-muted px-2 py-0.5 font-medium">
                  Decision: {result.decision}
                </span>
                <span className="font-semibold text-foreground">
                  {Math.round(oneX2.probability * 100)}% 1X2 probability
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {oneX2.rationale}
              </p>
            </div>

            <div>
              <div className="label-xs text-primary">PREDICTED SCORE / SCENARIO</div>
              <div className="mt-2 text-2xl font-bold tracking-tight">
                {(result.predictedScore || "1-1").replace("-", " : ")}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                <span>Robustness: {result.robustness?.label ?? "MODERATE"}</span>
                <span>· Risk: {result.risk ?? "MODERATE"}</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Most probable scoreline derived from independent Poisson and scenario distributions.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-5 text-xs">
            <div><span className="label-xs text-muted-foreground block">RISK</span><span className="font-semibold text-foreground">{result.risk ?? "MODERATE"}</span></div>
            <div><span className="label-xs text-muted-foreground block">MODEL QUALITY</span><span className="font-semibold text-foreground">{result.quality ?? 50} / 100</span></div>
            <div><span className="label-xs text-muted-foreground block">MODEL AGREEMENT</span><span className="font-semibold text-foreground">{Math.round((result.consensus?.agreement ?? 0.5) * 100)}%</span></div>
            <div><span className="label-xs text-muted-foreground block">CONFLICT</span><span className="font-semibold text-foreground">{Math.round((result.consensus?.conflict ?? 0.2) * 100)}%</span></div>
            <div className="col-span-2 sm:col-span-1"><span className="label-xs text-muted-foreground block">EVIDENCE HEALTH</span><span className="font-semibold text-foreground">{result.pipeline?.evidenceMode ?? "LIMITED"}</span></div>
          </div>
        </section>

        <section className="mt-6 panel p-6">
          <div className="label-xs text-primary">DIRECT SEVEN-MARKET COMPARISON</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">All seven requested alternatives are scored independently from the same accumulated historical evidence and authoritative engine ensemble. The display does not collapse the comparison to a single preferred market.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sevenMarkets.map((m) => <MarketCard key={`${m.market}-${m.selection}`} market={m} />)}
          </div>
        </section>

        <section className="mt-6">
          <div className="label-xs text-primary">ACTIONABLE MARKETS COMPARISON</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[bestAction, oneX2, ...marketMap.filter((m) => m.market !== "1X2" && m.market !== bestAction.market).sort((a, b) => b.probability - a.probability).slice(0, 1)].map((m, i) => (
              <MarketCard key={`${m.market}-${i}`} market={m} />
            ))}
          </div>
        </section>

        <section className="mt-6 panel p-6">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <div className="label-xs text-primary">ACCUMULATED PUBLIC EVIDENCE</div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HealthStat label="Living observations" value={String(living?.evidenceCount ?? 0)} />
            <HealthStat label="Stored source records" value={String(living?.sourceCount ?? 0)} />
            <HealthStat label="Match completeness" value={`${String(living?.matchCompleteness ?? 0)}%`} />
            <HealthStat label="Last mined" value={String(living?.lastMinedAt ?? "not yet mined")} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {livingFamilies.length ? livingFamilies.map((family) => <span key={family} className="rounded border border-border bg-card px-2 py-1 text-[11px] font-medium">{family}</span>) : <span className="text-xs text-muted-foreground">No living-cell source families have been persisted for this fixture yet.</span>}
          </div>
        </section>

        <section className="mt-6 panel p-6">
          <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><div className="label-xs text-primary">EXPLAINABLE MODEL SYNTHESIS</div></div>
          <div className="mt-2 text-xl font-semibold">{reasoning.headline}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{reasoning.summary}</p>
          <div className="mt-4 grid gap-2">{reasoning.claims.slice(0, 4).map((c, idx) => <div key={`${c.id}-${idx}`} className="rounded border border-border bg-card px-3 py-2 text-xs"><span className="label-xs mr-2 font-medium">{c.signal}</span><span className="font-medium text-foreground">{c.statement}</span><div className="mt-1 text-muted-foreground">{c.evidence}</div></div>)}</div>
          <p className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">* Explanations are generated deterministically from observed engine evidence, historical samples, and mathematical consensus. No external generative AI model overrides the quantitative selections.</p>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5"><div className="label-xs text-primary">MODEL ENSEMBLE STATUS</div><div className="mt-2 text-sm font-semibold">{aiRole}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{aiStatus}</p><p className="mt-3 text-xs text-muted-foreground">The prediction authority is the deterministic multi-model ensemble (form, goals, venue, H2H, consensus, and Monte Carlo simulation).</p></div>
          <div className="panel p-5"><div className="label-xs text-primary">EVIDENCE HEALTH</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><HealthStat label="Historical rows" value={String(result.pipeline?.historicalRowsLoaded ?? 0)} /><HealthStat label="Model rows" value={String(result.pipeline?.modelContextRows ?? 0)} /><HealthStat label="Home sample" value={String(result.pipeline?.homeSample ?? 0)} /><HealthStat label="Away sample" value={String(result.pipeline?.awaySample ?? 0)} /><HealthStat label="Evidence mode" value={result.pipeline?.evidenceMode ?? "LIMITED"} /><HealthStat label="Context" value={result.pipeline?.modelContext ?? "LIMITED"} /></div></div>
        </section>
        <section className="mt-6"><div className="label-xs text-primary">MARKET INTELLIGENCE</div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{marketMap.map((m) => <MarketCard key={`${m.market}-${m.selection}`} market={m} />)}</div></section>
        <section className="mt-6"><div className="label-xs text-primary">ENGINE GRAPH</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{(result.engines ?? []).map((e, idx) => <div key={`${e.id}-${idx}`} className="rounded border border-border p-3"><div className="text-sm font-semibold">{e.name}</div><div className="mt-1 text-xs text-muted-foreground">{e.signal} · Q{e.quality} · {e.version}</div></div>)}</div></section>
        <section className="mt-6 panel p-5"><div className="flex items-center gap-2"><Database className="size-4 text-primary" /><div className="label-xs text-primary">EVIDENCE LINEAGE</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Source", result.pipeline?.source ?? "pipeline"],["Competition", result.pipeline?.competition ?? fixture.league ?? "Worldwide Football"],["Historical rows", String(result.pipeline?.historicalRowsLoaded ?? 0)],["Model rows", String(result.pipeline?.modelContextRows ?? 0)],["Home sample", String(result.pipeline?.homeSample ?? 0)],["Away sample", String(result.pipeline?.awaySample ?? 0)],["H2H sample", String(result.pipeline?.h2hSample ?? 0)],["Evidence mode", result.pipeline?.evidenceMode ?? "LIMITED"],["Generated", result.pipeline?.generatedAt ?? new Date().toISOString()]].map(([k,v]) => <div key={k} className="rounded border border-border bg-card p-3"><div className="label-xs">{k}</div><div className="mt-1 break-all text-xs font-medium">{v}</div></div>)}</div></section>
      </main>
    </div>
  );
}
function State({ title, text, back = false }: { title: string; text: string; back?: boolean }) { return <div className="mx-auto max-w-3xl px-5 py-16">{back && <Link to="/" className="label-xs">← HOME</Link>}<h1 className="mt-5 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p></div>; }
function MarketCard({ market }: { market: MarketSignal }) { return <div className="panel p-4"><div className="label-xs">{market.market}</div><div className="mt-2 text-lg font-semibold">{market.selection}</div><div className="mt-1 text-xs text-muted-foreground">{Math.round(market.probability * 100)}% · {market.rationale}</div></div>; }
function HealthStat({ label, value }: { label: string; value: string }) { return <div className="rounded border border-border bg-card p-3"><div className="label-xs">{label}</div><div className="mt-1 font-semibold">{value}</div></div>; }
