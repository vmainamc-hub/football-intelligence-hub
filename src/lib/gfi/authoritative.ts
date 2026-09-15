import type { MatchRow, IntelligenceResult, TeamSnapshot } from "./intelligence";

export type EngineId =
  | "FORM"
  | "GOALS"
  | "VENUE"
  | "TOTALS"
  | "BTTS"
  | "CONSISTENCY"
  | "H2H"
  | "DATA_QUALITY"
  | "CONSENSUS"
  | "MARKET";
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
  provider?: string;
  sourceFamily?: string;
  provenance?: string;
};
export type ActionablePrediction = {
  market: "HOME" | "DRAW" | "AWAY" | "OVER 1.5" | "OVER 2.5" | "OVER 3.5" | "BTTS";
  label: string;
  probability: number;
  strength: number;
};
export type AuthoritativeMatchAnalysis = IntelligenceResult & {
  analysisVersion: string;
  fixtureId: string;
  generatedAt: string;
  engines: EngineOutput[];
  evidenceLedger: EvidenceItem[];
  consensus: {
    home: number;
    draw: number;
    away: number;
    agreement: number;
    conflict: number;
    leader: "home" | "draw" | "away" | "none";
  };
  robustness: { score: number; label: "ROBUST" | "STABLE" | "FRAGILE" | "UNSTABLE" };
  risk: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  marketDivergence?: {
    available: boolean;
    home?: number;
    draw?: number;
    away?: number;
    note: string;
  };
  decision:
    | "HOME EDGE"
    | "DRAW LEAN"
    | "AWAY EDGE"
    | "NO STRONG EDGE"
    | "INSUFFICIENT INTELLIGENCE"
    | "HIGH MODEL CONFLICT";
  finalPrediction: string;
  predictedScore: string;
  predictions: ActionablePrediction[];
  aiReasoningPacket: Record<string, unknown>;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ppg = (t: TeamSnapshot) => t.points / Math.max(1, t.played);
const poissonAt = (lambda: number, k: number) => {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
};
const poissonUnder = (lambda: number, line: number) => {
  let p = Math.exp(-lambda),
    sum = p;
  for (let k = 1; k <= line; k++) {
    p *= lambda / k;
    sum += p;
  }
  return sum;
};
const round = (n: number, d = 2) => Number(n.toFixed(d));
const outcome = (h: number, a: number) => (h > a ? "H" : h === a ? "D" : ("A" as const));

function formEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const hp = ppg(h),
    ap = ppg(a),
    gap = hp - ap;
  const H = clamp(
      0.38 +
        gap * 0.075 +
        (h.recent.filter((x) => x === "W").length - a.recent.filter((x) => x === "L").length) *
          0.012,
      0.08,
      0.82,
    ),
    A = clamp(
      0.27 -
        gap * 0.06 +
        (a.recent.filter((x) => x === "W").length - h.recent.filter((x) => x === "L").length) *
          0.012,
      0.08,
      0.7,
    ),
    D = clamp(1 - H - A, 0.1, 0.48),
    t = H + D + A;
  return {
    id: "FORM",
    name: "Recent Form",
    version: "form-v2",
    signal: Math.abs(gap) >= 0.45 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.42 + Math.abs(gap) / 2.5) * 100),
    quality: Math.round(clamp(0.35 + (h.played + a.played) / 30) * 100),
    probabilities: { home: H / t, draw: D / t, away: A / t },
    values: { homePPG: round(hp), awayPPG: round(ap), pointsGap: round(gap) },
    evidence: [
      `${h.team}: ${hp.toFixed(2)} PPG from ${h.played} matches.`,
      `${a.team}: ${ap.toFixed(2)} PPG from ${a.played} matches.`,
    ],
    limitations: h.played + a.played < 8 ? ["Recent sample is small."] : [],
  };
}
function goalEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const lh = clamp(
      (h.goalsFor / Math.max(1, h.played)) * 0.62 + (a.goalsAgainst / Math.max(1, a.played)) * 0.38,
      0.25,
      3.6,
    ),
    la = clamp(
      (a.goalsFor / Math.max(1, a.played)) * 0.62 + (h.goalsAgainst / Math.max(1, h.played)) * 0.38,
      0.2,
      3.3,
    );
  let H = 0,
    D = 0,
    A = 0;
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) {
      const p = poissonAt(lh, i) * poissonAt(la, j);
      if (i > j) H += p;
      else if (i === j) D += p;
      else A += p;
    }
  const t = H + D + A;
  return {
    id: "GOALS",
    name: "Goal / Poisson",
    version: "goals-v2",
    signal: Math.abs(lh - la) >= 0.25 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.45 + Math.abs(lh - la) / 2.5) * 100),
    quality: 82,
    probabilities: { home: H / t, draw: D / t, away: A / t },
    values: { lambdaHome: round(lh), lambdaAway: round(la), expectedGoals: round(lh + la) },
    evidence: [`Expected goals baseline λH ${lh.toFixed(2)} / λA ${la.toFixed(2)}.`],
    limitations: [],
  };
}
function venueEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const hr = h.homeOrAwayRate,
    ar = a.homeOrAwayRate,
    H = clamp(0.43 + (hr - 0.5) * 0.28 - (ar - 0.5) * 0.1, 0.12, 0.76),
    A = clamp(0.27 + (ar - 0.5) * 0.2 - (hr - 0.5) * 0.05, 0.1, 0.66),
    D = clamp(1 - H - A, 0.12, 0.48),
    t = H + D + A;
  return {
    id: "VENUE",
    name: "Home / Away Venue",
    version: "venue-v2",
    signal: Math.abs(hr - ar) >= 0.2 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.45 + Math.abs(hr - ar)) * 100),
    quality: Math.round(clamp(0.4 + (h.played + a.played) / 32) * 100),
    probabilities: { home: H / t, draw: D / t, away: A / t },
    values: { homeVenueWinRate: hr, awayVenueWinRate: ar },
    evidence: [
      `Home venue win rate ${Math.round(hr * 100)}%.`,
      `Away venue win rate ${Math.round(ar * 100)}%.`,
    ],
    limitations: [],
  };
}
function totalsEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const hf = h.goalsFor / Math.max(1, h.played),
    af = a.goalsFor / Math.max(1, a.played),
    hc = h.goalsAgainst / Math.max(1, h.played),
    ac = a.goalsAgainst / Math.max(1, a.played),
    mean = clamp((hf + ac) * 0.55 + (af + hc) * 0.45, 0.45, 5.5),
    values: Record<string, number> = {};
  for (const line of [0.5, 1.5, 2.5, 3.5])
    values[`over${line}`] = clamp(1 - poissonUnder(mean, Math.floor(line)));
  return {
    id: "TOTALS",
    name: "Totals",
    version: "totals-v2",
    signal: values["over2.5"] >= 0.6 || values["over2.5"] <= 0.4 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round((0.48 + Math.abs(values["over2.5"] - 0.5)) * 100),
    quality: 78,
    values: { ...values, expectedGoals: mean },
    evidence: [
      `Expected total-goals rate ${mean.toFixed(2)}.`,
      `Over 2.5 baseline ${Math.round(values["over2.5"] * 100)}%.`,
    ],
    limitations: [],
  };
}
function bttsEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const lh = clamp(
      ((h.goalsFor + a.goalsAgainst) / Math.max(2, h.played + a.played)) * 2,
      0.2,
      3.5,
    ),
    la = clamp(((a.goalsFor + h.goalsAgainst) / Math.max(2, h.played + a.played)) * 2, 0.2, 3.5),
    yes = clamp((1 - Math.exp(-lh)) * (1 - Math.exp(-la)));
  return {
    id: "BTTS",
    name: "Both Teams To Score",
    version: "btts-v2",
    signal: yes >= 0.62 || yes <= 0.38 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round((0.45 + Math.abs(yes - 0.5)) * 100),
    quality: 76,
    values: { yes, no: 1 - yes },
    evidence: [`BTTS Yes ${Math.round(yes * 100)}% from scoring/conceding rates.`],
    limitations: [],
  };
}
function consistencyEngine(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const rate = (t: TeamSnapshot) => (t.played ? (t.wins + t.draws) / t.played : 0),
    pen = Math.abs(
      (h.goalsFor - h.goalsAgainst) / Math.max(1, h.played) -
        (a.goalsFor - a.goalsAgainst) / Math.max(1, a.played),
    ),
    q = clamp(0.82 - pen * 0.12, 0.3, 0.9);
  return {
    id: "CONSISTENCY",
    name: "Consistency / Variance",
    version: "consistency-v1",
    signal: pen < 0.45 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(q * 100),
    quality: Math.round(q * 100),
    values: { homeUnbeatenRate: rate(h), awayUnbeatenRate: rate(a), variancePenalty: pen },
    evidence: [
      `Unbeaten rate: ${h.team} ${Math.round(rate(h) * 100)}%, ${a.team} ${Math.round(rate(a) * 100)}%.`,
    ],
    limitations: [],
  };
}
function h2hEngine(f: MatchRow, all: MatchRow[]): EngineOutput {
  const hs = all
    .filter(
      (m) => (m.home === f.home && m.away === f.away) || (m.home === f.away && m.away === f.home),
    )
    .filter((m) => m.hg !== undefined && m.ag !== undefined)
    .slice(-8);
  if (!hs.length)
    return {
      id: "H2H",
      name: "Head-to-Head",
      version: "h2h-v1",
      signal: "LIMITATION",
      confidence: 0,
      quality: 20,
      values: { matches: 0 },
      evidence: ["No historical head-to-head result is present in the loaded free feed."],
      limitations: ["H2H unavailable."],
    };
  let H = 0,
    D = 0,
    A = 0;
  for (const m of hs) {
    const r = outcome(m.hg!, m.ag!);
    if (m.home === f.home) {
      if (r === "H") H++;
      else if (r === "D") D++;
      else A++;
    } else {
      if (r === "A") H++;
      else if (r === "D") D++;
      else A++;
    }
  }
  const n = hs.length;
  return {
    id: "H2H",
    name: "Head-to-Head",
    version: "h2h-v1",
    signal: n >= 4 ? "SUPPORT" : "NEUTRAL",
    confidence: Math.round(clamp(0.35 + n / 16) * 100),
    quality: Math.round(clamp(0.3 + n / 12) * 100),
    probabilities: { home: H / n, draw: D / n, away: A / n },
    values: { matches: n },
    evidence: [`${n} recent head-to-head results found in the loaded feed.`],
    limitations: [],
  };
}
function dq(h: TeamSnapshot, a: TeamSnapshot): EngineOutput {
  const sample = h.played + a.played,
    q = Math.round(clamp(0.3 + sample / 28) * 100);
  return {
    id: "DATA_QUALITY",
    name: "Data Quality",
    version: "dq-v2",
    signal: q >= 70 ? "SUPPORT" : "LIMITATION",
    confidence: q,
    quality: q,
    values: { completedMatches: sample },
    evidence: [`${sample} completed team-match observations available to the core.`],
    limitations: sample < 8 ? ["Small sample."] : [],
  };
}
function consensus(es: EngineOutput[]): EngineOutput {
  const u = es.filter((e) => e.probabilities),
    H = avg(u.map((e) => e.probabilities!.home)),
    D = avg(u.map((e) => e.probabilities!.draw)),
    A = avg(u.map((e) => e.probabilities!.away)),
    disp = avg(
      u.map((e) => Math.abs(e.probabilities!.home - H) + Math.abs(e.probabilities!.away - A)),
    );
  return {
    id: "CONSENSUS",
    name: "Consensus / Conflict",
    version: "consensus-v3",
    signal: disp < 0.12 ? "SUPPORT" : "CONTRADICTION",
    confidence: Math.round(clamp(1 - disp) * 100),
    quality: Math.round(clamp(0.55 + u.length / 20) * 100),
    probabilities: { home: H, draw: D, away: A },
    values: { agreement: clamp(1 - disp), conflict: clamp(disp) },
    evidence: [
      `${u.length} independent engines contributed to consensus.`,
      `Cross-engine dispersion ${disp.toFixed(3)}.`,
    ],
    limitations: u.length < 3 ? ["Few probability engines available."] : [],
  };
}

