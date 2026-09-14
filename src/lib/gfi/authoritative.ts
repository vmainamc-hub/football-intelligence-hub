import type { MatchRow, IntelligenceResult, TeamSnapshot } from "./intelligence";

export type EngineId = "FORM" | "GOALS" | "VENUE" | "TOTALS" | "BTTS" | "CONSISTENCY" | "H2H" | "DATA_QUALITY" | "CONSENSUS" | "MARKET";
export type Signal = "SUPPORT" | "CONTRADICTION" | "NEUTRAL" | "LIMITATION";

export type EngineOutput = {
  id: EngineId;
  name: string;
  version: string;
  signal: Signal;
  confidence: number;
  quality: number;
  probabilities?: { home: number; draw: number; away: number };
  values: Record<string, number>;
  evidence: string[];
  limitations: string[];
};

export type EvidenceItem = {
  id: string;
  source: "FREE_RESULTS" | "DERIVED_MODEL" | "OPTIONAL_PROVIDER";
  statement: string;
  quality: number;
};

export type AuthoritativeMatchAnalysis = IntelligenceResult & {
  analysisVersion: string;
  fixtureId: string;
  generatedAt: string;
  engines: EngineOutput[];
  evidenceLedger: EvidenceItem[];
  consensus: { home: number; draw: number; away: number; agreement: number; conflict: number; leader: "home" | "draw" | "away" | "none" };
  robustness: { score: number; label: "ROBUST" | "STABLE" | "FRAGILE" | "UNSTABLE" };
  risk: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  marketDivergence?: { available: boolean; home?: number; draw?: number; away?: number; note: string };
  decision: "HOME EDGE" | "DRAW LEAN" | "AWAY EDGE" | "NO STRONG EDGE" | "INSUFFICIENT INTELLIGENCE" | "HIGH MODEL CONFLICT";
  aiReasoningPacket: Record<string, unknown>;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const round = (n: number, d = 4) => Number(n.toFixed(d));
const ppg = (t: TeamSnapshot) => t.points / Math.max(1, t.played);

function poissonUnder(lambda: number, line: number) {
  let p = Math.exp(-lambda), sum = p;
  for (let k = 1; k <= line; k++) { p *= lambda / k; sum += p; }
  return sum;
}

function poissonAt(lambda: number, k: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function outcomeFromGoals(h: number, a: number): "H" | "D" | "A" { return h > a ? "H" : h === a ? "D" : "A"; }

function formEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const hp = ppg(home), ap = ppg(away);
  const gap = hp - ap;
  const homeProb = clamp(0.38 + gap * 0.075 + (home.recent.filter(x => x === "W").length - away.recent.filter(x => x === "L").length) * 0.012, .08, .82);
  const awayProb = clamp(0.27 - gap * 0.06 + (away.recent.filter(x => x === "W").length - home.recent.filter(x => x === "L").length) * 0.012, .08, .70);
  const drawProb = clamp(1 - homeProb - awayProb, .10, .48);
  const total = homeProb + drawProb + awayProb;
  const probabilities = { home: homeProb / total, draw: drawProb / total, away: awayProb / total };
  return { id: "FORM", name: "Recent Form", version: "form-v2", signal: Math.abs(gap) >= .45 ? "SUPPORT" : "NEUTRAL", confidence: Math.round(clamp(.42 + Math.abs(gap) / 2.5) * 100), quality: Math.round(clamp(.35 + (home.played + away.played) / 30) * 100), probabilities, values: { homePPG: round(hp, 2), awayPPG: round(ap, 2), pointsGap: round(gap, 2) }, evidence: [`${home.team}: ${hp.toFixed(2)} PPG from ${home.played} matches.`, `${away.team}: ${ap.toFixed(2)} PPG from ${away.played} matches.`], limitations: home.played + away.played < 8 ? ["Recent sample is small."] : [] };
}

function goalEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const lh = clamp((home.goalsFor / Math.max(1, home.played)) * .62 + (away.goalsAgainst / Math.max(1, away.played)) * .38, .25, 3.6);
  const la = clamp((away.goalsFor / Math.max(1, away.played)) * .62 + (home.goalsAgainst / Math.max(1, home.played)) * .38, .20, 3.3);
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const p = poissonAt(lh, i) * poissonAt(la, j); if (i > j) h += p; else if (i === j) d += p; else a += p; }
  const total = h + d + a;
  return { id: "GOALS", name: "Goal / Poisson", version: "goals-v2", signal: Math.abs(lh - la) >= .25 ? "SUPPORT" : "NEUTRAL", confidence: Math.round(clamp(.45 + Math.abs(lh - la) / 2.5) * 100), quality: 82, probabilities: { home: h / total, draw: d / total, away: a / total }, values: { lambdaHome: round(lh, 2), lambdaAway: round(la, 2), expectedGoals: round(lh + la, 2) }, evidence: [`Expected goals baseline λH ${lh.toFixed(2)} / λA ${la.toFixed(2)}.`, "Probability mass is calculated across score states 0–8."], limitations: [] };
}

function venueEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const homeRate = home.homeOrAwayRate, awayRate = away.homeOrAwayRate;
  const homeProb = clamp(.43 + (homeRate - .5) * .28 - (awayRate - .5) * .10, .12, .76);
  const awayProb = clamp(.27 + (awayRate - .5) * .20 - (homeRate - .5) * .05, .10, .66);
  const drawProb = clamp(1 - homeProb - awayProb, .12, .48);
  const total = homeProb + drawProb + awayProb;
  return { id: "VENUE", name: "Home / Away Venue", version: "venue-v2", signal: Math.abs(homeRate - awayRate) >= .20 ? "SUPPORT" : "NEUTRAL", confidence: Math.round(clamp(.45 + Math.abs(homeRate - awayRate)) * 100), quality: Math.round(clamp(.40 + (home.played + away.played) / 32) * 100), probabilities: { home: homeProb / total, draw: drawProb / total, away: awayProb / total }, values: { homeVenueWinRate: homeRate, awayVenueWinRate: awayRate }, evidence: [`Home venue win rate ${Math.round(homeRate * 100)}%.`, `Away venue win rate ${Math.round(awayRate * 100)}%.`], limitations: [] };
}

function totalsEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const lh = home.goalsFor / Math.max(1, home.played), la = away.goalsFor / Math.max(1, away.played);
  const homeCon = home.goalsAgainst / Math.max(1, home.played), awayCon = away.goalsAgainst / Math.max(1, away.played);
  const mean = clamp((lh + awayCon) * .55 + (la + homeCon) * .45, .45, 5.5);
  const values: Record<string, number> = {};
  for (const line of [.5, 1.5, 2.5, 3.5]) values[`over${line}`] = clamp(1 - poissonUnder(mean, Math.floor(line)));
  return { id: "TOTALS", name: "Totals", version: "totals-v2", signal: values.over2.5 >= .60 || values.over2.5 <= .40 ? "SUPPORT" : "NEUTRAL", confidence: Math.round((.48 + Math.abs(values.over2.5 - .5)) * 100), quality: 78, values: { ...values, expectedGoals: mean }, evidence: [`Expected total-goals rate ${mean.toFixed(2)}.`, `Over 2.5 baseline ${Math.round(values.over2.5 * 100)}%.`], limitations: [] };
}

function bttsEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const lh = clamp((home.goalsFor + away.goalsAgainst) / Math.max(2, home.played + away.played) * 2, .2, 3.5);
  const la = clamp((away.goalsFor + home.goalsAgainst) / Math.max(2, home.played + away.played) * 2, .2, 3.5);
  const yes = clamp((1 - Math.exp(-lh)) * (1 - Math.exp(-la)));
  return { id: "BTTS", name: "Both Teams To Score", version: "btts-v2", signal: yes >= .62 || yes <= .38 ? "SUPPORT" : "NEUTRAL", confidence: Math.round((.45 + Math.abs(yes - .5)) * 100), quality: 76, values: { yes, no: 1 - yes }, evidence: [`BTTS Yes ${Math.round(yes * 100)}% from scoring/conceding rates.`], limitations: [] };
}

function consistencyEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const rate = (t: TeamSnapshot) => t.played ? (t.wins + t.draws) / t.played : 0;
  const homeStability = rate(home), awayStability = rate(away);
  const variancePenalty = Math.abs((home.goalsFor - home.goalsAgainst) / Math.max(1, home.played) - (away.goalsFor - away.goalsAgainst) / Math.max(1, away.played));
  const quality = clamp(.82 - variancePenalty * .12, .30, .90);
  return { id: "CONSISTENCY", name: "Consistency / Variance", version: "consistency-v1", signal: variancePenalty < .45 ? "SUPPORT" : "CONTRADICTION", confidence: Math.round(quality * 100), quality: Math.round(quality * 100), values: { homeUnbeatenRate: homeStability, awayUnbeatenRate: awayStability, variancePenalty }, evidence: [`Unbeaten rate: ${home.team} ${Math.round(homeStability * 100)}%, ${away.team} ${Math.round(awayStability * 100)}%.`], limitations: [] };
}

