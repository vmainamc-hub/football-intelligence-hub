import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { HistMatch, TargetMatch } from "./intel/features";
import { describeProviders } from "./intel/providers";
import { brier, logLoss, marketOutcome } from "./intel/settle";
import {
  MARKETS,
  type Market,
  type AnalysisPayload,
  type MarketSurface,
  type EngineOutput as LegacyEngineOutput,
  type OutcomeCandidate,
} from "./intel/types";
import { analyzeActiveAuthoritatively } from "./gfi/authoritative-runtime";
import type { MatchRow } from "./gfi/intelligence";

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
      } catch {
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
          const h = teamId.get(m.team1),
            a = teamId.get(m.team2);
          if (!h || !a) return null;
          const ft = m.score?.ft,
            ht = m.score?.ht;
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
        await supabaseAdmin.from("matches").upsert(rows.slice(i, i + 300), {
          onConflict: "competition_id,home_team_id,away_team_id,kickoff",
        });
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

type MatchRowDb = {
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
function toDTO(r: MatchRowDb): MatchDTO {
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
export async function getMatchDTO(id: string) {
  const { data } = await supabaseAdmin
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toDTO(data as unknown as MatchRowDb) : null;
}
const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|afc|cf|ac|sc|ss|as|us|bv|sv|vfl|vfb|tsg|rc|ogc|cd|rcd|ud|calcio|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function parseQuery(query: string) {
  const q = query.trim(),
    sep = q.match(/\s+(?:vs\.?|v\.?|-|—|against)\s+/i);
  return sep && sep.index !== undefined
    ? { left: q.slice(0, sep.index).trim(), right: q.slice(sep.index + sep[0].length).trim() }
    : { left: q, right: null };
}
function teamScore(candidate: string, term: string) {
  const c = normalise(candidate),
    t = normalise(term);
  if (!t) return 0;
  if (c === t) return 1;
  if (c.startsWith(t) || t.startsWith(c)) return 0.9;
  if (c.includes(t)) return 0.78;
  const tokens = t.split(" ").filter(Boolean),
    hits = tokens.filter((tok) => tok.length > 2 && c.includes(tok)).length;
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
    const l = leftMatches.map((t) => t.id),
      r = rightMatches.map((t) => t.id);
    q = q.or(
      `and(home_team_id.in.(${l.join(",")}),away_team_id.in.(${r.join(",")})),and(home_team_id.in.(${r.join(",")}),away_team_id.in.(${l.join(",")}))`,
    );
  } else q = q.or(`home_team_id.in.(${ids.join(",")}),away_team_id.in.(${ids.join(",")})`);
  const { data } = await q.order("kickoff", { ascending: false }).limit(60);
  const rows = ((data ?? []) as unknown as MatchRowDb[]).map(toDTO),
    now = Date.now();
  const upcoming = rows
      .filter((r) => new Date(r.kickoff).getTime() >= now)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    past = rows.filter((r) => new Date(r.kickoff).getTime() < now);
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
    for (const r of (data ?? []) as unknown as MatchRowDb[]) {
      const dto = toDTO(r);
      collected.set(dto.id, dto);
    }
  }
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
  for (const r of (teamRows ?? []) as unknown as MatchRowDb[]) {
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
function hashString(v: string) {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
function legacyMarkets(a: ReturnType<typeof analyzeActiveAuthoritatively>): MarketSurface {
  const p = a.probabilities,
    t = a.totals as Record<string, number>,
    b = a.btts;
  return {
    home: p.home,
    draw: p.draw,
    away: p.away,
    dc1x: p.home + p.draw,
    dcx2: p.draw + p.away,
    dc12: p.home + p.away,
    over05: t["over0.5"],
    over15: t["over1.5"],
    over25: t["over2.5"],
    over35: t["over3.5"],
    under05: 1 - t["over0.5"],
    under15: 1 - t["over1.5"],
    under25: 1 - t["over2.5"],
    under35: 1 - t["over3.5"],
    bttsYes: b.yes,
    bttsNo: b.no,
  };
}
function legacyEngine(
  e: ReturnType<typeof analyzeActiveAuthoritatively>["engines"][number],
): LegacyEngineOutput {
  const markets: MarketSurface = {};
  if (e.probabilities) {
    markets.home = e.probabilities.home;
    markets.draw = e.probabilities.draw;
    markets.away = e.probabilities.away;
    markets.dc1x = e.probabilities.home + e.probabilities.draw;
    markets.dcx2 = e.probabilities.draw + e.probabilities.away;
    markets.dc12 = e.probabilities.home + e.probabilities.away;
  }
  if (e.id === "TOTALS") {
    markets.over05 = e.values["over0.5"];
    markets.over15 = e.values["over1.5"];
    markets.over25 = e.values["over2.5"];
    markets.over35 = e.values["over3.5"];
    markets.under05 = 1 - e.values["over0.5"];
    markets.under15 = 1 - e.values["over1.5"];
    markets.under25 = 1 - e.values["over2.5"];
    markets.under35 = 1 - e.values["over3.5"];
  }
  if (e.id === "BTTS") {
    markets.bttsYes = e.values.yes;
    markets.bttsNo = e.values.no;
  }
  return {
    id: e.id,
    name: e.name,
    family: e.id,
    status: e.signal === "LIMITATION" ? "INSUFFICIENT_DATA" : "OK",
    statusDetail: e.limitations.join(" "),
    weight: e.quality / 100,
    confidence: e.confidence / 100,
    lambdas:
      e.values.lambdaHome !== undefined && e.values.lambdaAway !== undefined
        ? { home: e.values.lambdaHome, away: e.values.lambdaAway }
        : undefined,
    markets,
    notes: [...e.evidence, ...e.limitations],
  };
}
function legacyResult(
  a: ReturnType<typeof analyzeActiveAuthoritatively>,
  match: MatchDTO,
  history: HistMatch[],
): AnalysisPayload {
  const markets = legacyMarkets(a),
    stable = a.robustness.score / 100,
    dq = a.quality / 100,
    cons = a.consensus.agreement;
  const labels: Record<string, string> = {
    home: `${a.home.team} win`,
    draw: "Draw",
    away: `${a.away.team} win`,
    over05: "Over 0.5 goals",
    over15: "Over 1.5 goals",
    over25: "Over 2.5 goals",
    over35: "Over 3.5 goals",
    under05: "Under 0.5 goals",
    under15: "Under 1.5 goals",
    under25: "Under 2.5 goals",
    under35: "Under 3.5 goals",
    bttsYes: "BTTS — Yes",
    bttsNo: "BTTS — No",
  };
  const candidates = (Object.entries(markets) as [Market, number][])
    .map(([market, probability]) => ({
      market,
      label: labels[market] ?? market,
      probability,
      consensus: cons,
      stability: stable,
      dataQuality: dq,
      engineCount: a.engines.filter((e) => e.probabilities || e.id === "TOTALS" || e.id === "BTTS")
        .length,
      fairOdds: probability > 0 ? 1 / probability : 99,
      score: probability * 0.5 + cons * 0.25 + stable * 0.15 + dq * 0.1,
    }))
    .sort((x, y) => y.score - x.score) as OutcomeCandidate[];
  const best = candidates[0];
  const kind =
    a.decision === "INSUFFICIENT INTELLIGENCE"
      ? "INSUFFICIENT_INTELLIGENCE"
      : a.decision === "HIGH MODEL CONFLICT"
        ? "HIGH_MODEL_CONFLICT"
        : a.decision === "NO STRONG EDGE"
          ? "NO_STRONG_EDGE"
          : "STRONGEST_OUTCOME";
  const simulation = a.engines.find((e) => e.id === "SIMULATION"),
    goals = a.engines.find((e) => e.id === "GOALS");
  const lambdas = {
    home: Number(goals?.values.lambdaHome ?? 1.2),
    away: Number(goals?.values.lambdaAway ?? 1),
  };
  const result: AnalysisPayload = {
    matchId: match.id,
    version: a.analysisVersion,
    inputsHash: hashString(`${match.id}|${history.length}|${a.analysisVersion}`),
    createdAt: new Date().toISOString(),
    probabilities: markets,
    consensusByMarket: Object.fromEntries(Object.keys(markets).map((k) => [k, cons])),
    stabilityByMarket: Object.fromEntries(Object.keys(markets).map((k) => [k, stable])),
    dataQuality: dq,
    stability: stable,
    consensus: cons,
    engines: a.engines.map(legacyEngine),
    simulation: {
      runs: Number(simulation?.values.iterations ?? 10000),
      markets: {
        home: a.probabilities.home,
        draw: a.probabilities.draw,
        away: a.probabilities.away,
        over15: (a.totals as Record<string, number>)["over1.5"],
        over25: (a.totals as Record<string, number>)["over2.5"],
        over35: (a.totals as Record<string, number>)["over3.5"],
        bttsYes: a.btts.yes,
        bttsNo: a.btts.no,
      },
      topScores: [],
      goalDistribution: [],
      scenarios: {
        homeScoresFirst: 0,
        awayScoresFirst: 0,
        noGoal: 0,
        homeComeback: 0,
        awayComeback: 0,
        firstHalfGoal: 0,
        lateWinner: 0,
      },
    },
    evidence: a.evidenceLedger.map((e) => ({
      claim: e.statement,
      category: e.source,
      source: e.source,
      sourceKind: "COMPUTED",
      reliability: e.quality / 100,
      confidence: e.quality / 100,
      freshnessDays: null,
      observedAt: a.generatedAt,
    })),
    conflicts:
      a.consensus.conflict > 0.12
        ? [
            {
              market: "home",
              spread: a.consensus.conflict,
              severity: a.consensus.conflict > 0.24 ? "SEVERE" : "MATERIAL",
              leaning: [{ engine: "CONSENSUS", probability: a.consensus.home }],
              explanation: "Cross-model dispersion indicates material disagreement.",
            },
          ]
        : [],
    outcomes: candidates,
    verdict: {
      kind,
      headline: a.finalPrediction,
      detail: a.warnings.join(" ") || a.decision,
      outcome: a.decision === "INSUFFICIENT INTELLIGENCE" ? undefined : best,
    },
    sourceHealth: {
      authoritative: {
        status: "OK",
        detail: `${a.analysisVersion}; ${Number(a.aiReasoningPacket?.globalHistoricalRows ?? 0)} assembled historical rows; ${a.home.played} home-team observations; ${a.away.played} away-team observations.`,
      },
    },
    lambdas,
    marketDivergence: null,
  };
  return result;
}
export async function analyzeAndStore(matchId: string, runs = 50000) {
  void runs;
  const match = await getMatchDTO(matchId);
  if (!match) throw new Error("Match not found");
  const history = await loadHistoryFor(match);
  const fixtureRow: MatchRow = {
    date: match.kickoff.slice(0, 10),
    home: match.homeName,
    away: match.awayName,
    league: match.competition,
    hg: match.ftHome ?? undefined,
    ag: match.ftAway ?? undefined,
  };
  const historyRows: MatchRow[] = history.map((h) => ({
    date: h.kickoff.slice(0, 10),
    home: h.homeName,
    away: h.awayName,
    league: h.competition,
    hg: h.ftHome,
    ag: h.ftAway,
    result: h.ftHome > h.ftAway ? "H" : h.ftHome < h.ftAway ? "A" : "D",
  }));
  const authoritative = analyzeActiveAuthoritatively(fixtureRow, historyRows);
  const result = legacyResult(authoritative, match, history);
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
  for (let i = 0; i < enginePredictions.length; i += 400)
    await supabaseAdmin.from("engine_predictions").insert(enginePredictions.slice(i, i + 400));
  return { snapshotId: snapshot.id, match, result, authoritative };
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
