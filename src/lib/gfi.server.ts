import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyze } from "./intel/analyze";
import type { HistMatch, TargetMatch } from "./intel/features";
import { describeProviders } from "./intel/providers";
import { brier, logLoss, marketOutcome } from "./intel/settle";
import { MARKETS, type Market } from "./intel/types";

export const DATASETS = [
  { code: "en.1", name: "English Premier League", country: "England" },
  { code: "es.1", name: "Spanish La Liga", country: "Spain" },
  { code: "de.1", name: "German Bundesliga", country: "Germany" },
  { code: "it.1", name: "Italian Serie A", country: "Italy" },
  { code: "fr.1", name: "French Ligue 1", country: "France" },
];

export const SEASONS = ["2023-24", "2024-25", "2025-26"];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function providers() {
  return describeProviders(process.env as Record<string, string | undefined>);
}

type RawMatch = {
  round?: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
};

export async function ingestOpenFootball(limitSeasons?: string[]) {
  const seasons = limitSeasons?.length ? limitSeasons : SEASONS;
  let total = 0;
  const detail: string[] = [];

  for (const season of seasons) {
    for (const ds of DATASETS) {
      const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${ds.code}.json`;
      let raw: { name?: string; matches?: RawMatch[] };
      try {
        const res = await fetch(url);
        if (!res.ok) {
          detail.push(`${season} ${ds.code}: not published (${res.status})`);
          continue;
        }
        raw = (await res.json()) as { name?: string; matches?: RawMatch[] };
      } catch (e) {
        detail.push(`${season} ${ds.code}: fetch failed`);
        continue;
      }
      const matches = raw.matches ?? [];
      if (!matches.length) continue;

      const { data: comp, error: compErr } = await supabaseAdmin
        .from("competitions")
        .upsert(
          { code: ds.code, season, name: raw.name ?? `${ds.name} ${season}`, country: ds.country },
          { onConflict: "code,season" },
        )
        .select("id")
        .single();
      if (compErr || !comp) {
        detail.push(`${season} ${ds.code}: ${compErr?.message ?? "competition upsert failed"}`);
        continue;
      }

      const names = [...new Set(matches.flatMap((m) => [m.team1, m.team2]))];
      await supabaseAdmin.from("teams").upsert(
        names.map((n) => ({ name: n, slug: slugify(n), country: ds.country })),
        { onConflict: "name" },
      );
      const { data: teamRows } = await supabaseAdmin
        .from("teams")
        .select("id,name")
        .in("name", names);
      const teamId = new Map((teamRows ?? []).map((t) => [t.name, t.id]));

      const rows = matches
        .map((m) => {
          const h = teamId.get(m.team1);
          const a = teamId.get(m.team2);
          if (!h || !a) return null;
          const ft = m.score?.ft;
          const ht = m.score?.ht;
          return {
            competition_id: comp.id,
            home_team_id: h,
            away_team_id: a,
            kickoff: new Date(`${m.date}T${m.time ?? "15:00"}:00Z`).toISOString(),
            round: m.round ?? null,
            status: ft ? "FINISHED" : "SCHEDULED",
            ft_home: ft?.[0] ?? null,
            ft_away: ft?.[1] ?? null,
            ht_home: ht?.[0] ?? null,
            ht_away: ht?.[1] ?? null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      for (let i = 0; i < rows.length; i += 300) {
        const { error } = await supabaseAdmin.from("matches").upsert(rows.slice(i, i + 300), {
          onConflict: "competition_id,home_team_id,away_team_id,kickoff",
        });
        if (error) detail.push(`${season} ${ds.code}: ${error.message}`);
      }
      total += rows.length;
      detail.push(`${season} ${ds.code}: ${rows.length} matches`);
    }
  }

  await supabaseAdmin.from("ingest_runs").insert({
    source: "openfootball",
    dataset: seasons.join(","),
    status: total > 0 ? "OK" : "EMPTY",
    matches_ingested: total,
    detail: detail.join(" | ").slice(0, 4000),
  });

  return { total, detail };
}

type MatchRow = {
  id: string;
  kickoff: string;
  round: string | null;
  status: string;
  ft_home: number | null;
  ft_away: number | null;
  home_team_id: string;
  away_team_id: string;
  competition_id: string;
  competitions: { name: string; code: string; season: string; country: string | null } | null;
  home: { name: string } | null;
  away: { name: string } | null;
};

const MATCH_SELECT =
  "id,kickoff,round,status,ft_home,ft_away,home_team_id,away_team_id,competition_id,competitions(name,code,season,country),home:teams!matches_home_team_id_fkey(name),away:teams!matches_away_team_id_fkey(name)";

export type MatchDTO = {
  id: string;
  kickoff: string;
  round: string | null;
  status: string;
  ftHome: number | null;
  ftAway: number | null;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  competitionId: string;
  competition: string;
  competitionCode: string;
  season: string;
  country: string | null;
};

function toDTO(r: MatchRow): MatchDTO {
  return {
    id: r.id,
    kickoff: r.kickoff,
    round: r.round,
    status: r.status,
    ftHome: r.ft_home,
    ftAway: r.ft_away,
    homeId: r.home_team_id,
    awayId: r.away_team_id,
    homeName: r.home?.name ?? "Unknown",
    awayName: r.away?.name ?? "Unknown",
    competitionId: r.competition_id,
    competition: r.competitions?.name ?? "Unknown competition",
    competitionCode: r.competitions?.code ?? "",
    season: r.competitions?.season ?? "",
    country: r.competitions?.country ?? null,
  };
}

export async function getMatchDTO(id: string): Promise<MatchDTO | null> {
  const { data } = await supabaseAdmin
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toDTO(data as unknown as MatchRow) : null;
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|afc|cf|ac|sc|ss|as|us|bv|sv|vfl|vfb|tsg|rc|ogc|cd|rcd|ud|calcio|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function parseQuery(query: string): { left: string; right: string | null } {
  const q = query.trim();
  const sep = q.match(/\s+(?:vs\.?|v\.?|-|—|against)\s+/i);
  if (sep && sep.index !== undefined) {
    return { left: q.slice(0, sep.index).trim(), right: q.slice(sep.index + sep[0].length).trim() };
  }
  return { left: q, right: null };
}

function teamScore(candidate: string, term: string): number {
  const c = normalise(candidate);
  const t = normalise(term);
  if (!t) return 0;
  if (c === t) return 1;
  if (c.startsWith(t) || t.startsWith(c)) return 0.9;
  if (c.includes(t)) return 0.78;
  const tokens = t.split(" ").filter(Boolean);
  const hits = tokens.filter((tok) => tok.length > 2 && c.includes(tok)).length;
  return tokens.length ? (hits / tokens.length) * 0.7 : 0;
}

export async function resolveFixtures(query: string, limit = 8) {
  const { left, right } = parseQuery(query);
  const { data: teams } = await supabaseAdmin.from("teams").select("id,name");
  const all = teams ?? [];
  const leftMatches = all
    .map((t) => ({ ...t, s: teamScore(t.name, left) }))
    .filter((t) => t.s >= 0.55)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);
  const rightMatches = right
    ? all
        .map((t) => ({ ...t, s: teamScore(t.name, right) }))
        .filter((t) => t.s >= 0.55)
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
    : [];

  if (!leftMatches.length) return { fixtures: [], resolvedTeams: [] as string[] };

  const ids = [...leftMatches, ...rightMatches].map((t) => t.id);
  let q = supabaseAdmin.from("matches").select(MATCH_SELECT);
  if (rightMatches.length) {
    const l = leftMatches.map((t) => t.id);
    const r = rightMatches.map((t) => t.id);
    q = q.or(
      `and(home_team_id.in.(${l.join(",")}),away_team_id.in.(${r.join(",")})),and(home_team_id.in.(${r.join(",")}),away_team_id.in.(${l.join(",")}))`,
    );
  } else {
    q = q.or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`);
  }
  const { data } = await q.order("kickoff", { ascending: false }).limit(60);
  const rows = ((data ?? []) as unknown as MatchRow[]).map(toDTO);

  // Prefer upcoming fixtures, then most recent.
  const now = Date.now();
  const upcoming = rows
    .filter((r) => new Date(r.kickoff).getTime() >= now)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const past = rows.filter((r) => new Date(r.kickoff).getTime() < now);
  return {
    fixtures: [...upcoming, ...past].slice(0, limit),
    resolvedTeams: [...new Set([...leftMatches, ...rightMatches].map((t) => t.name))],
  };
}