function h2hEngine(fixture: MatchRow, all: MatchRow[]): EngineOutput {
  const h2h = all.filter(m => (m.home === fixture.home && m.away === fixture.away) || (m.home === fixture.away && m.away === fixture.home)).filter(m => m.hg !== undefined && m.ag !== undefined).slice(-8);
  if (!h2h.length) return { id: "H2H", name: "Head-to-Head", version: "h2h-v1", signal: "LIMITATION", confidence: 0, quality: 20, values: { matches: 0 }, evidence: ["No historical head-to-head result is present in the loaded free feed."], limitations: ["H2H unavailable."] };
  let h = 0, d = 0, a = 0;
  h2h.forEach(m => { const r = outcomeFromGoals(m.hg!, m.ag!); if (m.home === fixture.home) { if (r === "H") h++; else if (r === "D") d++; else a++; } else { if (r === "A") h++; else if (r === "D") d++; else a++; } });
  const n = h2h.length;
  return { id: "H2H", name: "Head-to-Head", version: "h2h-v1", signal: n >= 4 ? "SUPPORT" : "NEUTRAL", confidence: Math.round(clamp(.35 + n / 16) * 100), quality: Math.round(clamp(.30 + n / 12) * 100), probabilities: { home: h / n, draw: d / n, away: a / n }, values: { matches: n }, evidence: [`${n} recent head-to-head results found in the loaded feed.`], limitations: [] };
}

function dataQualityEngine(home: TeamSnapshot, away: TeamSnapshot): EngineOutput {
  const sample = home.played + away.played;
  const quality = Math.round(clamp(.30 + sample / 28) * 100);
  return { id: "DATA_QUALITY", name: "Data Quality", version: "dq-v2", signal: quality >= 70 ? "SUPPORT" : "LIMITATION", confidence: quality, quality, values: { completedMatches: sample }, evidence: [`${sample} completed team-match observations available to the core.`], limitations: sample < 8 ? ["Small sample."] : [] };
}

function consensusEngine(engines: EngineOutput[]): EngineOutput {
  const usable = engines.filter(e => e.probabilities);
  const home = avg(usable.map(e => e.probabilities!.home)), draw = avg(usable.map(e => e.probabilities!.draw)), away = avg(usable.map(e => e.probabilities!.away));
  const dispersion = avg(usable.map(e => Math.abs(e.probabilities!.home - home) + Math.abs(e.probabilities!.away - away)));
  return { id: "CONSENSUS", name: "Consensus / Conflict", version: "consensus-v2", signal: dispersion < .12 ? "SUPPORT" : "CONTRADICTION", confidence: Math.round(clamp(1 - dispersion) * 100), quality: Math.round(clamp(.55 + usable.length / 20) * 100), probabilities: { home, draw, away }, values: { agreement: clamp(1 - dispersion), conflict: clamp(dispersion) }, evidence: [`${usable.length} independent engines contributed to consensus.`, `Cross-engine dispersion ${dispersion.toFixed(3)}.`], limitations: usable.length < 3 ? ["Few probability engines available."] : [] };
}

