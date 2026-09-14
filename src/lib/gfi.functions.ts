import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { providers } = await import("./gfi.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const counts = await Promise.all(
    (
      [
        "competitions",
        "teams",
        "matches",
        "snapshots",
        "predictions",
        "engine_predictions",
      ] as const
    ).map(async (t) => {
      const { count } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    }),
  );
  const { data: runs } = await supabaseAdmin
    .from("ingest_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  const { count: openPredictions } = await supabaseAdmin
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("status", "OPEN");
  const { count: upcoming } = await supabaseAdmin
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("status", "SCHEDULED");

  return {
    providers: providers(),
    counts: Object.fromEntries(counts) as Record<string, number>,
    ingestRuns: runs ?? [],
    openPredictions: openPredictions ?? 0,
    upcoming: upcoming ?? 0,
    checkedAt: new Date().toISOString(),
  };
});

export const ingestData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ seasons: z.array(z.string()).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { ingestOpenFootball } = await import("./gfi.server");
    return ingestOpenFootball(data.seasons);
  });

export const searchFixtures = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ query: z.string().min(2).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const { resolveFixtures } = await import("./gfi.server");
    return resolveFixtures(data.query);
  });

export const listFixtures = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        scope: z.enum(["upcoming", "recent"]).default("upcoming"),
        limit: z.number().min(1).max(60).default(24),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listSelect, mapRows } = await import("./gfi.list.server");
    const now = new Date().toISOString();
    const q = supabaseAdmin.from("matches").select(listSelect);
    const { data: rows } =
      data.scope === "upcoming"
        ? await q.gte("kickoff", now).order("kickoff", { ascending: true }).limit(data.limit)
        : await q.eq("status", "FINISHED").order("kickoff", { ascending: false }).limit(data.limit);
    return mapRows(rows ?? []);
  });

export const analyzeMatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ matchId: z.string().uuid(), runs: z.number().min(1000).max(200000).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { analyzeAndStore } = await import("./gfi.server");
    const { snapshotId, match, result } = await analyzeAndStore(data.matchId, data.runs ?? 50000);
    return { snapshotId, match, result };
  });

export const getMatchIntelligence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ matchId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getMatchDTO } = await import("./gfi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const match = await getMatchDTO(data.matchId);
    if (!match) return { match: null, snapshot: null };
    const { data: snapshot } = await supabaseAdmin
      .from("snapshots")
      .select("*")
      .eq("match_id", data.matchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { match, snapshot };
  });

export const batchAnalyze = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ matchIds: z.array(z.string().uuid()).min(1).max(24), runs: z.number().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { analyzeAndStore } = await import("./gfi.server");
    const runs = data.runs ?? 20000;
    const concurrency = 3;
    const results: {
      matchId: string;
      ok: boolean;
      error?: string;
      label?: string;
      competition?: string;
      kickoff?: string;
      verdict?: string;
      market?: string;
      probability?: number;
      consensus?: number;
      stability?: number;
      dataQuality?: number;
    }[] = [];
    const queue = [...data.matchIds];

    async function worker() {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        try {
          const { match, result } = await analyzeAndStore(id, runs);
          const best = result.outcomes[0]!;
          results.push({
            matchId: id,
            ok: true,
            label: `${match.homeName} vs ${match.awayName}`,
            competition: match.competition,
            kickoff: match.kickoff,
            verdict: result.verdict.headline,
            market: best.label,
            probability: best.probability,
            consensus: best.consensus,
            stability: best.stability,
            dataQuality: result.dataQuality,
          });
        } catch (e) {
          results.push({
            matchId: id,
            ok: false,
            error: e instanceof Error ? e.message : "Analysis failed",
          });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, data.matchIds.length) }, worker));
    return { results };
  });

export const runSimulation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        matchId: z.string().uuid(),
        runs: z.number().min(1000).max(200000).default(50000),
        lambdaHome: z.number().min(0.1).max(5).optional(),
        lambdaAway: z.number().min(0.1).max(5).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getMatchDTO, loadHistoryFor, toTarget } = await import("./gfi.server");
    const { buildFeatures } = await import("./intel/features");
    const { runEngineArena } = await import("./intel/engines");
    const { ensembleEngines } = await import("./intel/consensus");
    const { simulateMatch } = await import("./intel/simulate");
    const { hashString } = await import("./intel/math");

    const match = await getMatchDTO(data.matchId);
    if (!match) throw new Error("Match not found");
    const history = await loadHistoryFor(match);
    const features = buildFeatures(toTarget(match), history);
    const base = ensembleEngines(runEngineArena(features, null)).lambdas;
    const lh = data.lambdaHome ?? base.home;
    const la = data.lambdaAway ?? base.away;
    const sim = simulateMatch(
      lh,
      la,
      data.runs,
      hashString(`${data.matchId}:${lh}:${la}:${data.runs}`),
    );
    return { match, baseLambdas: base, lambdas: { home: lh, away: la }, simulation: sim };
  });

