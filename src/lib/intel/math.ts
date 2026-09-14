import type { Market, MarketSurface } from "./types";

export const MAX_GOALS = 10;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** Negative binomial pmf with mean `mu` and dispersion `r` (larger r -> closer to Poisson). */
export function negBinomialPmf(k: number, mu: number, r: number): number {
  const p = r / (r + mu);
  let logCoef = 0;
  for (let i = 1; i <= k; i++) logCoef += Math.log(r + i - 1) - Math.log(i);
  return Math.exp(logCoef + r * Math.log(p) + k * Math.log(1 - p));
}

/** Dixon-Coles low-score dependency correction. */
export function dixonColesTau(x: number, y: number, lh: number, la: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

export type ScoreMatrix = number[][];

export function scoreMatrix(
  lh: number,
  la: number,
  opts: { rho?: number; dispersion?: number } = {},
): ScoreMatrix {
  const rho = opts.rho ?? 0;
  const disp = opts.dispersion;
  const m: ScoreMatrix = [];
  let total = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    m[x] = [];
    for (let y = 0; y <= MAX_GOALS; y++) {
      const px = disp ? negBinomialPmf(x, lh, disp) : poissonPmf(x, lh);
      const py = disp ? negBinomialPmf(y, la, disp) : poissonPmf(y, la);
      const v = px * py * dixonColesTau(x, y, lh, la, rho);
      m[x]![y] = Math.max(v, 0);
      total += m[x]![y]!;
    }
  }
  for (let x = 0; x <= MAX_GOALS; x++)
    for (let y = 0; y <= MAX_GOALS; y++) m[x]![y] = m[x]![y]! / total;
  return m;
}

export function marketsFromMatrix(m: ScoreMatrix): MarketSurface {
  let home = 0,
    draw = 0,
    away = 0,
    btts = 0;
  const totals = [0, 0, 0, 0, 0]; // P(total = 0..3), index 4 = 4+
  let homeScored = 0,
    homeTwoPlus = 0,
    awayScored = 0,
    awayTwoPlus = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const p = m[x]![y]!;
      if (x > y) home += p;
      else if (x === y) draw += p;
      else away += p;
      if (x > 0 && y > 0) btts += p;
      const t = x + y;
      totals[Math.min(t, 4)] = totals[Math.min(t, 4)]! + p;
      if (x >= 1) homeScored += p;
      if (x >= 2) homeTwoPlus += p;
      if (y >= 1) awayScored += p;
      if (y >= 2) awayTwoPlus += p;
    }
  }
  const under05 = totals[0]!;
  const under15 = under05 + totals[1]!;
  const under25 = under15 + totals[2]!;
  const under35 = under25 + totals[3]!;
  return {
    home,
    draw,
    away,
    dc1x: home + draw,
    dcx2: away + draw,
    dc12: home + away,
    under05,
    under15,
    under25,
    under35,
    over05: 1 - under05,
    over15: 1 - under15,
    over25: 1 - under25,
    over35: 1 - under35,
    bttsYes: btts,
    bttsNo: 1 - btts,
    homeOver05: homeScored,
    homeOver15: homeTwoPlus,
    awayOver05: awayScored,
    awayOver15: awayTwoPlus,
  };
}

export function clamp(x: number, lo = 0.001, hi = 0.999): number {
  return Math.max(lo, Math.min(hi, x));
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function fairOdds(p: number): number {
  return p > 0 ? 1 / p : 0;
}

export const COMPLEMENTS: [Market, Market][] = [
  ["over05", "under05"],
  ["over15", "under15"],
  ["over25", "under25"],
  ["over35", "under35"],
  ["bttsYes", "bttsNo"],
];
