import type { MatchRow, TeamSnapshot } from "./intelligence";
import { sameTeamIdentity } from "./identity";

type RegimeStatus = "ACCELERATING" | "SHIFTING" | "STABLE" | "UNSTABLE";

export type AdaptiveSnapshot = TeamSnapshot & {
  adaptive?: {
    halfLifeDays: number;
    effectiveSample: number;
    recencyWeightPct: number;
    currentSeasonSharePct: number;
    venueSharePct: number;
    opponentStrength: number;
    regimeStatus: RegimeStatus;
    regimeShiftScore: number;
    currentFormPPG: number;
    historicalFormPPG: number;
    currentGoalDiff: number;
    historicalGoalDiff: number;
    shrinkagePct: number;
  };
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function dateKey(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const y = dmy[3].length === 2 ? Number(dmy[3]) + 2000 : Number(dmy[3]);
    return `${y}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function seasonStart(key: string) {
  const y = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month >= 7 ? y : y - 1;
}

function completedMatches(team: string, matches: MatchRow[], asOf: string) {
  return matches
    .filter((m) => m.hg !== undefined && m.ag !== undefined)
    .filter((m) => dateKey(m.date) <= asOf)
    .filter((m) => sameTeamIdentity(m.home, team) || sameTeamIdentity(m.away, team))
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
}

function buildOpponentStrengths(matches: MatchRow[], asOf: string) {
  const totals = new Map<string, { points: number; played: number }>();
  for (const m of matches) {
    if (m.hg === undefined || m.ag === undefined || dateKey(m.date) > asOf) continue;
    const h = totals.get(m.home) ?? { points: 0, played: 0 };
    const a = totals.get(m.away) ?? { points: 0, played: 0 };
    h.points += m.hg > m.ag ? 3 : m.hg === m.ag ? 1 : 0;
    h.played += 1;
    a.points += m.ag > m.hg ? 3 : m.hg === m.ag ? 1 : 0;
    a.played += 1;
    totals.set(m.home, h);
    totals.set(m.away, a);
  }
  const ppgs = [...totals.values()].map((x) => x.points / Math.max(1, x.played));
  return { totals, leaguePPG: avg(ppgs) || 1.35 };
}

function matchTimeWeight(m: MatchRow, asOf: string, halfLifeDays: number) {
  const age = Math.max(0, (Date.parse(`${asOf}T12:00:00Z`) - Date.parse(`${dateKey(m.date)}T12:00:00Z`)) / 86400000);
  return Math.pow(0.5, age / Math.max(1, halfLifeDays));
}

export function buildAdaptiveSnapshot(
  team: string,
  matches: MatchRow[],
  venue: "home" | "away",
  asOf = matches.reduce((latest, m) => dateKey(m.date) > latest ? dateKey(m.date) : latest, "0000-00-00"),
): AdaptiveSnapshot {
  const rows = completedMatches(team, matches, asOf);
  const strengths = buildOpponentStrengths(matches, asOf);
  const recent = rows.slice(-5);
  const long = rows.slice(-12);
  const baseHalfLife = rows.length < 6 ? 100 : 90;

  const raw = (m: MatchRow) => {
    const isHome = sameTeamIdentity(m.home, team);
    const gf = isHome ? m.hg! : m.ag!;
    const ga = isHome ? m.ag! : m.hg!;
    const result = gf > ga ? "W" : gf === ga ? "D" : "L";
    const opp = isHome ? m.away : m.home;
    const oppRec = strengths.totals.get(opp);
    const oppPPG = oppRec ? oppRec.points / Math.max(1, oppRec.played) : strengths.leaguePPG;
    const strengthFactor = clamp(0.85 + 0.30 * (oppPPG / Math.max(0.8, strengths.leaguePPG)), 0.8, 1.2);
    return { m, gf, ga, result, strengthFactor, isVenueMatch: venue === "home" ? isHome : !isHome };
  };

  const provisional = rows.map((m) => raw(m));
  const provisionalStats = (xs: typeof provisional) => {
    if (!xs.length) return { ppg: 1.35, gd: 0 };
    let pts = 0;
    let gd = 0;
    for (const x of xs) {
      pts += x.result === "W" ? 3 : x.result === "D" ? 1 : 0;
      gd += x.gf - x.ga;
    }
    return { ppg: pts / xs.length, gd: gd / xs.length };
  };
  const recentStats = provisionalStats(provisional.slice(-5));
  const longStats = provisionalStats(provisional.slice(-12));
  const regimeShiftScore = clamp(
    Math.abs(recentStats.ppg - longStats.ppg) / 1.6 + Math.abs(recentStats.gd - longStats.gd) / 2.5,
    0,
    1,
  );
  const halfLifeDays = rows.length < 6 ? baseHalfLife : regimeShiftScore >= 0.65 ? 45 : regimeShiftScore >= 0.35 ? 70 : 120;

  const observations = provisional.map((x) => {
    const recency = matchTimeWeight(x.m, asOf, halfLifeDays);
    const seasonBonus = seasonStart(dateKey(x.m.date)) === seasonStart(asOf) ? 1.18 : 1;
    const venueBonus = x.isVenueMatch ? 1.15 : 1;
    return { ...x, recency, weight: recency * seasonBonus * venueBonus * x.strengthFactor };
  });

  const stat = (xs: typeof observations) => {
    const w = xs.reduce((s, x) => s + x.weight, 0) || 1;
    const points = xs.reduce((s, x) => s + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0) * x.weight, 0) / w;
    const gf = xs.reduce((s, x) => s + x.gf * x.weight, 0) / w;
    const ga = xs.reduce((s, x) => s + x.ga * x.weight, 0) / w;
    return { ppg: points, gf, ga, gd: gf - ga };
  };
  const current = stat(observations.slice(-5));
  const historical = stat(observations.slice(-12));
  const regimeStatus: RegimeStatus = regimeShiftScore >= 0.7
    ? "UNSTABLE"
    : current.ppg > historical.ppg + 0.28 && current.gd > historical.gd + 0.3
      ? "ACCELERATING"
      : regimeShiftScore >= 0.35 ? "SHIFTING" : "STABLE";

  const w = observations.reduce((s, x) => s + x.weight, 0);
  const wins = observations.reduce((s, x) => s + (x.result === "W" ? x.weight : 0), 0);
  const draws = observations.reduce((s, x) => s + (x.result === "D" ? x.weight : 0), 0);
  const losses = observations.reduce((s, x) => s + (x.result === "L" ? x.weight : 0), 0);
  const gfObserved = observations.reduce((s, x) => s + x.gf * x.weight, 0) / Math.max(1, w);
  const gaObserved = observations.reduce((s, x) => s + x.ga * x.weight, 0) / Math.max(1, w);
  const observedPPG = (wins * 3 + draws) / Math.max(1, w);
  const venueRows = observations.filter((x) => x.isVenueMatch);
  const venueW = venueRows.reduce((s, x) => s + x.weight, 0);
  const venueWins = venueRows.reduce((s, x) => s + (x.result === "W" ? x.weight : 0), 0);
  const observedVenueRate = venueW ? venueWins / venueW : 0.45;

  // Bayesian-style shrinkage prevents tiny samples from swinging the model too far.
  const reliability = w / (w + 6);
  const shrink = 1 - reliability;
  const ppg = reliability * observedPPG + shrink * 1.35;
  const finalGF = reliability * gfObserved + shrink * 1.35;
  const finalGA = reliability * gaObserved + shrink * 1.35;
  const venueRate = reliability * observedVenueRate + shrink * 0.45;

  const recentResults = rows.slice(-5).map((m) => {
    const isHome = sameTeamIdentity(m.home, team);
    const gf = isHome ? m.hg! : m.ag!;
    const ga = isHome ? m.ag! : m.hg!;
    return gf > ga ? "W" : gf === ga ? "D" : "L";
  });
  const avgRecency = w ? observations.reduce((s, x) => s + x.recency * x.weight, 0) / w : 0;
  const currentSeasonWeight = observations
    .filter((x) => seasonStart(dateKey(x.m.date)) === seasonStart(asOf))
    .reduce((s, x) => s + x.weight, 0);
  const opponentStrength = w
    ? observations.reduce((s, x) => s + x.strengthFactor * x.weight, 0) / w
    : 1;

  return {
    team,
    played: Math.max(1, Math.min(24, Number(w.toFixed(2)))),
    wins,
    draws,
    losses,
    goalsFor: finalGF * Math.max(1, w),
    goalsAgainst: finalGA * Math.max(1, w),
    points: ppg * Math.max(1, w),
    homeOrAwayRate: clamp(venueRate, 0.08, 0.82),
    recent: recentResults,
    adaptive: {
      halfLifeDays,
      effectiveSample: Number(w.toFixed(2)),
      recencyWeightPct: Math.round(avgRecency * 100),
      currentSeasonSharePct: Math.round((currentSeasonWeight / Math.max(1, w)) * 100),
      venueSharePct: Math.round((venueW / Math.max(1, w)) * 100),
      opponentStrength: Number(opponentStrength.toFixed(2)),
      regimeStatus,
      regimeShiftScore: Number(regimeShiftScore.toFixed(3)),
      currentFormPPG: Number(current.ppg.toFixed(2)),
      historicalFormPPG: Number(historical.ppg.toFixed(2)),
      currentGoalDiff: Number(current.gd.toFixed(2)),
      historicalGoalDiff: Number(historical.gd.toFixed(2)),
      shrinkagePct: Math.round(shrink * 100),
    },
  };
}