export function analyzeAuthoritatively(
  fixture: MatchRow,
  allMatches: MatchRow[],
): AuthoritativeMatchAnalysis {
  const snapshot = (team: string, ms: MatchRow[], venue: "home" | "away"): TeamSnapshot => {
    const played = ms.filter((m) => m.hg !== undefined && m.ag !== undefined).slice(-12);
    let wins = 0,
      draws = 0,
      losses = 0,
      gf = 0,
      ga = 0,
      points = 0;
    const recent: string[] = [];
    for (const m of played) {
      const ih = m.home === team,
        x = ih ? m.hg! : m.ag!,
        y = ih ? m.ag! : m.hg!;
      gf += x;
      ga += y;
      if (x > y) {
        wins++;
        points += 3;
        recent.push("W");
      } else if (x === y) {
        draws++;
        points++;
        recent.push("D");
      } else {
        losses++;
        recent.push("L");
      }
    }
    const vg = played.filter((m) => (venue === "home" ? m.home === team : m.away === team)),
      vw = vg.filter((m) => (venue === "home" ? m.hg! > m.ag! : m.ag! > m.hg!)).length;
    return {
      team,
      played: played.length,
      wins,
      draws,
      losses,
      goalsFor: gf,
      goalsAgainst: ga,
      points,
      homeOrAwayRate: vg.length ? vw / vg.length : 0,
      recent,
    };
  };
  const home = snapshot(
      fixture.home,
      allMatches.filter((m) => m.home === fixture.home || m.away === fixture.home),
      "home",
    ),
    away = snapshot(
      fixture.away,
      allMatches.filter((m) => m.home === fixture.away || m.away === fixture.away),
      "away",
    );
  const engines = [
    formEngine(home, away),
    goalEngine(home, away),
    venueEngine(home, away),
    totalsEngine(home, away),
    bttsEngine(home, away),
    consistencyEngine(home, away),
    h2hEngine(fixture, allMatches),
    dq(home, away),
  ];
  const con = consensus(engines);
  engines.push(con);
  const probs = con.probabilities!;
  const total = engines.find((e) => e.id === "TOTALS")!,
    bttsE = engines.find((e) => e.id === "BTTS")!;
  const agreement = con.values.agreement,
    conflict = con.values.conflict,
    sampleQ = avg(engines.filter((e) => e.id !== "CONSENSUS").map((e) => e.quality)),
    quality = Math.round(clamp(sampleQ * 0.65 + agreement * 35, 20, 96));
  const top = Math.max(probs.home, probs.draw, probs.away),
    spread = top - Math.min(probs.home, probs.draw, probs.away);
  let decision: AuthoritativeMatchAnalysis["decision"] = "NO STRONG EDGE";
  if (home.played + away.played < 8 || quality < 42) decision = "INSUFFICIENT INTELLIGENCE";
  else if (conflict >= 0.14 && spread < 0.18) decision = "HIGH MODEL CONFLICT";
  else if (top < 0.47) decision = "NO STRONG EDGE";
  else if (probs.home === top && top >= 0.52) decision = "HOME EDGE";
  else if (probs.away === top && top >= 0.52) decision = "AWAY EDGE";
  else if (probs.draw === top && top >= 0.4) decision = "DRAW LEAN";
  const confidence = Math.round(
      clamp(0.35 + agreement * 0.35 + Math.abs(top - 1 / 3) * 0.9 + quality / 500) * 100,
    ),
    warnings = [
      ...new Set(engines.flatMap((e) => e.limitations)),
      "FREE MODE has no bookmaker odds, confirmed lineups, injuries, xG provider or live news feed attached.",
    ],
    ledger: EvidenceItem[] = [
      {
        id: "free-results",
        source: "FREE_RESULTS",
        statement: `Free historical results: ${home.played} home-team observations and ${away.played} away-team observations.`,
        quality: Math.round(sampleQ),
      },
      ...engines.flatMap((e) =>
        e.evidence.map((statement, i) => ({
          id: `${e.id}-${i}`,
          source: "DERIVED_MODEL" as const,
          statement,
          quality: e.quality,
        })),
      ),
    ];
  const risk: AuthoritativeMatchAnalysis["risk"] =
      quality < 45
        ? "VERY HIGH"
        : quality < 60 || conflict >= 0.18
          ? "HIGH"
          : conflict >= 0.12
            ? "MODERATE"
            : "LOW",
    robustnessScore = Math.round(clamp((quality / 100) * 0.6 + agreement * 0.4) * 100),
    robustness: AuthoritativeMatchAnalysis["robustness"] = {
      score: robustnessScore,
      label:
        robustnessScore >= 78
          ? "ROBUST"
          : robustnessScore >= 62
            ? "STABLE"
            : robustnessScore >= 45
              ? "FRAGILE"
              : "UNSTABLE",
    };
  const totals: Record<string, number> = {};
  for (const [k, v] of Object.entries(total.values)) if (k.startsWith("over")) totals[k] = v;
  const btts = { yes: bttsE.values.yes, no: bttsE.values.no };
  const scorelines = poissonScorelineProbabilities({ engines } as AuthoritativeMatchAnalysis),
    predictedScore = scorelines[0]?.score ?? "—";
  const candidates: ActionablePrediction[] = [
    {
      market: "HOME",
      label: home.team,
      probability: probs.home,
      strength: Math.max(0, probs.home - 1 / 3),
    },
    {
      market: "DRAW",
      label: "Draw",
      probability: probs.draw,
      strength: Math.max(0, probs.draw - 1 / 3),
    },
    {
      market: "AWAY",
      label: away.team,
      probability: probs.away,
      strength: Math.max(0, probs.away - 1 / 3),
    },
    {
      market: "OVER 1.5",
      label: "Over 1.5",
      probability: totals["over1.5"] ?? 0,
      strength: Math.max(0, (totals["over1.5"] ?? 0) - 0.55),
    },
    {
      market: "OVER 2.5",
      label: "Over 2.5",
      probability: totals["over2.5"] ?? 0,
      strength: Math.max(0, (totals["over2.5"] ?? 0) - 0.5),
    },
    {
      market: "OVER 3.5",
      label: "Over 3.5",
      probability: totals["over3.5"] ?? 0,
      strength: Math.max(0, (totals["over3.5"] ?? 0) - 0.4),
    },
    { market: "BTTS", label: "BTTS", probability: btts.yes, strength: Math.max(0, btts.yes - 0.5) },
  ];
  const predictions = candidates
    .filter(
      (p) =>
        p.probability >= (p.market === "OVER 1.5" ? 0.62 : p.market === "OVER 3.5" ? 0.55 : 0.57),
    )
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
  const finalPrediction =
    decision === "HOME EDGE"
      ? `${home.team} win`
      : decision === "AWAY EDGE"
        ? `${away.team} win`
        : decision === "DRAW LEAN"
          ? "Draw"
          : (predictions[0]?.label ?? "No strong prediction");
  const evidence = ledger.slice(0, 8).map((x) => x.statement),
    aiReasoningPacket = {
      fixture,
      analysisVersion: "gfi-authoritative-v4",
      decision,
      finalPrediction,
      predictedScore,
      probabilities: probs,
      totals,
      btts,
      confidence,
      quality,
      consensus: con,
      robustness,
      risk,
      engines,
      evidence: ledger,
      predictions,
      instruction:
        "Return only actionable predictions and a concise final verdict. Never invent missing facts or override the quantitative analysis.",
    };
  return {
    home,
    away,
    probabilities: probs,
    totals,
    btts,
    confidence,
    quality,
    verdict: decision,
    warnings,
    evidence,
    analysisVersion: "gfi-authoritative-v4",
    fixtureId: `${fixture.date}__${fixture.home}__${fixture.away}`,
    generatedAt: new Date().toISOString(),
    engines,
    evidenceLedger: ledger,
    consensus: {
      ...con.probabilities!,
      agreement,
      conflict,
      leader:
        top < 0.42 ? "none" : probs.home === top ? "home" : probs.draw === top ? "draw" : "away",
    },
    robustness,
    risk,
    marketDivergence: {
      available: false,
      note: "No bookmaker odds are loaded in FREE MODE; no market edge is claimed.",
    },
    decision,
    finalPrediction,
    predictedScore,
    predictions,
    aiReasoningPacket,
  };
}

export function scoreAuthoritativeAnalysis(a: AuthoritativeMatchAnalysis) {
  const edge = Math.max(a.probabilities.home, a.probabilities.draw, a.probabilities.away) - 1 / 3;
  return edge * 50 + a.confidence * 0.25 + a.robustness.score * 0.15 + a.quality * 0.1;
}
export function poissonScorelineProbabilities(a: AuthoritativeMatchAnalysis, maxGoals = 8) {
  const goal = a.engines.find((e) => e.id === "GOALS"),
    lh = Number(goal?.values.lambdaHome ?? 1.2),
    la = Number(goal?.values.lambdaAway ?? 1);
  const rows: { score: string; probability: number }[] = [];
  for (let h = 0; h <= maxGoals; h++)
    for (let d = 0; d <= maxGoals; d++)
      rows.push({ score: `${h}-${d}`, probability: poissonAt(lh, h) * poissonAt(la, d) });
  return rows.sort((x, y) => y.probability - x.probability);
}
