export type MatchRow = {
  date: string;
  home: string;
  away: string;
  hg?: number;
  ag?: number;
  result?: "H" | "D" | "A";
};

export type TeamSnapshot = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  homeOrAwayRate: number;
  recent: string[];
};

export type IntelligenceResult = {
  home: TeamSnapshot;
  away: TeamSnapshot;
  probabilities: { home: number; draw: number; away: number };
  totals: Record<string, number>;
  btts: { yes: number; no: number };
  confidence: number;
  quality: number;
  verdict: string;
  warnings: string[];
  evidence: string[];
};

const LEAGUES: Record<string, string> = {
  E0: "Premier League",
  E1: "Championship",
  D1: "Bundesliga",
  D2: "2. Bundesliga",
  I1: "Serie A",
  I2: "Serie B",
  SP1: "La Liga",
  SP2: "La Liga 2",
  F1: "Ligue 1",
  F2: "Ligue 2",
  N1: "Eredivisie",
  P1: "Primeira Liga",
};

function csvUrl(code: string) {
  const season = "2627";
  return `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;
}

function parseCsv(text: string): MatchRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""));
  const index = (name: string) => headers.findIndex((h) => h === name);
  const di = index("Date");
  const hi = index("HomeTeam");
  const ai = index("AwayTeam");
  const hgi = index("FTHG");
  const agi = index("FTAG");
  const ri = index("FTR");
  return lines.slice(1).map((line) => {
    const cells = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.slice(0, headers.length) ?? [];
    const clean = (v: string) => v.replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    const hg = Number(clean(cells[hgi] ?? ""));
    const ag = Number(clean(cells[agi] ?? ""));
    const result = clean(cells[ri] ?? "");
    return {
      date: clean(cells[di] ?? ""),
      home: clean(cells[hi] ?? ""),
      away: clean(cells[ai] ?? ""),
      hg: Number.isFinite(hg) ? hg : undefined,
      ag: Number.isFinite(ag) ? ag : undefined,
      result: result === "H" || result === "D" || result === "A" ? result : undefined,
    } satisfies MatchRow;
  }).filter((m) => m.home && m.away);
}

export async function loadFreeFixtures(): Promise<{ league: string; code: string; matches: MatchRow[] }[]> {
  const entries = Object.entries(LEAGUES);
  const settled = await Promise.allSettled(entries.map(async ([code, league]) => ({ code, league, matches: parseCsv(await (await fetch(csvUrl(code), { cache: "no-store" })).text()) })));
  return settled.flatMap((x) => x.status === "fulfilled" ? [x.value] : []);
}

export function findFixtures(all: { league: string; code: string; matches: MatchRow[] }[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all.flatMap((group) => group.matches
    .filter((m) => `${m.home} ${m.away}`.toLowerCase().includes(q) || (m.home.toLowerCase().includes(q) && m.away.toLowerCase().includes(q)))
    .slice(-12)
    .map((m) => ({ ...m, league: group.league, code: group.code }))
  ).slice(0, 24);
}

function snapshot(team: string, matches: MatchRow[], venue: "home" | "away"): TeamSnapshot {
  const played = matches.filter((m) => m.hg !== undefined && m.ag !== undefined).slice(-10);
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
  const recent: string[] = [];
  for (const m of played) {
    const isHome = m.home === team;
    const gf = isHome ? m.hg! : m.ag!;
    const ga = isHome ? m.ag! : m.hg!;
    goalsFor += gf; goalsAgainst += ga;
    if (gf > ga) { wins++; points += 3; recent.push("W"); }
    else if (gf === ga) { draws++; points += 1; recent.push("D"); }
    else { losses++; recent.push("L"); }
  }
  const venueGames = played.filter((m) => venue === "home" ? m.home === team : m.away === team);
  const venueWins = venueGames.filter((m) => venue === "home" ? m.hg! > m.ag! : m.ag! > m.hg!).length;
  return { team, played: played.length, wins, draws, losses, goalsFor, goalsAgainst, points, homeOrAwayRate: venueGames.length ? venueWins / venueGames.length : 0, recent };
}

function poissonUnder(lambda: number, line: number) {
  let p = 0;
  let term = Math.exp(-lambda);
  p += term;
  for (let k = 1; k <= line; k++) { term *= lambda / k; p += term; }
  return p;
}

export function analyzeMatch(fixture: MatchRow, allMatches: MatchRow[]): IntelligenceResult {
  const homeMatches = allMatches.filter((m) => m.home === fixture.home || m.away === fixture.home);
  const awayMatches = allMatches.filter((m) => m.home === fixture.away || m.away === fixture.away);
  const home = snapshot(fixture.home, homeMatches, "home");
  const away = snapshot(fixture.away, awayMatches, "away");
  const homeAttack = home.played ? home.goalsFor / home.played : 1.2;
  const homeDef = home.played ? home.goalsAgainst / home.played : 1.2;
  const awayAttack = away.played ? away.goalsFor / away.played : 1.2;
  const awayDef = away.played ? away.goalsAgainst / away.played : 1.2;
  const lh = Math.max(0.25, Math.min(3.5, (homeAttack * 0.65 + awayDef * 0.35) * (1 + home.homeOrAwayRate * 0.12)));
  const la = Math.max(0.2, Math.min(3.2, (awayAttack * 0.65 + homeDef * 0.35) * (1 - away.homeOrAwayRate * 0.05)));
  const rawH = 1 - poissonUnder(lh, 0) * poissonUnder(la, 0);
  const strength = (home.points / Math.max(1, home.played) - away.points / Math.max(1, away.played));
  const h = Math.max(0.05, 0.33 + strength * 0.06 + (lh - la) * 0.08);
  const a = Math.max(0.05, 0.27 - strength * 0.05 + (la - lh) * 0.08);
  const d = Math.max(0.08, 1 - h - a);
  const total = h + d + a;
  const homeP = h / total, drawP = d / total, awayP = a / total;
  const mean = lh + la;
  const totals: Record<string, number> = {};
  for (const line of [0.5, 1.5, 2.5, 3.5]) totals[`over${line}`] = 1 - poissonUnder(mean, Math.floor(line));
  const bttsYes = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
  const sample = home.played + away.played;
  const quality = Math.max(25, Math.min(96, 35 + sample * 2.4));
  const confidence = Math.max(28, Math.min(92, quality * 0.65 + Math.abs(homeP - awayP) * 100 * 0.35));
  const top = Math.max(homeP, drawP, awayP);
  const verdict = top < 0.47 ? "NO STRONG EDGE" : top < 0.56 ? "LEAN — MODEL CONFLICT" : homeP === top ? "HOME EDGE" : awayP === top ? "AWAY EDGE" : "DRAW LEAN";
  const warnings = sample < 8 ? ["Small local sample: treat probabilities as unstable."] : [];
  warnings.push("No bookmaker odds, injuries, lineups or xG provider loaded in FREE MODE.");
  return {
    home, away,
    probabilities: { home: homeP, draw: drawP, away: awayP },
    totals, btts: { yes: bttsYes, no: 1 - bttsYes },
    confidence: Math.round(confidence), quality: Math.round(quality), verdict,
    warnings,
    evidence: [
      `Free historical results: ${sample} completed team matches used.`,
      `Goal-rate model: λH ${lh.toFixed(2)} / λA ${la.toFixed(2)}.`,
      "Independent market odds are intentionally not assumed to be truth.",
    ],
  };
}

export function leagueNames() { return LEAGUES; }