export async function loadHistoryFor(target: MatchDTO): Promise<HistMatch[]> {
  const { data: comps } = await supabaseAdmin
    .from("competitions")
    .select("id")
    .eq("code", target.competitionCode);
  const compIds = (comps ?? []).map((c) => c.id);

  const collected = new Map<string, MatchDTO>();

  if (compIds.length) {
    const { data } = await supabaseAdmin
      .from("matches")
      .select(MATCH_SELECT)
      .in("competition_id", compIds)
      .eq("status", "FINISHED")
      .lt("kickoff", target.kickoff)
      .order("kickoff", { ascending: false })
      .limit(1400);
    for (const r of (data ?? []) as unknown as MatchRow[]) {
      const dto = toDTO(r);
      collected.set(dto.id, dto);
    }
  }

  // Always include every stored match for the two teams, even cross-competition.
  const { data: teamRows } = await supabaseAdmin
    .from("matches")
    .select(MATCH_SELECT)
    .eq("status", "FINISHED")
    .lt("kickoff", target.kickoff)
    .or(
      `home_team_id.in.(${target.homeId},${target.awayId}),away_team_id.in.(${target.homeId},${target.awayId})`,
    )
    .order("kickoff", { ascending: false })
    .limit(300);
  for (const r of (teamRows ?? []) as unknown as MatchRow[]) {
    const dto = toDTO(r);
    collected.set(dto.id, dto);
  }

  return [...collected.values()].map((m) => ({
    id: m.id,
    competitionId: m.competitionId,
    competition: m.competition,
    homeId: m.homeId,
    awayId: m.awayId,
    homeName: m.homeName,
    awayName: m.awayName,
    kickoff: m.kickoff,
    ftHome: m.ftHome ?? 0,
    ftAway: m.ftAway ?? 0,
  }));
}

