import type { HistMatch } from "./features";

/**
 * In-app multinomial logistic regression for 1X2.
 *
 * Trained chronologically on stored historical results only. Features for each
 * training row are built from the rolling state *before* that match is played,
 * so no future information ever leaks into a historical prediction.
 * Requires no external model service and no API keys.
 */

type State = { elo: number; gf: number[]; ga: number[]; pts: number[] };

const FEATURES = 6;

function blank(): State {
  return { elo: 1500, gf: [], ga: [], pts: [] };
}

function avg(xs: number[], n: number, fallback: number): number {
  const s = xs.slice(-n);
  if (!s.length) return fallback;
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function featurise(h: State, a: State): number[] {
  return [
    1,
    (h.elo - a.elo) / 400,
    avg(h.gf, 10, 1.4) - avg(a.ga, 10, 1.4),
    avg(a.gf, 10, 1.1) - avg(h.ga, 10, 1.1),
    (avg(h.pts, 6, 1.3) - avg(a.pts, 6, 1.3)) / 3,
    Math.min(h.gf.length, 20) / 20 - Math.min(a.gf.length, 20) / 20,
  ];
}

function push(s: State, gf: number, ga: number) {
  s.gf.push(gf);
  s.ga.push(ga);
  s.pts.push(gf > ga ? 3 : gf === ga ? 1 : 0);
}

export type TrainedModel = {
  weights: number[][]; // 3 x FEATURES
  samples: number;
  logLoss: number;
  state: Map<string, State>;
};

function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function trainSoftmax(history: HistMatch[]): TrainedModel {
  const sorted = [...history].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const state = new Map<string, State>();
  const get = (id: string) => {
    let s = state.get(id);
    if (!s) {
      s = blank();
      state.set(id, s);
    }
    return s;
  };

  const X: number[][] = [];
  const Y: number[] = [];

  for (const m of sorted) {
    const h = get(m.homeId);
    const a = get(m.awayId);
    if (h.gf.length >= 4 && a.gf.length >= 4) {
      X.push(featurise(h, a));
      Y.push(m.ftHome > m.ftAway ? 0 : m.ftHome === m.ftAway ? 1 : 2);
    }
    // update state AFTER the row is recorded
    const exp = 1 / (1 + Math.pow(10, (a.elo - (h.elo + 65)) / 400));
    const score = m.ftHome > m.ftAway ? 1 : m.ftHome === m.ftAway ? 0.5 : 0;
    const k = 20 * (1 + Math.log1p(Math.abs(m.ftHome - m.ftAway)) * 0.6);
    h.elo += k * (score - exp);
    a.elo += k * (exp - score);
    push(h, m.ftHome, m.ftAway);
    push(a, m.ftAway, m.ftHome);
  }

  const weights: number[][] = [
    new Array(FEATURES).fill(0),
    new Array(FEATURES).fill(0),
    new Array(FEATURES).fill(0),
  ];

  if (X.length >= 60) {
    const lr = 0.25;
    const l2 = 1e-4;
    for (let epoch = 0; epoch < 260; epoch++) {
      const grad = weights.map(() => new Array(FEATURES).fill(0));
      for (let i = 0; i < X.length; i++) {
        const x = X[i]!;
        const p = softmax(weights.map((w) => w.reduce((s, wj, j) => s + wj * x[j]!, 0)));
        for (let c = 0; c < 3; c++) {
          const err = p[c]! - (Y[i] === c ? 1 : 0);
          for (let j = 0; j < FEATURES; j++) grad[c]![j] = grad[c]![j]! + err * x[j]!;
        }
      }
      for (let c = 0; c < 3; c++)
        for (let j = 0; j < FEATURES; j++)
          weights[c]![j] = weights[c]![j]! - lr * (grad[c]![j]! / X.length + l2 * weights[c]![j]!);
    }
  }

  let ll = 0;
  for (let i = 0; i < X.length; i++) {
    const x = X[i]!;
    const p = softmax(weights.map((w) => w.reduce((s, wj, j) => s + wj * x[j]!, 0)));
    ll -= Math.log(Math.max(1e-9, p[Y[i]!]!));
  }

  return { weights, samples: X.length, logLoss: X.length ? ll / X.length : 0, state };
}

export function predictSoftmax(
  model: TrainedModel,
  homeId: string,
  awayId: string,
): { home: number; draw: number; away: number } | null {
  const h = model.state.get(homeId);
  const a = model.state.get(awayId);
  if (!h || !a || model.samples < 60 || h.gf.length < 4 || a.gf.length < 4) return null;
  const x = featurise(h, a);
  const p = softmax(model.weights.map((w) => w.reduce((s, wj, j) => s + wj * x[j]!, 0)));
  return { home: p[0]!, draw: p[1]!, away: p[2]! };
}
