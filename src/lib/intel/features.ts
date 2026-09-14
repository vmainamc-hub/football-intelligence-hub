import { mean } from "./math";

export type HistMatch = {
  id: string;
  competitionId: string;
  competition: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  ftHome: number;
  ftAway: number;
};

export type TargetMatch = {
  id: string;
  competitionId: string;
  competition: string;
  season: string;
  country: string | null;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  round: string | null;
  status: string;
  ftHome: number | null;
  ftAway: number | null;
};

export type TeamSplit = {
  played: number;
  scored: number;
  conceded: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  draws: number;
  losses: number;
  bttsRate: number;
  over25Rate: number;
  cleanSheetRate: number;
  failedToScoreRate: number;
};

export type TeamProfile = {
  id: string;
  name: string;
  overall: TeamSplit;
  home: TeamSplit;
  away: TeamSplit;
  elo: number;
  form: {
    results: ("W" | "D" | "L")[];
    weightedScored: number;
    weightedConceded: number;
    points: number;
  };
  restDays: number | null;
  matchesInLast14Days: number;
  lastMatchDate: string | null;
};

export type LeagueBaseline = {
  matches: number;
  homeGoals: number;
  awayGoals: number;
  totalGoals: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  bttsRate: number;
  over25Rate: number;
};

export type Features = {
  target: TargetMatch;
  league: LeagueBaseline;
  home: TeamProfile;
  away: TeamProfile;
  h2h: {
    matches: HistMatch[];
    homeWins: number;
    draws: number;
    awayWins: number;
    avgTotal: number;
  };
  historyCount: number;
  cutoff: string;
};

const EMPTY_SPLIT: TeamSplit = {
  played: 0,
  scored: 0,
  conceded: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  bttsRate: 0,
  over25Rate: 0,
  cleanSheetRate: 0,
  failedToScoreRate: 0,
};

function buildSplit(rows: { gf: number; ga: number }[]): TeamSplit {
  if (!rows.length) return { ...EMPTY_SPLIT };
  const played = rows.length;
  const goalsFor = rows.reduce((a, r) => a + r.gf, 0);
  const goalsAgainst = rows.reduce((a, r) => a + r.ga, 0);
  return {
    played,
    goalsFor,
    goalsAgainst,
    scored: goalsFor / played,
    conceded: goalsAgainst / played,
    wins: rows.filter((r) => r.gf > r.ga).length,
    draws: rows.filter((r) => r.gf === r.ga).length,
    losses: rows.filter((r) => r.gf < r.ga).length,
    bttsRate: rows.filter((r) => r.gf > 0 && r.ga > 0).length / played,
    over25Rate: rows.filter((r) => r.gf + r.ga > 2.5).length / played,
    cleanSheetRate: rows.filter((r) => r.ga === 0).length / played,
    failedToScoreRate: rows.filter((r) => r.gf === 0).length / played,
  };
}

/** Elo over the full pre-cutoff history. Deterministic, no leakage. */
export function computeElo(history: HistMatch[]): Map<string, number> {
  const elo = new Map<string, number>();
  const get = (id: string) => elo.get(id) ?? 1500;
  const sorted = [...history].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  for (const m of sorted) {
    const hr = get(m.homeId);
    const ar = get(m.awayId);
    const exp = 1 / (1 + Math.pow(10, (ar - (hr + 65)) / 400));
    const margin = Math.abs(m.ftHome - m.ftAway);
    const k = 20 * (1 + Math.log1p(margin) * 0.6);
    const score = m.ftHome > m.ftAway ? 1 : m.ftHome === m.ftAway ? 0.5 : 0;
    elo.set(m.homeId, hr + k * (score - exp));
    elo.set(m.awayId, ar + k * (exp - score));
  }
  return elo;
}

function teamRows(history: HistMatch[], teamId: string) {
  return history
    .filter((m) => m.homeId === teamId || m.awayId === teamId)
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff));
}

