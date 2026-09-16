import type { MatchRow, TeamSnapshot } from "./intelligence";
import { sameTeamIdentity } from "./identity";

type RegimeStatus = "ACCELERATING" | "SHIFTING" | "STABLE" | "UNSTABLE";

export type AdaptiveSnapshot = TeamSnapshot & {
  adaptive?: {
    rawSample: number;
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
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

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

function completedMatches(team: string, matches: MatchRow[], asOf: string, opponent?: string) {
  const targetKey = dateKey(asOf);
  return matches
    .filter((m) => m.hg !== undefined && m.ag !== undefined && !Number.isNaN(Number(m.hg)) && !Number.isNaN(Number(m.ag)))
    .filter((m) => {
      const k = dateKey(m.date);
      if (k > targetKey) return false;
      // If exact same date and opponent, exclude target fixture itself
      if (k === targetKey && opponent && (sameTeamIdentity(m.home, opponent) || sameTeamIdentity(m.away, opponent))) {
        return false;
      }
      return true;
    })
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
  const targetTime = Date.parse(`${asOf.includes("T") ? asOf : `${asOf}T12:00:00Z`}`);
  const matchTime = Date.parse(`${dateKey(m.date)}T12:00:00Z`);
  const age = Math.max(0, (targetTime - matchTime) / 86400000);
  return Math.pow(0.5, age / Math.max(1, halfLifeDays));
}

export function buildAdaptiveSnapshot(
  team: string,
  matches: MatchRow[],
  venue: "home" | "away",
  asOf = matches.reduce((latest, m) => (dateKey(m.date) > latest ? dateKey(m.date) : latest), "0000-00-00"),
  opponent?: string,
): AdaptiveSnapshot {
  const rows = completedMatches(team, matches, asOf, opponent);
  const strengths = buildOpponentStrengths(matches, asOf);
  const baseHalfLife = rows.length < 6 ? 95 : 90;

  if (rows.length === 0) {
    return {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      homeOrAwayRate: 0.45,
      recent: [],
      adaptive: {
        rawSample: 0,
        halfLifeDays: baseHalfLife,
        effectiveSample: 0,
        recencyWeightPct: 0,
        currentSeasonSharePct: 0,
        venueSharePct: 0,
        opponentStrength: 1,
        regimeStatus: "STABLE",
        regimeShiftScore: 0,
        currentFormPPG: 1.35,
        historicalFormPPG: 1.35,
        currentGoalDiff: 0,
        historicalGoalDiff: 0,
        shrinkagePct: 100,
      },
    };
  }

  const raw = (m: MatchRow) => {
    const isHome = sameTeamIdentity(m.home, team);
    const gf = isHome ? m.hg! : m.ag!;
    const ga = isHome ? m.ag! : m.hg!;
    const result = gf > ga ? "W" : gf === ga ? "D" : "L";
    const opp = isHome ? m.away : m.home;
    const oppRec = strengths.totals.get(opp);
    const oppPPG = oppRec && oppRec.played >= 2 ? oppRec.points / oppRec.played : strengths.leaguePPG;
    const strengthFactor = clamp(0.80 + 0.35 * (oppPPG / Math.max(0.8, strengths.leaguePPG)), 0.75, 1.25);
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

  const recentWindow = provisional.slice(-5);
  const longWindow = provisional.slice(-12);
  const recentStats = provisionalStats(recentWindow);
  const longStats = provisionalStats(longWindow);

  const ppgDiff = recentStats.ppg - longStats.ppg;
  const gdDiff = recentStats.gd - longStats.gd;
  const regimeShiftScore = clamp(
    Math.abs(ppgDiff) / 1.5 + Math.abs(gdDiff) / 2.2,
    0,
    1,
  );

  // Dynamic continuous half-life adaptation: stable teams retain ~125-130d memory; rapidly shifting/unstable teams shorten to ~40-45d.
  const halfLifeDays = rows.length < 5
    ? baseHalfLife
    : Math.round(clamp(130 - regimeShiftScore * 88, 42, 130));

  const observations = provisional.map((x) => {
    const recency = matchTimeWeight(x.m, asOf, halfLifeDays);
    const seasonBonus = seasonStart(dateKey(x.m.date)) === seasonStart(asOf) ? 1.20 : 0.85;
    const venueBonus = x.isVenueMatch ? 1.18 : 0.88;
    return { ...x, recency, weight: recency * seasonBonus * venueBonus * x.strengthFactor };
  });

  const stat = (xs: typeof observations) => {
    const wSum = xs.reduce((s, x) => s + x.weight, 0) || 1;
    const points = xs.reduce((s, x) => s + (x.result === "W" ? 3 : x.result === "D" ? 1 : 0) * x.weight, 0) / wSum;
    const gf = xs.reduce((s, x) => s + x.gf * x.weight, 0) / wSum;
    const ga = xs.reduce((s, x) => s + x.ga * x.weight, 0) / wSum;
    return { ppg: points, gf, ga, gd: gf - ga };
  };

  const current = stat(observations.slice(-5));
  const historical = stat(observations.slice(-12));

  const regimeStatus: RegimeStatus =
    rows.length < 5
      ? "STABLE"
      : regimeShiftScore >= 0.55 && current.ppg < historical.ppg - 0.28
        ? "UNSTABLE"
        : current.ppg > historical.ppg + 0.28 && current.gd > historical.gd + 0.32
          ? "ACCELERATING"
          : regimeShiftScore >= 0.30
            ? "SHIFTING"
            : "STABLE";

  const sumW = observations.reduce((s, x) => s + x.weight, 0);
  const sumW2 = observations.reduce((s, x) => s + x.weight * x.weight, 0);
  // Kish's formula for effective sample size of weighted observations
  const effectiveSample = sumW2 > 0 ? clamp((sumW * sumW) / sumW2, 0.5, rows.length) : Math.min(rows.length, sumW);

  const wins = observations.reduce((s, x) => s + (x.result === "W" ? x.weight : 0), 0);
  const draws = observations.reduce((s, x) => s + (x.result === "D" ? x.weight : 0), 0);
  const losses = observations.reduce((s, x) => s + (x.result === "L" ? x.weight : 0), 0);
  const gfObserved = observations.reduce((s, x) => s + x.gf * x.weight, 0) / Math.max(0.001, sumW);
  const gaObserved = observations.reduce((s, x) => s + x.ga * x.weight, 0) / Math.max(0.001, sumW);
  const observedPPG = (wins * 3 + draws) / Math.max(0.001, sumW);
  const venueRows = observations.filter((x) => x.isVenueMatch);
  const venueW = venueRows.reduce((s, x) => s + x.weight, 0);
  const venueWins = venueRows.reduce((s, x) => s + (x.result === "W" ? x.weight : 0), 0);
  const observedVenueRate = venueW ? venueWins / venueW : 0.45;

  // Bayesian-style shrinkage prevents tiny samples from swinging the model too far.
  const reliability = sumW / (sumW + 6);
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
  const avgRecency = sumW ? observations.reduce((s, x) => s + x.recency * x.weight, 0) / sumW : 0;
  const currentSeasonWeight = observations
    .filter((x) => seasonStart(dateKey(x.m.date)) === seasonStart(asOf))
    .reduce((s, x) => s + x.weight, 0);
  const opponentStrength = sumW
    ? observations.reduce((s, x) => s + x.strengthFactor * x.weight, 0) / sumW
    : 1;

  return {
    team,
    played: rows.length,
    wins,
    draws,
    losses,
    goalsFor: finalGF * Math.max(1, rows.length),
    goalsAgainst: finalGA * Math.max(1, rows.length),
    points: ppg * Math.max(1, rows.length),
    homeOrAwayRate: clamp(venueRate, 0.08, 0.82),
    recent: recentResults,
    adaptive: {
      rawSample: rows.length,
      halfLifeDays,
      effectiveSample: Number(effectiveSample.toFixed(2)),
      recencyWeightPct: Math.round(avgRecency * 100),
      currentSeasonSharePct: Math.round((currentSeasonWeight / Math.max(0.001, sumW)) * 100),
      venueSharePct: Math.round((venueW / Math.max(0.001, sumW)) * 100),
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