export function toTarget(m: MatchDTO): TargetMatch {
  return {
    id: m.id,
    competitionId: m.competitionId,
    competition: m.competition,
    season: m.season,
    country: m.country,
    homeId: m.homeId,
    awayId: m.awayId,
    homeName: m.homeName,
    awayName: m.awayName,
    kickoff: m.kickoff,
    round: m.round,
    status: m.status,
    ftHome: m.ftHome,
    ftAway: m.ftAway,
  };
}

export async function analyzeAndStore(matchId: string, runs = 50000) {
  const match = await getMatchDTO(matchId);
  if (!match) throw new Error("Match not found");
  const history = await loadHistoryFor(match);
  const result = analyze(toTarget(match), history, providers(), { runs });

  const { data: snapshot, error } = await supabaseAdmin
    .from("snapshots")
    .insert({
      match_id: matchId,
      version: result.version,
      inputs_hash: result.inputsHash,
      data_quality: result.dataQuality,
      stability: result.stability,
      consensus: result.consensus,
      verdict: result.verdict.headline,
      probabilities: result.probabilities,
      engines: result.engines,
      simulation: result.simulation,
      evidence: result.evidence,
      conflicts: result.conflicts,
      source_health: result.sourceHealth,
      reasoning: {
        verdict: result.verdict,
        outcomes: result.outcomes.slice(0, 10),
        dataQualityComponents: result.dataQualityComponents,
        lambdas: result.lambdas,
      },
    })
    .select("id,created_at")
    .single();
  if (error || !snapshot) throw new Error(error?.message ?? "Snapshot write failed");

  const headline = result.verdict.outcome?.market;
  const predictions = result.outcomes.map((o) => ({
    snapshot_id: snapshot.id,
    match_id: matchId,
    market: o.market,
    selection: o.label,
    probability: o.probability,
    fair_odds: o.fairOdds,
    confidence: o.dataQuality,
    stability: o.stability,
    consensus: o.consensus,
    is_headline: o.market === headline && result.verdict.kind === "STRONGEST_OUTCOME",
  }));
  await supabaseAdmin.from("predictions").insert(predictions);

  const enginePredictions = result.engines
    .filter((e) => e.status === "OK")
    .flatMap((e) =>
      (Object.keys(e.markets) as Market[])
        .filter((m) => MARKETS.includes(m))
        .map((m) => ({
          snapshot_id: snapshot.id,
          match_id: matchId,
          competition_id: match.competitionId,
          engine: e.id,
          market: m,
          probability: e.markets[m]!,
        })),
    );
  for (let i = 0; i < enginePredictions.length; i += 400) {
    await supabaseAdmin.from("engine_predictions").insert(enginePredictions.slice(i, i + 400));
  }

  return { snapshotId: snapshot.id, match, result };
}

export async function settleAll() {
  const { data: finished } = await supabaseAdmin
    .from("matches")
    .select("id,ft_home,ft_away")
    .eq("status", "FINISHED")
    .not("ft_home", "is", null);
  const scores = new Map(
    (finished ?? []).map((m) => [m.id, [m.ft_home as number, m.ft_away as number]]),
  );

  let settled = 0;
  for (const table of ["predictions", "engine_predictions"] as const) {
    const { data: open } = await supabaseAdmin
      .from(table)
      .select("id,match_id,market,probability")
      .eq("status", "OPEN")
      .limit(5000);
    for (const row of open ?? []) {
      const sc = scores.get(row.match_id);
      if (!sc) continue;
      const outcome = marketOutcome(row.market as Market, sc[0]!, sc[1]!);
      const p = Number(row.probability);
      await supabaseAdmin
        .from(table)
        .update({
          status: "SETTLED",
          outcome,
          brier: brier(p, outcome),
          log_loss: logLoss(p, outcome),
          settled_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      settled++;
    }
  }
  return { settled };
}
