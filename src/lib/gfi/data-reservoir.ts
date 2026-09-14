import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MatchRow } from "./intelligence";

export type ReservoirMatch = MatchRow & {
  reservoirId?: string;
  competition?: string;
  competitionCode?: string;
  season?: string;
};

export type ReservoirStats = {
  configured: boolean;
  teams: number;
  competitions: number;
  matches: number;
  observations: number;
  lastIngest?: string;
};

function env(name: string) {
  if (typeof process === "undefined") return "";
  return process.env[name] ?? "";
}

function adminClient(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function readClient(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown-team";
}

function canonicalName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/\b(sporting clube|sporting club|football club|football|club)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function seasonCode(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (!year) return "GLOBAL";
  const start = month >= 7 ? year : year - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

function sourceKey(row: MatchRow) {
  return `${row.source ?? "unknown"}|${row.sourceId ?? ""}|${row.date}|${canonicalName(row.home)}|${canonicalName(row.away)}|${row.time ?? ""}`;
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function kickoff(row: MatchRow) {
  if (row.time && /^\d{1,2}:\d{2}/.test(row.time)) return `${row.date}T${row.time.slice(0, 5)}:00Z`;
  return `${row.date}T12:00:00Z`;
}

async function resolveTeams(db: SupabaseClient, names: string[], source: string) {
  const ids = new Map<string, string>();
  for (const name of [...new Set(names)]) {
    const { data: existing, error: lookupError } = await db.from("teams").select("id,name").eq("name", name).maybeSingle();
    if (lookupError) throw lookupError;
    let id = existing?.id as string | undefined;
    if (!id) {
      const { data: inserted, error } = await db.from("teams").insert({ name, slug: `${slug(name)}-${simpleHash(name).slice(0, 6)}` }).select("id").single();
      if (error) throw error;
      id = inserted.id as string;
    }
    ids.set(name, id);
    const normalized = canonicalName(name);
    await db.from("team_aliases").upsert({ team_id: id, alias: name, normalized_alias: normalized, source, confidence: 1 }, { onConflict: "normalized_alias,source" });
  }
  return ids;
}

async function resolveCompetitions(db: SupabaseClient, rows: MatchRow[]) {
  const ids = new Map<string, string>();
  const unique = new Map<string, { code: string; season: string; name: string; source: string }>();
  for (const row of rows) {
    const name = row.league ?? "Worldwide Football";
    const code = row.code ?? `G${simpleHash(name).slice(0, 7).toUpperCase()}`;
    const season = seasonCode(row.date);
    unique.set(`${code}|${season}`, { code, season, name, source: row.source ?? "unknown" });
  }
  for (const value of unique.values()) {
    const { data, error } = await db.from("competitions").upsert(value, { onConflict: "code,season" }).select("id,code,season").single();
    if (error) throw error;
    ids.set(`${value.code}|${value.season}`, data.id as string);
  }
  return ids;
}

export async function ingestReservoirMatches(rows: MatchRow[], dataset = "fixtures") {
  const db = adminClient();
  if (!db || !rows.length) return { configured: Boolean(db), inserted: 0 };

  const sourceGroups = new Map<string, MatchRow[]>();
  for (const row of rows) {
    const list = sourceGroups.get(row.source ?? "unknown") ?? [];
    list.push(row);
    sourceGroups.set(row.source ?? "unknown", list);
  }

  let inserted = 0;
  for (const [source, sourceRows] of sourceGroups) {
    try {
      const teams = await resolveTeams(db, sourceRows.flatMap((r) => [r.home, r.away]), source);
      const competitions = await resolveCompetitions(db, sourceRows);
      const payload = sourceRows.map((row) => {
        const code = row.code ?? `G${simpleHash(row.league ?? "Worldwide Football").slice(0, 7).toUpperCase()}`;
        const season = seasonCode(row.date);
        return {
          competition_id: competitions.get(`${code}|${season}`),
          home_team_id: teams.get(row.home),
          away_team_id: teams.get(row.away),
          kickoff: kickoff(row),
          status: row.hg !== undefined && row.ag !== undefined ? "FINISHED" : "SCHEDULED",
          ft_home: row.hg ?? null,
          ft_away: row.ag ?? null,
          source,
        };
      }).filter((row) => row.competition_id && row.home_team_id && row.away_team_id);

      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await db.from("matches").upsert(chunk, { onConflict: "competition_id,home_team_id,away_team_id,kickoff" });
        if (error) throw error;
        inserted += chunk.length;
      }

      const observationRows = sourceRows.map((row) => ({
        source,
        source_family: source === "football-data" ? "historical-results" : "fixture-discovery",
        source_record_id: row.sourceId ?? simpleHash(sourceKey(row)),
        dataset,
        entity_type: "fixture",
        entity_key: `${row.date}|${canonicalName(row.home)}|${canonicalName(row.away)}`,
        payload: row,
        content_hash: simpleHash(JSON.stringify(row)),
        quality: row.hg !== undefined && row.ag !== undefined ? 0.95 : 0.75,
        observed_at: new Date().toISOString(),
      }));
      for (let i = 0; i < observationRows.length; i += 500) {
        const { error } = await db.from("source_observations").upsert(observationRows.slice(i, i + 500), { onConflict: "source,dataset,source_record_id,entity_type,entity_key" });
        if (error) throw error;
      }

      await db.from("ingest_runs").insert({ source, dataset, status: "SUCCESS", matches_ingested: sourceRows.length, detail: `Reservoir ingestion completed for ${source}.` });
    } catch (error) {
      await db.from("ingest_runs").insert({ source, dataset, status: "FAILED", matches_ingested: 0, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { configured: true, inserted };
}

export const syncReservoir = createServerFn({ method: "POST" })
  .validator((input: { rows: MatchRow[]; dataset?: string }) => input)
  .handler(async ({ data }) => ingestReservoirMatches(data.rows, data.dataset ?? "fixtures"));

export const reservoirStats = createServerFn({ method: "GET" }).handler(async (): Promise<ReservoirStats> => {
  const db = readClient() ?? adminClient();
  if (!db) return { configured: false, teams: 0, competitions: 0, matches: 0, observations: 0 };
  const [teams, competitions, matches, observations] = await Promise.all([
    db.from("teams").select("id", { count: "exact", head: true }),
    db.from("competitions").select("id", { count: "exact", head: true }),
    db.from("matches").select("id", { count: "exact", head: true }),
    db.from("source_observations").select("id", { count: "exact", head: true }),
  ]);
  const { data: latest } = await db.from("ingest_runs").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { configured: true, teams: teams.count ?? 0, competitions: competitions.count ?? 0, matches: matches.count ?? 0, observations: observations.count ?? 0, lastIngest: latest?.created_at };
});

export const searchReservoir = createServerFn({ method: "GET" })
  .validator((input: { query: string; limit?: number }) => input)
  .handler(async ({ data }): Promise<ReservoirMatch[]> => {
    const db = readClient() ?? adminClient();
    const query = data.query.trim();
    if (!db || !query) return [];
    const needle = canonicalName(query);
    const { data: teams } = await db.from("teams").select("id,name").ilike("name", `%${query}%`).limit(20);
    const aliases = await db.from("team_aliases").select("team_id,alias").ilike("normalized_alias", `%${needle}%`).limit(20);
    const teamIds = [...new Set([...(teams ?? []).map((t) => t.id), ...(aliases.data ?? []).map((a) => a.team_id)])];
    if (!teamIds.length) return [];
    const clauses = teamIds.flatMap((id) => [`home_team_id.eq.${id}`, `away_team_id.eq.${id}`]).join(",");
    const { data: matches, error } = await db.from("matches").select("id,competition_id,home_team_id,away_team_id,kickoff,status,ft_home,ft_away,source").or(clauses).order("kickoff", { ascending: false }).limit(Math.max(20, Math.min(data.limit ?? 200, 1000)));
    if (error || !matches?.length) return [];
    const teamLookup = new Map<string, string>((teams ?? []).map((t) => [t.id, t.name]));
    const missingTeamIds = [...new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id]).filter((id) => !teamLookup.has(id)))];
    if (missingTeamIds.length) {
      const extra = await db.from("teams").select("id,name").in("id", missingTeamIds);
      for (const t of extra.data ?? []) teamLookup.set(t.id, t.name);
    }
    const competitionIds = [...new Set(matches.map((m) => m.competition_id))];
    const competitions = await db.from("competitions").select("id,name,code,season").in("id", competitionIds);
    const competitionLookup = new Map((competitions.data ?? []).map((c) => [c.id, c]));
    return matches.map((m) => {
      const competition = competitionLookup.get(m.competition_id);
      const kickoffDate = String(m.kickoff).slice(0, 10);
      const kickoffTime = String(m.kickoff).slice(11, 16);
      const hg = typeof m.ft_home === "number" ? m.ft_home : undefined;
      const ag = typeof m.ft_away === "number" ? m.ft_away : undefined;
      return {
        reservoirId: m.id,
        date: kickoffDate,
        time: kickoffTime,
        home: teamLookup.get(m.home_team_id) ?? "Unknown",
        away: teamLookup.get(m.away_team_id) ?? "Unknown",
        hg,
        ag,
        result: hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined,
        league: competition?.name ?? "Worldwide Football",
        competition: competition?.name,
        competitionCode: competition?.code,
        code: competition?.code,
        season: competition?.season,
        source: m.source,
      } satisfies ReservoirMatch;
    });
  });

export async function reservoirHistoricalContext(home: string, away: string, limit = 240) {
  const [homeRows, awayRows] = await Promise.all([
    searchReservoir({ data: { query: home, limit } }),
    searchReservoir({ data: { query: away, limit } }),
  ]);
  const merged = new Map<string, ReservoirMatch>();
  for (const row of [...homeRows, ...awayRows]) merged.set(`${row.date}|${row.home}|${row.away}|${row.hg ?? ""}|${row.ag ?? ""}|${row.source ?? ""}`, row);
  return [...merged.values()].sort((a, b) => `${a.date}|${a.time ?? ""}`.localeCompare(`${b.date}|${b.time ?? ""}`));
}