export const listPredictions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["ALL", "OPEN", "SETTLED"]).default("ALL"),
        headlineOnly: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("predictions")
      .select(
        "id,market,selection,probability,fair_odds,confidence,stability,consensus,status,outcome,brier,log_loss,created_at,settled_at,is_headline,match_id",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "ALL") q = q.eq("status", data.status);
    if (data.headlineOnly) q = q.eq("is_headline", true);
    const { data: rows } = await q;
    const ids = [...new Set((rows ?? []).map((r) => r.match_id))];
    const { listSelect, mapRows } = await import("./gfi.list.server");
    const { data: matchRows } = ids.length
      ? await supabaseAdmin.from("matches").select(listSelect).in("id", ids)
      : { data: [] };
    const matches = Object.fromEntries(mapRows(matchRows ?? []).map((m) => [m.id, m]));
    return { predictions: rows ?? [], matches };
  });

export const settlePredictions = createServerFn({ method: "POST" }).handler(async () => {
  const { settleAll } = await import("./gfi.server");
  return settleAll();
});

export const getModelPerformance = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("engine_predictions")
    .select("engine,market,probability,outcome,brier,log_loss,competition_id")
    .eq("status", "SETTLED")
    .limit(20000);

  const byEngine = new Map<string, { n: number; brier: number; logLoss: number; hits: number }>();
  const byMarket = new Map<string, { n: number; brier: number; logLoss: number; hits: number }>();
  const buckets = Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, actual: 0 }));

  for (const r of rows ?? []) {
    const p = Number(r.probability);
    const hit = r.outcome ? 1 : 0;
    const add = (
      m: Map<string, { n: number; brier: number; logLoss: number; hits: number }>,
      key: string,
    ) => {
      const cur = m.get(key) ?? { n: 0, brier: 0, logLoss: 0, hits: 0 };
      cur.n++;
      cur.brier += Number(r.brier ?? 0);
      cur.logLoss += Number(r.log_loss ?? 0);
      cur.hits += p >= 0.5 ? hit : 1 - hit;
      m.set(key, cur);
    };
    add(byEngine, r.engine);
    add(byMarket, r.market);
    const b = buckets[Math.min(9, Math.floor(p * 10))]!;
    b.n++;
    b.predicted += p;
    b.actual += hit;
  }

  const shape = (m: Map<string, { n: number; brier: number; logLoss: number; hits: number }>) =>
    [...m.entries()]
      .map(([key, v]) => ({
        key,
        samples: v.n,
        brier: v.brier / v.n,
        logLoss: v.logLoss / v.n,
        accuracy: v.hits / v.n,
      }))
      .sort((a, b) => a.brier - b.brier);

  return {
    engines: shape(byEngine),
    markets: shape(byMarket),
    calibration: buckets.map((b, i) => ({
      bucket: `${i * 10}-${i * 10 + 10}%`,
      samples: b.n,
      predicted: b.n ? b.predicted / b.n : 0,
      actual: b.n ? b.actual / b.n : 0,
    })),
    totalSettled: (rows ?? []).length,
  };
});

export const getAuditRows = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("predictions")
    .select(
      "id,match_id,market,selection,probability,outcome,brier,log_loss,settled_at,is_headline",
    )
    .eq("status", "SETTLED")
    .order("settled_at", { ascending: false })
    .limit(200);
  const ids = [...new Set((rows ?? []).map((r) => r.match_id))];
  const { listSelect, mapRows } = await import("./gfi.list.server");
  const { data: matchRows } = ids.length
    ? await supabaseAdmin.from("matches").select(listSelect).in("id", ids)
    : { data: [] };
  const matches = Object.fromEntries(mapRows(matchRows ?? []).map((m) => [m.id, m]));

  const { data: engineRows } = await supabaseAdmin
    .from("engine_predictions")
    .select("engine,match_id,market,probability,outcome,brier")
    .eq("status", "SETTLED")
    .in("match_id", ids.slice(0, 40))
    .limit(6000);

  return { predictions: rows ?? [], matches, engineRows: engineRows ?? [] };
});

export const listEvidenceSnapshots = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("snapshots")
    .select("id,match_id,created_at,evidence,source_health,data_quality,version")
    .order("created_at", { ascending: false })
    .limit(25);
  const ids = [...new Set((rows ?? []).map((r) => r.match_id))];
  const { listSelect, mapRows } = await import("./gfi.list.server");
  const { data: matchRows } = ids.length
    ? await supabaseAdmin.from("matches").select(listSelect).in("id", ids)
    : { data: [] };
  return {
    snapshots: rows ?? [],
    matches: Object.fromEntries(mapRows(matchRows ?? []).map((m) => [m.id, m])),
  };
});

export const listEngineSnapshots = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("snapshots")
    .select(
      "id,match_id,created_at,engines,conflicts,consensus,stability,data_quality,version,verdict",
    )
    .order("created_at", { ascending: false })
    .limit(15);
  const ids = [...new Set((rows ?? []).map((r) => r.match_id))];
  const { listSelect, mapRows } = await import("./gfi.list.server");
  const { data: matchRows } = ids.length
    ? await supabaseAdmin.from("matches").select(listSelect).in("id", ids)
    : { data: [] };
  return {
    snapshots: rows ?? [],
    matches: Object.fromEntries(mapRows(matchRows ?? []).map((m) => [m.id, m])),
  };
});
