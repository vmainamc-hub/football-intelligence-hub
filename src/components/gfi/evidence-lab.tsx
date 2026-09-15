import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { runBatchAnalysis } from "@/lib/gfi/batch-analysis";
import { UNIVERSAL_SOURCES } from "@/lib/gfi/universal-sources";

export function EvidenceLab() {
  const q = useQuery({
    queryKey: ["evidence-lab"],
    queryFn: () => runBatchAnalysis({ data: { limit: 12, includeUpcoming: true } }),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
      <Link to="/" className="label-xs">
        ← HOME
      </Link>
      <header className="mt-7 border-b border-border pb-6">
        <div className="label-xs text-primary">EVIDENCE GRAPH</div>
        <h1 className="mt-2 text-3xl font-semibold">Evidence Intelligence</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          See what the system actually received, what the engines derived, and which external
          domains are connected versus merely reserved.
        </p>
      </header>
      <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="panel p-5">
          <div className="label-xs">SOURCE REGISTRY</div>
          {UNIVERSAL_SOURCES.map((s) => (
            <div key={s.name} className="mt-3 border-b border-border pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2 text-sm">
                <b>{s.name}</b>
                <span className="label-xs">{s.configured ? "CONNECTED" : "OFFLINE"}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {s.role} · {s.free ? "free" : "paid"}
              </div>
            </div>
          ))}
        </div>
        <div>
          {q.isLoading && (
            <div className="panel p-8 text-sm text-muted-foreground">
              Collecting source-backed match evidence…
            </div>
          )}
          {q.error && (
            <div className="panel p-8">
              <AlertTriangle className="size-5 text-warning" />
              <p className="mt-2 text-sm">Evidence scan failed.</p>
              <button
                onClick={() => q.refetch()}
                className="mt-4 inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm"
              >
                <RefreshCw className="size-4" /> Retry
              </button>
            </div>
          )}
          {q.data && (
            <div className="grid gap-4">
              {q.data.map((r) => (
                <div
                  key={`${r.fixture.date}-${r.fixture.home}-${r.fixture.away}`}
                  className="panel p-5"
                >
                  <div className="flex justify-between gap-3">
                    <b>
                      {r.fixture.home} vs {r.fixture.away}
                    </b>
                    <span className="label-xs">
                      {r.fixture.source ?? "public"} · {r.fixture.league}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {r.analysis.evidenceLedger.slice(0, 6).map((e, idx) => (
                      <div
                        key={`${e.id}-${idx}`}
                        className="border border-border p-3 text-xs text-muted-foreground"
                      >
                        <div className="label-xs mb-2">{e.source}</div>
                        {e.statement}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                    {r.analysis.pipeline.historicalRowsLoaded} rows loaded across assembled sources
                    · {r.analysis.pipeline.targetCompetitionRows} target-competition rows ·{" "}
                    {r.analysis.pipeline.modelContextRows} model-context rows ·{" "}
                    {r.analysis.pipeline.homeSample} direct home-team observations ·{" "}
                    {r.analysis.pipeline.awaySample} direct away-team observations ·{" "}
                    {r.analysis.engines.length} engine outputs · evidence mode{" "}
                    {r.analysis.pipeline.evidenceMode}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
