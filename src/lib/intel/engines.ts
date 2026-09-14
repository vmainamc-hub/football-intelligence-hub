import type { Features } from "./features";
import { marketsFromMatrix, scoreMatrix } from "./math";
import { predictSoftmax, type TrainedModel } from "./ml";
import type { EngineOutput } from "./types";

const MIN_L = 0.18;
const MAX_L = 4.5;
const bound = (x: number) => Math.max(MIN_L, Math.min(MAX_L, x));

function shrink(value: number, prior: number, n: number, strength: number) {
  return (value * n + prior * strength) / (n + strength);
}

function surface(lh: number, la: number, opts: { rho?: number; dispersion?: number } = {}) {
  return marketsFromMatrix(scoreMatrix(bound(lh), bound(la), opts));
}

function unavailable(
  id: string,
  name: string,
  family: string,
  status: EngineOutput["status"],
  detail: string,
): EngineOutput {
  return {
    id,
    name,
    family,
    status,
    statusDetail: detail,
    weight: 0,
    confidence: 0,
    markets: {},
    notes: [detail],
  };
}

export function runEngineArena(f: Features, model: TrainedModel | null): EngineOutput[] {
  const { league, home, away } = f;
  const lg = { h: Math.max(0.6, league.homeGoals), a: Math.max(0.5, league.awayGoals) };
  const engines: EngineOutput[] = [];

  const sample = Math.min(home.overall.played, away.overall.played);
  const baseConfidence = Math.max(0.15, Math.min(0.95, sample / 20));

  // 1. Poisson baseline (overall strengths)
  {
    const atkH = shrink(home.overall.scored / lg.h, 1, home.overall.played, 6);
    const defA = shrink(away.overall.conceded / lg.h, 1, away.overall.played, 6);
    const atkA = shrink(away.overall.scored / lg.a, 1, away.overall.played, 6);
    const defH = shrink(home.overall.conceded / lg.a, 1, home.overall.played, 6);
    const lh = lg.h * atkH * defA;
    const la = lg.a * atkA * defH;
    engines.push({
      id: "poisson-baseline",
      name: "Poisson goal model",
      family: "Statistical",
      status: sample >= 4 ? "OK" : "INSUFFICIENT_DATA",
      weight: 1,
      confidence: baseConfidence,
      lambdas: { home: bound(lh), away: bound(la) },
      markets: sample >= 4 ? surface(lh, la) : {},
      notes: [
        `Attack/defence strengths from ${home.overall.played} and ${away.overall.played} stored results`,
        `League baseline ${lg.h.toFixed(2)} / ${lg.a.toFixed(2)} goals per side`,
      ],
    });
  }

  // 2. Dixon-Coles (venue split + low-score dependency)
  {
    const atkH = shrink(home.home.scored / lg.h, 1, home.home.played, 5);
    const defA = shrink(away.away.conceded / lg.h, 1, away.away.played, 5);
    const atkA = shrink(away.away.scored / lg.a, 1, away.away.played, 5);
    const defH = shrink(home.home.conceded / lg.a, 1, home.home.played, 5);
    const lh = lg.h * atkH * defA;
    const la = lg.a * atkA * defH;
    const ok = home.home.played >= 3 && away.away.played >= 3;
    engines.push({
      id: "dixon-coles",
      name: "Dixon-Coles",
      family: "Statistical",
      status: ok ? "OK" : "INSUFFICIENT_DATA",
      weight: 1.25,
      confidence: Math.min(0.95, (home.home.played + away.away.played) / 24),
      lambdas: { home: bound(lh), away: bound(la) },
      markets: ok ? surface(lh, la, { rho: -0.06 }) : {},
      notes: ["Venue-specific strengths with low-score dependency correction (rho = -0.06)"],
    });
  }

  // 3. Strict home/away split
  {
    const ok = home.home.played >= 4 && away.away.played >= 4;
    const lh = (home.home.scored + away.away.conceded) / 2;
    const la = (away.away.scored + home.home.conceded) / 2;
    engines.push({
      id: "venue-split",
      name: "Home/away split model",
      family: "Team strength",
      status: ok ? "OK" : "INSUFFICIENT_DATA",
      weight: 0.85,
      confidence: Math.min(0.9, (home.home.played + away.away.played) / 26),
      lambdas: { home: bound(lh), away: bound(la) },
      markets: ok ? surface(lh, la, { rho: -0.04 }) : {},
      notes: [
        `${home.name} at home: ${home.home.played} matches; ${away.name} away: ${away.away.played} matches`,
      ],
    });
  }

  // 4. Bayesian shrunk strength
  {
    const nH = home.overall.played;
    const nA = away.overall.played;
    const lh = shrink((home.overall.scored + away.overall.conceded) / 2, lg.h, (nH + nA) / 2, 10);
    const la = shrink((away.overall.scored + home.overall.conceded) / 2, lg.a, (nH + nA) / 2, 10);
    engines.push({
      id: "bayesian-strength",
      name: "Bayesian team strength",
      family: "Bayesian",
      status: sample >= 3 ? "OK" : "INSUFFICIENT_DATA",
      weight: 1.1,
      confidence: Math.min(0.92, 0.3 + sample / 30),
      lambdas: { home: bound(lh), away: bound(la) },
      markets: sample >= 3 ? surface(lh, la, { rho: -0.05 }) : {},
      notes: ["Goal rates shrunk toward the league prior; small samples pull harder to the mean"],
    });
  }

  // 5. Elo / dynamic strength
  {
    const diff = home.elo + 65 - away.elo;
    const supremacy = diff / 180; // goals of expected margin
    const total = Math.max(1.8, league.totalGoals);
    const lh = total / 2 + supremacy / 2;
    const la = total / 2 - supremacy / 2;
    engines.push({
      id: "elo-dynamic",
      name: "Dynamic Elo",
      family: "Team strength",
      status: f.historyCount >= 30 ? "OK" : "INSUFFICIENT_DATA",
      weight: 1.05,
      confidence: Math.min(0.9, f.historyCount / 400),
      lambdas: { home: bound(lh), away: bound(la) },
      markets: f.historyCount >= 30 ? surface(lh, la, { rho: -0.05 }) : {},
      notes: [
        `Elo ${Math.round(home.elo)} vs ${Math.round(away.elo)} (+65 home advantage)`,
        `Implied supremacy ${supremacy >= 0 ? "+" : ""}${supremacy.toFixed(2)} goals`,
      ],
    });
  }

  // 6. Form / momentum
  {
    const ok = home.form.results.length >= 4 && away.form.results.length >= 4;
    const lh = (home.form.weightedScored + away.form.weightedConceded) / 2;
    const la = (away.form.weightedScored + home.form.weightedConceded) / 2;
    engines.push({
      id: "form-momentum",
      name: "Form & momentum",
      family: "Contextual",
      status: ok ? "OK" : "INSUFFICIENT_DATA",
      weight: 0.7,
      confidence: 0.55,
      lambdas: { home: bound(lh), away: bound(la) },
      markets: ok ? surface(lh, la) : {},
      notes: [
        `${home.name} last ${home.form.results.length}: ${home.form.results.join("") || "—"}`,
        `${away.name} last ${away.form.results.length}: ${away.form.results.join("") || "—"}`,
      ],
    });
  }

  // 7. Negative binomial (overdispersed goals)
  {
    const atkH = shrink(home.overall.scored / lg.h, 1, home.overall.played, 6);
    const defA = shrink(away.overall.conceded / lg.h, 1, away.overall.played, 6);
    const atkA = shrink(away.overall.scored / lg.a, 1, away.overall.played, 6);
    const defH = shrink(home.overall.conceded / lg.a, 1, home.overall.played, 6);
    const lh = lg.h * atkH * defA;
    const la = lg.a * atkA * defH;
    engines.push({
      id: "negative-binomial",
      name: "Negative binomial",
      family: "Statistical",
      status: sample >= 4 ? "OK" : "INSUFFICIENT_DATA",
      weight: 0.8,
      confidence: baseConfidence * 0.9,
      lambdas: { home: bound(lh), away: bound(la) },
      markets: sample >= 4 ? surface(lh, la, { dispersion: 7 }) : {},
      notes: ["Allows more variance than Poisson — fatter tails on high-scoring games"],
    });
  }

  // 8. Head-to-head prior
  {
    const n = f.h2h.matches.length;
    if (n >= 3) {
      const hg =
        f.h2h.matches.reduce(
          (a, m) => a + (m.homeId === f.target.homeId ? m.ftHome : m.ftAway),
          0,
        ) / n;
      const ag =
        f.h2h.matches.reduce(
          (a, m) => a + (m.homeId === f.target.homeId ? m.ftAway : m.ftHome),
          0,
        ) / n;
      const lh = shrink(hg, lg.h, n, 4);
      const la = shrink(ag, lg.a, n, 4);
      engines.push({
        id: "h2h-prior",
        name: "Head-to-head prior",
        family: "Historical",
        status: "OK",
        weight: 0.5,
        confidence: Math.min(0.6, n / 10),
        lambdas: { home: bound(lh), away: bound(la) },
        markets: surface(lh, la),
        notes: [
          `${n} stored meetings — ${f.h2h.homeWins}W / ${f.h2h.draws}D / ${f.h2h.awayWins}L for ${home.name}`,
        ],
      });
    } else {
      engines.push(
        unavailable(
          "h2h-prior",
          "Head-to-head prior",
          "Historical",
          "INSUFFICIENT_DATA",
          `Only ${n} stored meeting(s) — below the 3-match threshold`,
        ),
      );
    }
  }

  // 9. In-app machine learning (multinomial logistic regression)
  {
    const p = model ? predictSoftmax(model, home.id, away.id) : null;
    if (p) {
      engines.push({
        id: "ml-logistic",
        name: "Logistic regression (trained in-app)",
        family: "Machine learning",
        status: "OK",
        weight: 1.1,
        confidence: Math.min(0.9, model!.samples / 900),
        markets: {
          home: p.home,
          draw: p.draw,
          away: p.away,
          dc1x: p.home + p.draw,
          dcx2: p.away + p.draw,
          dc12: p.home + p.away,
        },
        notes: [
          `Trained chronologically on ${model!.samples} stored results (no future data used)`,
          `Training log loss ${model!.logLoss.toFixed(3)}`,
          "Covers match result and double chance only — it does not model goal totals",
        ],
      });
    } else {
      engines.push(
        unavailable(
          "ml-logistic",
          "Logistic regression (trained in-app)",
          "Machine learning",
          "INSUFFICIENT_DATA",
          "Not enough stored history to train without leakage (needs 60+ qualifying results)",
        ),
      );
    }
  }

  // 10-13. Architecture present, inputs not available in free mode.
  engines.push(
    unavailable(
      "xg-ensemble",
      "xG ensemble",
      "Expected goals",
      "DATA_SOURCE_UNAVAILABLE",
      "No xG feed is connected. xG is never estimated or invented.",
    ),
    unavailable(
      "tactical-matchup",
      "Tactical matchup",
      "Tactical",
      "DATA_SOURCE_UNAVAILABLE",
      "Requires event-level data (pressing, block height, transitions) from a connected provider.",
    ),
    unavailable(
      "player-impact",
      "Player & lineup impact",
      "Player",
      "DATA_SOURCE_UNAVAILABLE",
      "Requires lineup, injury and suspension feeds from a connected provider.",
    ),
    unavailable(
      "market-intelligence",
      "Market intelligence",
      "Market",
      "NOT_CONFIGURED",
      "No odds provider connected. Market prices are evidence, never truth — absent here.",
    ),
  );

  return engines;
}
