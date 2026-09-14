import type { Market } from "./types";

export function marketOutcome(market: Market, h: number, a: number): boolean {
  const t = h + a;
  switch (market) {
    case "home":
      return h > a;
    case "draw":
      return h === a;
    case "away":
      return a > h;
    case "dc1x":
      return h >= a;
    case "dcx2":
      return a >= h;
    case "dc12":
      return h !== a;
    case "over05":
      return t > 0.5;
    case "over15":
      return t > 1.5;
    case "over25":
      return t > 2.5;
    case "over35":
      return t > 3.5;
    case "under05":
      return t < 0.5;
    case "under15":
      return t < 1.5;
    case "under25":
      return t < 2.5;
    case "under35":
      return t < 3.5;
    case "bttsYes":
      return h > 0 && a > 0;
    case "bttsNo":
      return h === 0 || a === 0;
    case "homeOver05":
      return h > 0.5;
    case "homeOver15":
      return h > 1.5;
    case "awayOver05":
      return a > 0.5;
    case "awayOver15":
      return a > 1.5;
    default:
      return false;
  }
}

export function brier(p: number, outcome: boolean): number {
  return (p - (outcome ? 1 : 0)) ** 2;
}

export function logLoss(p: number, outcome: boolean): number {
  const q = Math.min(0.999, Math.max(0.001, p));
  return outcome ? -Math.log(q) : -Math.log(1 - q);
}
