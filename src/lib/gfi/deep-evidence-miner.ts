import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canonicalTeamKey, canonicalTeamName, canonicalCompetitionName } from "./identity";
import { searchReservoir, type ReservoirMatch } from "./data-reservoir";
import { researchTeamOrFixture } from "./research-orchestrator";
import { fetchGlobalFallbackFixtures } from "./fixture-sources";
import { fetchEspnFixtures } from "./espn-sources";
import { searchUniversalFixtures } from "./universal-sources";
import type { MatchRow } from "./intelligence";

function env(name: string) {
  return typeof process === "undefined" ? "" : process.env[name] ?? "";
}

function admin(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function dateKey(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return value.slice(0, 10);
  const year = match[3].length === 2 ? Number(match[3]) + 2000 : Number(match[3]);
  return `${String(year).padStart(4, "0")}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function key(match: MatchRow) {
  return `${dateKey(match.date)}|${canonicalTeamKey(match.home)}|${canonicalTeamKey(match.away)}`;
}

function pct(value: number) {
  return Number((value * 100).toFixed(2));
}

function resultForTeam(match: ReservoirMatch, teamKey: string) {
  const home = canonicalTeamKey(match.home) === teamKey;
  const gf = home ? match.hg : match.ag;
  const ga = home ? match.ag : match.hg;
  if (gf === undefined || ga === undefined) return undefined;
  return {
    gf,
    ga,
    win: gf > ga ? 1 : 0,
    draw: gf === ga ? 1 : 0,
    loss: gf < ga ? 1 : 0,
    points: gf > ga ? 3 : gf === ga ? 1 : 0,
    btts: gf > 0 && ga > 0 ? 1 : 0,
    over15: gf + ga >= 2 ? 1 : 0,
    over25: gf + ga >= 3 ? 1 : 0,
    over35: gf + ga >= 4 ? 1 : 0,
  };
}

function aggregate(teamName: string, matches: ReservoirMatch[], homeAway?: "HOME" | "AWAY") {
  const teamKey = canonicalTeamKey(teamName);
  const ordered = matches
    .filter((m) => {
      if (canonicalTeamKey(m.home) !== teamKey && canonicalTeamKey(m.away) !== teamKey) return false;
      if (homeAway === "HOME" && canonicalTeamKey(m.home) !== teamKey) return false;
      if (homeAway === "AWAY" && canonicalTeamKey(m.away) !== teamKey) return false;
      return m.hg !== undefined && m.ag !== undefined;
    })
    .sort((a, b) => `${dateKey(b.date)}|${b.time ?? ""}`.localeCompare(`${dateKey(a.date)}|${a.time ?? ""}`));
  const recent = ordered.slice(0, 20);
  const values = recent.map((m) => resultForTeam(m, teamKey)).filter(Boolean) as NonNullable<ReturnType<typeof resultForTeam>>[];
  const n = values.length || 1;
  const gf = values.reduce((s, x) => s + x.gf, 0);
  const ga = values.reduce((s, x) => s + x.ga, 0);
  return {
    team: canonicalTeamName(teamName),
    sample: values.length,
    wins: values.reduce((s, x) => s + x.win, 0),
    draws: values.reduce((s, x) => s + x.draw, 0),
    losses: values.reduce((s, x) => s + x.loss, 0),
    winRate: pct(values.reduce((s, x) => s + x.win, 0) / n),
    pointsPerGame: Number((values.reduce((s, x) => s + x.points, 0) / n).toFixed(3)),
    goalsForPerGame: Number((gf / n).toFixed(3)),
    goalsAgainstPerGame: Number((ga / n).toFixed(3)),
    bttsRate: pct(values.reduce((s, x) => s + x.btts, 0) / n),
    over15Rate: pct(values.reduce((s, x) => s + x.over15, 0) / n),
    over25Rate: pct(values.reduce((s, x) => s + x.over25, 0) / n),
    over35Rate: pct(values.reduce((s, x) => s + x.over35, 0) / n),
    recentResults: recent.slice(0, 8).map((m) => `${m.hg}-${m.ag}`),
  };
}

function h2hRows(home: string, away: string, matches: ReservoirMatch[]) {
  const hk = canonicalTeamKey(home);
  const ak = canonicalTeamKey(away);
  return matches
    .filter((m) =>
      (canonicalTeamKey(m.home) === hk && canonicalTeamKey(m.away) === ak) ||
      (canonicalTeamKey(m.home) === ak && canonicalTeamKey(m.away) === hk),
    )
    .filter((m) => m.hg !== undefined && m.ag !== undefined)
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    .slice(0, 20);
}

function uniqueRows(rows: MatchRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = `${dateKey(row.date)}|${canonicalTeamKey(row.home)}|${canonicalTeamKey(row.away)}|${row.hg ?? ""}|${row.ag ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sourceFamily(source: string | undefined) {
  const s = (source ?? "unknown").toLowerCase();
  if (s.includes("football-data")) return "FOOTBALL_DATA";
  if (s.includes("openfootball")) return "OPENFOOTBALL";
  if (s.includes("sportsdb")) return "THESPORTSDB";
  if (s.includes("sportscore")) return "SPORTSCORE";
  if (s.includes("espn")) return "ESPN";
  if (s.includes("betika")) return "BETIKA";
  if (s.includes("deep-miner")) return "DERIVED_INTELLIGENCE";
  return s ? s.toUpperCase() : "UNKNOWN";
}

async function safeRows(task: Promise<MatchRow[]>) {
  try { return await task; } catch { return []; }
}

function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function writeObservation(db: SupabaseClient, source: string, dataset: string, entityType: string, entityKey: string, payload: unknown, quality: number) {
  const content = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < content.length; i += 1) hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
  await db.from("source_observations").upsert({
    source,
    source_family: sourceFamily(source),
    source_record_id: `${source}-${dataset}-${entityType}-${entityKey}`.slice(0, 220),
    dataset,
    entity_type: entityType,
    entity_key: entityKey,
    payload,
    content_hash: (hash >>> 0).toString(16),
    quality,
    observed_at: new Date().toISOString(),
  }, { onConflict: "source,dataset,source_record_id,entity_type,entity_key" });
}

async function collectDeepPublicEvidence(home: string, away: string, fixtureDate: string) {
  const from = addDays(fixtureDate, -3);
  const to = addDays(fixtureDate, 3);
  const [global, universal, espn] = await Promise.all([
    safeRows(fetchGlobalFallbackFixtures({ data: { dateFrom: addDays(fixtureDate, -365), dateTo } })),
    safeRows(searchUniversalFixtures({ data: { query: `${home} vs ${away}` } })),
    safeRows(fetchEspnFixtures(from, to)),
  ]);
  const relevant = [...global, ...universal, ...espn].filter((row) => {
    const text = `${row.home} ${row.away}`.toLowerCase();
    return text.includes(home.toLowerCase()) || text.includes(away.toLowerCase());
  });
  const byFamily = new Map<string, MatchRow[]>();
  for (const row of relevant) {
    const family = sourceFamily(row.source);
    const bucket = byFamily.get(family) ?? [];
    bucket.push(row);
    byFamily.set(family, bucket);
  }
  return { rows: uniqueRows(relevant), byFamily };
}

async function mineMatch(db: SupabaseClient, fixture: MatchRow) {
  const home = canonicalTeamName(fixture.home);
  const away = canonicalTeamName(fixture.away);
  const matchKey = key({ ...fixture, home, away });
  const [homeHistory, awayHistory, research, publicEvidence] = await Promise.all([
    searchReservoir({ data: { query: home, limit: 1000 } }).catch(() => []),
    searchReservoir({ data: { query: away, limit: 1000 } }).catch(() => []),
    researchTeamOrFixture(`${home} vs ${away} ${dateKey(fixture.date)}`).catch(() => undefined),
    collectDeepPublicEvidence(home, away, dateKey(fixture.date)),
  ]);
  const merged = new Map<string, ReservoirMatch>();
  for (const row of [...homeHistory, ...awayHistory]) merged.set(`${row.date}|${row.home}|${row.away}|${row.time ?? ""}|${row.hg ?? ""}|${row.ag ?? ""}`, row);
  const history = [...merged.values()];
  const h2h = h2hRows(home, away, history);
  const homeAll = aggregate(home, history);
  const awayAll = aggregate(away, history);
  const homeHome = aggregate(home, history, "HOME");
  const awayAway = aggregate(away, history, "AWAY");
  const historicalTeamRows = uniqueRows(history.map((row) => ({
    date: row.date,
    time: row.time,
    home: row.home,
    away: row.away,
    hg: row.hg,
    ag: row.ag,
    result: row.result,
    league: row.league,
    source: row.source,
    sourceId: row.reservoirId,
  })));
  const sourceFamilies = [...new Set([
    ...history.map((r) => sourceFamily(r.source)),
    ...(research?.sources ?? []).map(sourceFamily),
    ...publicEvidence.rows.map((r) => sourceFamily(r.source)),
  ])].filter(Boolean);
  const familyCounts = Object.fromEntries(
    [...new Set(sourceFamilies)].map((family) => [
      family,
      [
        ...(history.filter((r) => sourceFamily(r.source) === family)),
        ...(publicEvidence.rows.filter((r) => sourceFamily(r.source) === family)),
      ].length,
    ]),
  );
  const evidenceCount = history.length + (research?.matches.length ?? 0) + publicEvidence.rows.length + h2h.length;
  const completeness = Math.min(100, Math.round(
    Math.min(35, history.length / 10) +
    Math.min(15, h2h.length * 1.5) +
    Math.min(25, sourceFamilies.length * 5) +
    Math.min(15, (research?.coverage ?? 0) * 0.15) +
    Math.min(10, historicalTeamRows.length / 30),
  ));
  const now = new Date().toISOString();
  const reusableHistory = historicalTeamRows
    .filter((row) => row.hg !== undefined && row.ag !== undefined)
    .sort((a, b) => `${dateKey(b.date)}|${b.time ?? ""}`.localeCompare(`${dateKey(a.date)}|${a.time ?? ""}`))
    .slice(0, 240);
  const reusableH2H = h2h.slice(0, 24).map((row) => ({
    date: row.date, time: row.time, home: row.home, away: row.away, hg: row.hg, ag: row.ag,
    league: row.league, source: row.source, sourceId: row.reservoirId,
  }));
  await db.from("match_intelligence_cells").upsert({
    match_key: matchKey,
    home_team_key: canonicalTeamKey(home),
    away_team_key: canonicalTeamKey(away),
    home_team_name: home,
    away_team_name: away,
    competition: canonicalCompetitionName(fixture.league),
    kickoff: fixture.time ? `${dateKey(fixture.date)}T${fixture.time.slice(0,5)}:00Z` : `${dateKey(fixture.date)}T12:00:00Z`,
    observed_at: now,
    last_mined_at: now,
    next_mine_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    evidence_count: evidenceCount,
    source_count: sourceFamilies.length,
    completeness,
    status: "ACTIVE",
    summary: {
      fixture: { ...fixture, home, away },
      home: homeAll,
      away: awayAll,
      homeVenue: homeHome,
      awayVenue: awayAway,
      h2h: reusableH2H,
      historicalRows: reusableHistory,
      sourceFamilies: [...new Set(sourceFamilies)],
      sourceFamilyCounts: familyCounts,
      publicResearch: {
        matches: research?.matches.length ?? 0,
        sources: research?.sources ?? [],
        coverage: research?.coverage ?? 0,
      },
      minedAt: now,
    },
    updated_at: now,
  }, { onConflict: "match_key" });

  for (const [family, rows] of publicEvidence.byFamily.entries()) {
    await writeObservation(db, family.toLowerCase(), "public-family-match-evidence", "match", `${matchKey}|${family}`, {
      fixture: { ...fixture, home, away }, family, observations: rows.slice(0, 120), observedAt: now,
    }, rows.length ? 0.72 : 0.45);
  }
  await writeObservation(db, "deep-miner", "deep-match-context", "match", matchKey, {
    fixture: { ...fixture, home, away }, home: homeAll, away: awayAll, homeVenue: homeHome, awayVenue: awayAway,
    h2h: reusableH2H, historicalRows: reusableHistory, sourceFamilies: [...new Set(sourceFamilies)], sourceFamilyCounts: familyCounts,
  }, Math.max(0.6, completeness / 100));
  return { key: matchKey, evidence: evidenceCount, sources: sourceFamilies.length, completeness };
}

async function mineTeam(db: SupabaseClient, teamName: string) {
  const name = canonicalTeamName(teamName);
  const teamKey = canonicalTeamKey(name);
  const history = await searchReservoir({ data: { query: name, limit: 1000 } }).catch(() => []);
  const all = aggregate(name, history);
  const home = aggregate(name, history, "HOME");
  const away = aggregate(name, history, "AWAY");
  const recentRows = uniqueRows(history.map((row) => ({
    date: row.date, time: row.time, home: row.home, away: row.away, hg: row.hg, ag: row.ag,
    result: row.result, league: row.league, source: row.source, sourceId: row.reservoirId,
  }))).filter((row) => row.hg !== undefined && row.ag !== undefined)
    .sort((a, b) => `${dateKey(b.date)}|${b.time ?? ""}`.localeCompare(`${dateKey(a.date)}|${a.time ?? ""}`))
    .slice(0, 240);
  const competitions = [...new Map(history.map((m) => [canonicalCompetitionName(m.league), m])).values()].slice(0, 40).map((m) => canonicalCompetitionName(m.league));
  const families = [...new Set(history.map((m) => sourceFamily(m.source)))];
  const now = new Date().toISOString();
  const completeness = Math.min(100, Math.round(Math.min(60, history.length / 10) + Math.min(20, competitions.length * 2) + Math.min(20, all.sample * 0.5) + Math.min(10, families.length * 2)));
  await db.from("team_intelligence_cells").upsert({
    team_key: teamKey,
    team_name: name,
    observed_at: now,
    last_mined_at: now,
    evidence_count: history.length,
    source_count: families.length,
    completeness,
    status: "ACTIVE",
    summary: { team: name, all, home, away, competitions, recentRows, sourceFamilies: families, minedAt: now },
    updated_at: now,
  }, { onConflict: "team_key" });
  await writeObservation(db, "deep-miner", "deep-team-context", "team", teamKey, {
    team: name, all, home, away, competitions, recentRows, sourceFamilies: families,
  }, Math.max(0.6, completeness / 100));
  return { key: teamKey, evidence: history.length, completeness };
}

export async function runDeepEvidenceMining(options?: { matchBudget?: number; teamBudget?: number }) {
  const db = admin();
  if (!db) return { configured: false, processedMatches: 0, processedTeams: 0, evidence: 0 };
  const matchBudget = Math.min(40, Math.max(1, options?.matchBudget ?? 20));
  const teamBudget = Math.min(40, Math.max(1, options?.teamBudget ?? 30));
  const nowIso = new Date().toISOString();
  const run = await db.from("evidence_mining_runs").insert({ run_type: "DEEP_EVIDENCE_CYCLE", requested_count: matchBudget + teamBudget, started_at: nowIso, status: "RUNNING", detail: { matchBudget, teamBudget } }).select("id").maybeSingle();
  const due = await db.from("match_intelligence_cells").select("match_key,home_team_name,away_team_name,competition,kickoff").or(`next_mine_at.is.null,next_mine_at.lte.${nowIso}`).order("next_mine_at", { ascending: true }).limit(matchBudget);
  const selectedMatches = due.data ?? [];
  let processedMatches = 0, processedTeams = 0, evidence = 0;
  const teams = new Set<string>();
  for (const row of selectedMatches) {
    const fixture: MatchRow = {
      home: row.home_team_name,
      away: row.away_team_name,
      date: String(row.kickoff).slice(0, 10),
      time: String(row.kickoff).slice(11, 16),
      league: row.competition ?? "Worldwide Football",
    };
    const result = await mineMatch(db, fixture).catch(() => undefined);
    if (result) {
      processedMatches += 1;
      evidence += result.evidence;
      teams.add(row.home_team_name);
      teams.add(row.away_team_name);
    }
  }
  const teamNames = [...teams].slice(0, teamBudget);
  for (const name of teamNames) {
    const result = await mineTeam(db, name).catch(() => undefined);
    if (result) { processedTeams += 1; evidence += result.evidence; }
  }
  if (run.data?.id) await db.from("evidence_mining_runs").update({ processed_count: processedMatches + processedTeams, evidence_found: evidence, finished_at: new Date().toISOString(), status: "SUCCESS", detail: { matchBudget, teamBudget, processedMatches, processedTeams } }).eq("id", run.data.id);
  return { configured: true, processedMatches, processedTeams, evidence };
}

export const runDeepEvidenceMiningFn = createServerFn({ method: "POST" })
  .validator((input: { matchBudget?: number; teamBudget?: number }) => input)
  .handler(async ({ data }) => runDeepEvidenceMining(data));