function profile(
  history: HistMatch[],
  teamId: string,
  name: string,
  elo: Map<string, number>,
  cutoff: string,
  window: number,
): TeamProfile {
  const rows = teamRows(history, teamId);
  const recent = rows.slice(0, window);
  const asHome = recent
    .filter((m) => m.homeId === teamId)
    .map((m) => ({ gf: m.ftHome, ga: m.ftAway }));
  const asAway = recent
    .filter((m) => m.awayId === teamId)
    .map((m) => ({ gf: m.ftAway, ga: m.ftHome }));
  const all = recent.map((m) =>
    m.homeId === teamId ? { gf: m.ftHome, ga: m.ftAway } : { gf: m.ftAway, ga: m.ftHome },
  );

  const last6 = rows.slice(0, 6);
  const results = last6.map((m) => {
    const gf = m.homeId === teamId ? m.ftHome : m.ftAway;
    const ga = m.homeId === teamId ? m.ftAway : m.ftHome;
    return gf > ga ? ("W" as const) : gf === ga ? ("D" as const) : ("L" as const);
  });
  let wSum = 0,
    wScored = 0,
    wConceded = 0;
  last6.forEach((m, i) => {
    const w = Math.pow(0.82, i);
    const gf = m.homeId === teamId ? m.ftHome : m.ftAway;
    const ga = m.homeId === teamId ? m.ftAway : m.ftHome;
    wSum += w;
    wScored += w * gf;
    wConceded += w * ga;
  });

  const lastMatch = rows[0];
  const cutoffMs = new Date(cutoff).getTime();
  const restDays = lastMatch
    ? Math.round((cutoffMs - new Date(lastMatch.kickoff).getTime()) / 86400000)
    : null;
  const matchesInLast14Days = rows.filter(
    (m) => cutoffMs - new Date(m.kickoff).getTime() <= 14 * 86400000,
  ).length;

  return {
    id: teamId,
    name,
    overall: buildSplit(all),
    home: buildSplit(asHome),
    away: buildSplit(asAway),
    elo: elo.get(teamId) ?? 1500,
    form: {
      results,
      weightedScored: wSum ? wScored / wSum : 0,
      weightedConceded: wSum ? wConceded / wSum : 0,
      points: results.reduce((a, r) => a + (r === "W" ? 3 : r === "D" ? 1 : 0), 0),
    },
    restDays,
    matchesInLast14Days,
    lastMatchDate: lastMatch?.kickoff ?? null,
  };
}

export function buildFeatures(target: TargetMatch, allHistory: HistMatch[], window = 24): Features {
  const cutoff = target.kickoff;
  const history = allHistory.filter((m) => m.kickoff < cutoff && m.id !== target.id);
  const leagueRows = history.filter((m) => m.competitionId === target.competitionId);
  const leagueSource = leagueRows.length >= 40 ? leagueRows : history;

  const league: LeagueBaseline = {
    matches: leagueSource.length,
    homeGoals: leagueSource.length ? mean(leagueSource.map((m) => m.ftHome)) : 1.45,
    awayGoals: leagueSource.length ? mean(leagueSource.map((m) => m.ftAway)) : 1.15,
    totalGoals: leagueSource.length ? mean(leagueSource.map((m) => m.ftHome + m.ftAway)) : 2.6,
    homeWinRate: leagueSource.length
      ? leagueSource.filter((m) => m.ftHome > m.ftAway).length / leagueSource.length
      : 0.44,
    drawRate: leagueSource.length
      ? leagueSource.filter((m) => m.ftHome === m.ftAway).length / leagueSource.length
      : 0.25,
    awayWinRate: leagueSource.length
      ? leagueSource.filter((m) => m.ftHome < m.ftAway).length / leagueSource.length
      : 0.31,
    bttsRate: leagueSource.length
      ? leagueSource.filter((m) => m.ftHome > 0 && m.ftAway > 0).length / leagueSource.length
      : 0.5,
    over25Rate: leagueSource.length
      ? leagueSource.filter((m) => m.ftHome + m.ftAway > 2.5).length / leagueSource.length
      : 0.52,
  };

  const elo = computeElo(history);
  const home = profile(history, target.homeId, target.homeName, elo, cutoff, window);
  const away = profile(history, target.awayId, target.awayName, elo, cutoff, window);

  const h2hMatches = history
    .filter(
      (m) =>
        (m.homeId === target.homeId && m.awayId === target.awayId) ||
        (m.homeId === target.awayId && m.awayId === target.homeId),
    )
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, 10);

  const h2h = {
    matches: h2hMatches,
    homeWins: h2hMatches.filter((m) =>
      m.homeId === target.homeId ? m.ftHome > m.ftAway : m.ftAway > m.ftHome,
    ).length,
    draws: h2hMatches.filter((m) => m.ftHome === m.ftAway).length,
    awayWins: h2hMatches.filter((m) =>
      m.homeId === target.awayId ? m.ftHome > m.ftAway : m.ftAway > m.ftHome,
    ).length,
    avgTotal: h2hMatches.length ? mean(h2hMatches.map((m) => m.ftHome + m.ftAway)) : 0,
  };

  return { target, league, home, away, h2h, historyCount: history.length, cutoff };
}
