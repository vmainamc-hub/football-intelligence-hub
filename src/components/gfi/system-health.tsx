import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Globe2, History } from "lucide-react";
import { runBatchAnalysis, type BatchAnalysisRow } from "@/lib/gfi/batch-analysis";
import { inspectSystem } from "@/lib/gfi/source-registry";
import { reservoirStats, syncReservoir } from "@/lib/gfi/data-reservoir";
import { inspectReservoir } from "@/lib/gfi/reservoir-diagnostics";
import { harvestHistoricalSeasons } from "@/lib/gfi/historical-harvest";
import {
  discoverOpenFootballUniverse,
  harvestOpenFootballUniverse,
} from "@/lib/gfi/global-openfootball";

export function SystemHealth() {
  const pipeline = useQuery({
    queryKey: ["system-health", "pipeline"],
    queryFn: () => runBatchAnalysis({ data: { limit: 1, includeUpcoming: true } }),
    staleTime: 2 * 60_000,
  });
  const sources = useQuery({
    queryKey: ["system-health", "sources"],
    queryFn: inspectSystem,
    staleTime: 2 * 60_000,
  });
  const reservoir = useQuery({
    queryKey: ["system-health", "reservoir"],
    queryFn: reservoirStats,
    staleTime: 2 * 60_000,
  });
  const reservoirCheck = useQuery({
    queryKey: ["system-health", "reservoir-check"],
    queryFn: inspectReservoir,
    staleTime: 2 * 60_000,
  });
  const discovery = useQuery({
    queryKey: ["system-health", "global-discovery"],
    queryFn: discoverOpenFootballUniverse,
    staleTime: 30 * 60_000,
  });

  const harvest = useMutation({
    mutationFn: async () => {
      const result = await harvestOpenFootballUniverse({ data: { limit: 120, offset: 0 } });
      return syncReservoir({
        data: { rows: result.matches, dataset: "openfootball-global-harvest" },
      });
    },
    onSuccess: () => {
      reservoir.refetch();
      reservoirCheck.refetch();
      sources.refetch();
    },
  });
  const historical = useMutation({
    mutationFn: () => harvestHistoricalSeasons({ data: { seasons: ["2627", "2526", "2425"] } }),
    onSuccess: () => {
      reservoir.refetch();
      reservoirCheck.refetch();
      sources.refetch();
    },
  });
  const refresh = () => {
    pipeline.refetch();
    sources.refetch();
    reservoir.refetch();
    reservoirCheck.refetch();
    discovery.refetch();
  };
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
      <Link to="/" className="label-xs">
        ← HOME
      </Link>
      <header className="mt-7 border-b border-border pb-6">
        <div className="label-xs text-primary">SYSTEM HEALTH</div>
        <h1 className="mt-2 text-3xl font-semibold">Operational status</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Runtime health is measured from production services and the persistent football reservoir.
          Data collection is designed to be free-first, multi-source and incremental.
        </p>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="label-xs">LIVE PIPELINE CHECK</div>
            <button onClick={refresh} className="rounded border border-border p-2">
              <RefreshCw className="size-4" />
            </button>
          </div>
          {pipeline.isLoading && (
            <div className="mt-5 text-sm text-muted-foreground">
              Running live pipeline health check…
            </div>
          )}
          {pipeline.error && (
            <div className="mt-5 flex gap-3 text-sm">
              <AlertTriangle className="size-5 text-warning" /> Backend pipeline unavailable:{" "}
              {String(pipeline.error)}
            </div>
          )}
          {rowCard(pipeline.data?.[0])}
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <div className="label-xs">RESERVOIR STATUS</div>
          </div>
          {reservoirCheck.data && (
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Project</span>
                <span className="font-medium">
                  {reservoirCheck.data.project || "not configured"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Server secret</span>
                <span
                  className={
                    reservoirCheck.data.serverSecretConfigured ? "text-positive" : "text-warning"
                  }
                >
                  {reservoirCheck.data.serverSecretConfigured ? "READY" : "MISSING"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Schema</span>
                <span
                  className={reservoirCheck.data.schemaReady ? "text-positive" : "text-warning"}
                >
                  {reservoirCheck.data.schemaReady
                    ? "READY"
                    : `MISSING ${reservoirCheck.data.missingTables.length}`}
                </span>
              </div>
            </div>
          )}
          {reservoir.data?.configured && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["TEAMS", reservoir.data.teams],
                ["COMPETITIONS", reservoir.data.competitions],
                ["MATCHES", reservoir.data.matches],
                ["OBSERVATIONS", reservoir.data.observations],
              ].map(([k, v]) => (
                <div key={String(k)} className="border border-border p-3">
                  <div className="label-xs">{k}</div>
                  <div className="metric mt-1">{v}</div>
                </div>
              ))}
            </div>
          )}
          {reservoirCheck.data?.missingTables.length ? (
            <div className="mt-4 text-xs text-warning">
              Database schema is not fully deployed. Missing:{" "}
              {reservoirCheck.data.missingTables.join(", ")}
            </div>
          ) : null}
          {reservoirCheck.data?.errors.length ? (
            <div className="mt-4 text-xs text-warning">
              {reservoirCheck.data.errors.join(" · ")}
            </div>
          ) : null}
          {reservoir.data?.lastIngest && (
            <div className="mt-3 text-xs text-muted-foreground">
              Last ingestion: {new Date(reservoir.data.lastIngest).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      <div className="panel mt-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="label-xs">HISTORICAL DATA DEPTH</div>
            <div className="mt-2 text-sm font-medium">
              Football-Data multi-season reservoir bootstrap
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Populate the analytical reservoir with three seasons of the supported free historical
              leagues.
            </div>
          </div>
          <button
            disabled={
              historical.isPending ||
              !reservoirCheck.data?.schemaReady ||
              !reservoirCheck.data?.serverSecretConfigured
            }
            onClick={() => historical.mutate()}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs text-primary-foreground"
          >
            <History className="size-4" />
            {historical.isPending ? "Loading history…" : "Load 3 seasons"}
          </button>
        </div>
        {historical.data && (
          <div className="mt-4 text-xs text-muted-foreground">
            Historical harvest: {historical.data.matches.toLocaleString()} matches,{" "}
            {historical.data.teams.toLocaleString()} teams,{" "}
            {historical.data.competitions.toLocaleString()} competition-season datasets from{" "}
            {historical.data.successful}/{historical.data.requested} source files.
          </div>
        )}
        {historical.error && (
          <div className="mt-4 text-xs text-warning">
            Historical harvest error: {String(historical.error)}
          </div>
        )}
      </div>

      <div className="panel mt-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="label-xs">GLOBAL DATA HARVEST</div>
            <div className="mt-2 text-sm font-medium">OpenFootball public universe discovery</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {discovery.isLoading
                ? "Discovering public datasets…"
                : `${discovery.data?.length ?? 0} dataset files discovered across the OpenFootball organization.`}
            </div>
          </div>
          <button
            disabled={
              harvest.isPending ||
              !discovery.data?.length ||
              !reservoirCheck.data?.schemaReady ||
              !reservoirCheck.data?.serverSecretConfigured
            }
            onClick={() => harvest.mutate()}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs text-primary-foreground"
          >
            <Globe2 className="size-4" />
            {harvest.isPending ? "Harvesting…" : "Harvest global data"}
          </button>
        </div>
        {harvest.data && (
          <div className="mt-4 text-xs text-muted-foreground">
            Global harvest completed: {harvest.data.inserted.toLocaleString()} rows written/updated
            in the reservoir.
          </div>
        )}
        {harvest.error && (
          <div className="mt-4 text-xs text-warning">
            Global harvest error: {String(harvest.error)}
          </div>
        )}
      </div>

      <div className="panel mt-5 p-5">
        <div className="label-xs">SOURCE FABRIC</div>
        {(sources.data ?? []).map((s) => (
          <div
            key={s.name}
            className="mt-3 flex items-start gap-3 border-b border-border pb-3 last:border-0"
          >
            <CheckCircle2
              className={`mt-0.5 size-4 ${s.status === "CONNECTED" ? "text-positive" : s.status === "FAILED" ? "text-warning" : "text-muted-foreground"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.role}
                {typeof s.observedRows === "number"
                  ? ` · ${s.observedRows.toLocaleString()} rows observed`
                  : ""}
              </div>
            </div>
            <span className="label-xs">{s.status}</span>
          </div>
        ))}
      </div>

      <div className="panel mt-5 p-5">
        <div className="label-xs text-primary">ARCHITECTURE CHECK</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Match, Batch, Engine Arena, Evidence, Simulation and Model Lab share the authoritative
          graph. Searches combine persistent reservoir history with live public-source discovery.
          Advanced engines receive synchronized historical evidence instead of maintaining separate
          data pipelines.
        </p>
      </div>
    </div>
  );
}

function rowCard(row?: BatchAnalysisRow | null) {
  if (!row) return null;
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["FIXTURE", "READY"],
        ["ENGINES", String(row.analysis.engines.length)],
        ["HISTORY", String(row.analysis.pipeline.historicalRowsLoaded)],
        ["SIMULATION", row.analysis.pipeline.simulation.iterations.toLocaleString() + " runs"],
        ["SOURCE", row.analysis.pipeline.source],
        ["COMPETITION GROUPS", String(row.analysis.pipeline.competitionsLoaded)],
        ["QUALITY", String(row.analysis.quality)],
        ["EVIDENCE", row.analysis.pipeline.evidenceMode],
      ].map(([k, v], idx) => (
        <div key={`${k}-${idx}`} className="border border-border p-3">
          <div className="label-xs">{k}</div>
          <div className="mt-1 text-sm font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}
