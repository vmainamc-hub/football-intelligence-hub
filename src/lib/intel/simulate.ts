import { mulberry32 } from "./math";
import type { SimulationResult } from "./types";

/**
 * Minute-resolution Monte Carlo match simulation.
 * Goals arrive as a non-homogeneous Bernoulli process across 90 minutes,
 * so the run produces real match states (who scores first, comebacks,
 * late winners) rather than a decorative scoreline sample.
 */
export function simulateMatch(
  lambdaHome: number,
  lambdaAway: number,
  runs: number,
  seed: number,
  rho = -0.05,
): SimulationResult {
  const rnd = mulberry32(seed);
  const minutes = 90;
  const scoreCounts = new Map<string, number>();
  const totalCounts = new Array(11).fill(0);

  let home = 0,
    draw = 0,
    away = 0,
    btts = 0;
  let homeScored = 0,
    homeTwo = 0,
    awayScored = 0,
    awayTwo = 0;
  const totalsAtMost = [0, 0, 0, 0];
  let homeFirst = 0,
    awayFirst = 0,
    noGoal = 0,
    homeComeback = 0,
    awayComeback = 0,
    firstHalfGoal = 0,
    lateWinner = 0;

  for (let r = 0; r < runs; r++) {
    // Per-match intensity noise: teams are not identical every week.
    const shockH = Math.exp((rnd() - 0.5) * 0.34);
    const shockA = Math.exp((rnd() - 0.5) * 0.34);
    const ph = (lambdaHome * shockH) / minutes;
    const pa = (lambdaAway * shockA) / minutes;

    let hg = 0,
      ag = 0;
    let first: "H" | "A" | null = null;
    let hLed = false,
      aLed = false;
    let goalBefore45 = false;
    let leadChangedLate = false;
    let leaderAt80: "H" | "A" | "D" = "D";

    for (let m = 1; m <= minutes; m++) {
      // slight tempo curve: more goals late in each half
      const tempo = 0.85 + 0.3 * (m / minutes);
      if (rnd() < ph * tempo) {
        hg++;
        if (!first) first = "H";
        if (m <= 45) goalBefore45 = true;
      }
      if (rnd() < pa * tempo) {
        ag++;
        if (!first) first = "A";
        if (m <= 45) goalBefore45 = true;
      }
      if (hg > ag) hLed = true;
      if (ag > hg) aLed = true;
      if (m === 80) leaderAt80 = hg > ag ? "H" : ag > hg ? "A" : "D";
    }

    const finalLeader = hg > ag ? "H" : ag > hg ? "A" : "D";
    if (leaderAt80 !== finalLeader && finalLeader !== "D") leadChangedLate = true;

    if (hg > ag) home++;
    else if (hg === ag) draw++;
    else away++;
    if (hg > 0 && ag > 0) btts++;
    if (hg >= 1) homeScored++;
    if (hg >= 2) homeTwo++;
    if (ag >= 1) awayScored++;
    if (ag >= 2) awayTwo++;
    const t = hg + ag;
    for (let k = 0; k < 4; k++) if (t <= k) totalsAtMost[k] = totalsAtMost[k]! + 1;
    totalCounts[Math.min(t, 10)] = totalCounts[Math.min(t, 10)]! + 1;

    const key = `${Math.min(hg, 9)}-${Math.min(ag, 9)}`;
    scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);

    if (first === "H") homeFirst++;
    else if (first === "A") awayFirst++;
    else noGoal++;
    if (first === "A" && hg > ag) homeComeback++;
    if (first === "H" && ag > hg) awayComeback++;
    if (goalBefore45) firstHalfGoal++;
    if (leadChangedLate) lateWinner++;
    void hLed;
    void aLed;
    void rho;
  }

  const n = runs;
  const p = (x: number) => x / n;
  const topScores = [...scoreCounts.entries()]
    .map(([score, c]) => ({ score, p: c / n }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 12);

  return {
    runs,
    markets: {
      home: p(home),
      draw: p(draw),
      away: p(away),
      dc1x: p(home + draw),
      dcx2: p(away + draw),
      dc12: p(home + away),
      under05: p(totalsAtMost[0]!),
      under15: p(totalsAtMost[1]!),
      under25: p(totalsAtMost[2]!),
      under35: p(totalsAtMost[3]!),
      over05: 1 - p(totalsAtMost[0]!),
      over15: 1 - p(totalsAtMost[1]!),
      over25: 1 - p(totalsAtMost[2]!),
      over35: 1 - p(totalsAtMost[3]!),
      bttsYes: p(btts),
      bttsNo: 1 - p(btts),
      homeOver05: p(homeScored),
      homeOver15: p(homeTwo),
      awayOver05: p(awayScored),
      awayOver15: p(awayTwo),
    },
    topScores,
    goalDistribution: totalCounts.map((c, goals) => ({ goals, p: c / n })),
    scenarios: {
      homeScoresFirst: p(homeFirst),
      awayScoresFirst: p(awayFirst),
      noGoal: p(noGoal),
      homeComeback: p(homeComeback),
      awayComeback: p(awayComeback),
      firstHalfGoal: p(firstHalfGoal),
      lateWinner: p(lateWinner),
    },
  };
}
