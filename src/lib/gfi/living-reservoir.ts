import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canonicalCompetitionName, canonicalTeamKey, canonicalTeamName } from "./identity";
import type { MatchRow } from "./intelligence";
import { researchTeamOrFixture } from "./research-orchestrator";

function env(name: string) {
  return typeof process === "undefined" ? "" : (process.env[name] ?? "");
}

function admin(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function dateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value.slice(0, 10);
  const y = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${String(y).padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function matchKey(match: MatchRow) {
  return `${dateKey(match.date)}|${canonicalTeamKey(match.home)}|${canonicalTeamKey(match.away)}`;
}

function kickoff(match: MatchRow) {
  const d = dateKey(match.date);
  const t = (match.time ?? "12:00").slice(0, 5);
  return `${d}T${/^\d{2}:\d{2}$/.test(t) ? t : "12:00"}:00Z`;
}

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function writeObservation(
  db: SupabaseClient,
  source: string,
  dataset: string,
  entityType: string,
  entityKey: string,
  payload: unknown,
  quality: number,
) {
  await db.from("source_observations").upsert(
    {
      source,
      source_family: source === "research-orchestrator" ? "public-research" : "fixture-discovery",
      source_record_id: hash(`${source}|${dataset}|${entityType}|${entityKey}`),
      dataset,
      entity_type: entityType,
      entity_key: entityKey,
      payload,
      content_hash: hash(JSON.stringify(payload)),
      quality,
      observed_at: new Date().toISOString(),
    },
    { onConflict: "source,dataset,source_record_id,entity_type,entity_key" },
  );
}

async function refreshCell(db: SupabaseClient, fixture: MatchRow) {
  const home = canonicalTeamName(fixture.home);
  const away = canonicalTeamName(fixture.away);
  const homeKey = canonicalTeamKey(home);
  const awayKey = canonicalTeamKey(away);
  const key = matchKey({ ...fixture, home, away });
  const researched = await researchTeamOrFixture(
    `${home} vs ${away} ${dateKey(fixture.date)}`,
  ).catch(() => undefined);
  const evidenceCount = researched?.matches.length ?? 0;
  const sources = researched?.sources ?? [];
  const completeness = Math.min(
    100,
    Math.round((researched?.coverage ?? 0) * 0.7 + Math.min(30, sources.length * 6)),
  );
  const now = new Date().toISOString();
  await db.from("match_intelligence_cells").upsert(
    {
      match_key: key,
      home_team_key: homeKey,
      away_team_key: awayKey,
      home_team_name: home,
      away_team_name: away,
      competition: canonicalCompetitionName(fixture.league),
      kickoff: kickoff(fixture),
      observed_at: now,
      last_mined_at: now,
      next_mine_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      evidence_count: evidenceCount,
      source_count: sources.length,
      completeness,
      status: "ACTIVE",
      summary: {
        fixture,
        sources,
        researchedMatches: evidenceCount,
        coverage: researched?.coverage ?? 0,
        minedAt: now,
      },
      updated_at: now,
    },
    { onConflict: "match_key" },
  );
  await writeObservation(
    db,
    "research-orchestrator",
    "living-match-research",
    "match",
    key,
    researched ?? { matches: [] },
    Math.max(0.5, completeness / 100),
  );

  for (const [teamKey, teamName] of [
    [homeKey, home],
    [awayKey, away],
  ] as const) {
    const history = (researched?.matches ?? []).filter(
      (m) => canonicalTeamKey(m.home) === teamKey || canonicalTeamKey(m.away) === teamKey,
    );
    await db.from("team_intelligence_cells").upsert(
      {
        team_key: teamKey,
        team_name: teamName,
        observed_at: now,
        last_mined_at: now,
        evidence_count: history.length,
        source_count: sources.length,
        completeness: Math.min(
          100,
          Math.round((researched?.coverage ?? 0) * 0.8 + Math.min(20, sources.length * 5)),
        ),
        status: "ACTIVE",
        summary: {
          team: teamName,
          recentHistoryCount: history.length,
          upcomingFixture: key,
          sources,
          minedAt: now,
        },
        updated_at: now,
      },
      { onConflict: "team_key" },
    );
    await writeObservation(
      db,
      "research-orchestrator",
      "living-team-research",
      "team",
      teamKey,
      { team: teamName, matches: history, sources },
      Math.max(0.5, (researched?.coverage ?? 0) / 100),
    );
  }

  return { key, evidenceCount, sources: sources.length, completeness };
}

export async function mineLivingReservoir(fixtures: MatchRow[], budget = 20) {
  const db = admin();
  if (!db || !fixtures.length)
    return {
      configured: Boolean(db),
      requested: fixtures.length,
      processed: 0,
      evidence: 0,
      sources: 0,
    };
  const now = Date.now();
  const selected = [...new Map(fixtures.map((f) => [matchKey(f), f])).values()]
    .filter((f) => f.hg === undefined || f.ag === undefined)
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)))
    .slice(0, Math.max(1, Math.min(budget, 60)));
  const run = await db
    .from("evidence_mining_runs")
    .insert({
      run_type: "LIVING_FIXTURE_WARM",
      requested_count: selected.length,
      status: "RUNNING",
      detail: {},
    })
    .select("id")
    .maybeSingle();
  let processed = 0,
    evidence = 0,
    sources = 0;
  for (let i = 0; i < selected.length; i += 4) {
    const batch = selected.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((fixture) => refreshCell(db, fixture)));
    for (const result of results) {
      if (result.status === "fulfilled") {
        processed += 1;
        evidence += result.value.evidenceCount;
        sources += result.value.sources;
      }
    }
  }
  if (run.data?.id) {
    await db
      .from("evidence_mining_runs")
      .update({
        processed_count: processed,
        evidence_found: evidence,
        sources_with_data: sources,
        finished_at: new Date().toISOString(),
        status: "SUCCESS",
        detail: { durationMs: Date.now() - now },
      })
      .eq("id", run.data.id);
  }
  return { configured: true, requested: selected.length, processed, evidence, sources };
}

export const refreshLivingReservoir = createServerFn({ method: "POST" })
  .validator((input: { fixtures: MatchRow[]; budget?: number }) => input)
  .handler(async ({ data }) => mineLivingReservoir(data.fixtures, data.budget ?? 20));

export const livingReservoirStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = admin();
  if (!db) return { configured: false, teams: 0, matches: 0, observations: 0, lastMinedAt: null };
  const [teams, matches, observations] = await Promise.all([
    db.from("team_intelligence_cells").select("team_key", { count: "exact", head: true }),
    db.from("match_intelligence_cells").select("match_key", { count: "exact", head: true }),
    db.from("source_observations").select("id", { count: "exact", head: true }),
  ]);
  const latest = await db
    .from("match_intelligence_cells")
    .select("last_mined_at")
    .order("last_mined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    configured: true,
    teams: teams.count ?? 0,
    matches: matches.count ?? 0,
    observations: observations.count ?? 0,
    lastMinedAt: latest.data?.last_mined_at ?? null,
  };
});