export function analyzeAuthoritatively(fixture: MatchRow, allMatches: MatchRow[]): AuthoritativeMatchAnalysis {
  const homeMatches = allMatches.filter(m => m.home === fixture.home || m.away === fixture.home);
  const awayMatches = allMatches.filter(m => m.home === fixture.away || m.away === fixture.away);
  const makeSnapshot = (team: string, matches: MatchRow[], venue: "home" | "away"): TeamSnapshot => {
    const played = matches.filter(m => m.hg !== undefined && m.ag !== undefined).slice(-12);
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0, points = 0;
    const recent: string[] = [];
    for (const m of played) { const isHome = m.home === team; const gf = isHome ? m.hg! : m.ag!; const ga = isHome ? m.ag! : m.hg!; goalsFor += gf; goalsAgainst += ga; if (gf > ga) { wins++; points += 3; recent.push("W"); } else if (gf === ga) { draws++; points++; recent.push("D"); } else { losses++; recent.push("L"); } }
    const venueGames = played.filter(m => venue === "home" ? m.home === team : m.away === team);
    const venueWins = venueGames.filter(m => venue === "home" ? m.hg! > m.ag! : m.ag! > m.hg!).length;
    return { team, played: played.length, wins, draws, losses, goalsFor, goalsAgainst, points, homeOrAwayRate: venueGames.length ? venueWins / venueGames.length : 0, recent };
  };
  const home = makeSnapshot(fixture.home, homeMatches, "home"), away = makeSnapshot(fixture.away, awayMatches, "away");
  const engines = [formEngine(home, away), goalEngine(home, away), venueEngine(home, away), totalsEngine(home, away), bttsEngine(home, away), consistencyEngine(home, away), h2hEngine(fixture, allMatches), dataQualityEngine(home, away)];
  const consensus = consensusEngine(engines);
  engines.push(consensus);
  const probabilities = consensus.probabilities!;
  const totalsEngineOut = engines.find(e => e.id === "TOTALS")!;
  const bttsOut = engines.find(e => e.id === "BTTS")!;
  const agreement = consensus.values.agreement, conflict = consensus.values.conflict;
  const sampleQuality = avg(engines.filter(e => e.id !== "CONSENSUS").map(e => e.quality));
  const quality = Math.round(clamp(sampleQuality * .65 + agreement * 35, 20, 96));
  const top = Math.max(probabilities.home, probabilities.draw, probabilities.away);
  const spread = top - Math.min(probabilities.home, probabilities.draw, probabilities.away);
  let decision: AuthoritativeMatchAnalysis["decision"] = "NO STRONG EDGE";
  if (home.played + away.played < 8 || quality < 42) decision = "INSUFFICIENT INTELLIGENCE";
  else if (conflict >= .14 && spread < .18) decision = "HIGH MODEL CONFLICT";
  else if (top < .47) decision = "NO STRONG EDGE";
  else if (probabilities.home === top && top >= .52) decision = "HOME EDGE";
  else if (probabilities.away === top && top >= .52) decision = "AWAY EDGE";
  else if (probabilities.draw === top && top >= .40) decision = "DRAW LEAN";
  const confidence = Math.round(clamp(.35 + agreement * .35 + Math.abs(top - 1/3) * .9 + quality / 500) * 100);
  const warnings = [...new Set(engines.flatMap(e => e.limitations))];
  warnings.push("FREE MODE has no bookmaker odds, confirmed lineups, injuries, xG provider or live news feed attached.");
  const evidenceLedger: EvidenceItem[] = [
    { id: "free-results", source: "FREE_RESULTS", statement: `Free historical results: ${home.played} home-team observations and ${away.played} away-team observations.`, quality: Math.round(sampleQuality) },
    ...engines.flatMap(e => e.evidence.map((statement, i) => ({ id: `${e.id}-${i}`, source: "DERIVED_MODEL" as const, statement, quality: e.quality }))),
  ];
  const risk: AuthoritativeMatchAnalysis["risk"] = quality < 45 ? "VERY HIGH" : quality < 60 || conflict >= .18 ? "HIGH" : conflict >= .12 ? "MODERATE" : "LOW";
  const robustnessScore = Math.round(clamp(quality / 100 * .6 + agreement * .4) * 100);
  const robustness: AuthoritativeMatchAnalysis["robustness"] = { score: robustnessScore, label: robustnessScore >= 78 ? "ROBUST" : robustnessScore >= 62 ? "STABLE" : robustnessScore >= 45 ? "FRAGILE" : "UNSTABLE" };
  const totals: Record<string, number> = { ...Object.fromEntries(Object.entries(totalsEngineOut.values).filter(([k]) => k.startsWith("over"))) };
  const btts = { yes: bttsOut.values.yes, no: bttsOut.values.no };
  const warningsEvidence = warnings;
  const evidence = evidenceLedger.slice(0, 8).map(x => x.statement);
  const aiReasoningPacket = { fixture, analysisVersion: "gfi-authoritative-v3", decision, probabilities, totals, btts, confidence, quality, consensus, robustness, risk, engines, evidence: evidenceLedger, warnings: warningsEvidence, instruction: "Synthesize only supplied evidence. Never invent missing facts, odds, injuries, lineups, xG, news or probabilities. Never override the authoritative decision without new verified evidence." };
  return { home, away, probabilities, totals, btts, confidence, quality, verdict: decision, warnings, evidence, analysisVersion: "gfi-authoritative-v3", fixtureId: `${fixture.date}__${fixture.home}__${fixture.away}`, generatedAt: new Date().toISOString(), engines, evidenceLedger, consensus: { ...consensus.probabilities!, agreement, conflict, leader: top < .42 ? "none" : probabilities.home === top ? "home" : probabilities.draw === top ? "draw" : "away" }, robustness, risk, marketDivergence: { available: false, note: "No bookmaker odds are loaded in FREE MODE; no market edge is claimed." }, decision, aiReasoningPacket };
}

export function scoreAuthoritativeAnalysis(a: AuthoritativeMatchAnalysis) {
  const edge = Math.max(a.probabilities.home, a.probabilities.draw, a.probabilities.away) - 1 / 3;
  return edge * 100 * .50 + a.confidence * .25 + a.robustness.score * .15 + a.quality * .10;
}

export function poissonScorelineProbabilities(a: AuthoritativeMatchAnalysis, maxGoals = 8) {
  const goal = a.engines.find(e => e.id === "GOALS");
  const lh = goal?.values.lambdaHome ?? 1.2, la = goal?.values.lambdaAway ?? 1.0;
  const rows: { score: string; probability: number }[] = [];
  for (let h = 0; h <= maxGoals; h++) for (let d = 0; d <= maxGoals; d++) rows.push({ score: `${h}-${d}`, probability: poissonAt(lh, h) * poissonAt(la, d) });
  return rows.sort((x, y) => y.probability - x.probability);
}
