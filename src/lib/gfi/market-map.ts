import type { AuthoritativeMatchAnalysis } from "./authoritative";

export type MainstreamMarket =
  | "1X2"
  | "DOUBLE CHANCE"
  | "DRAW NO BET"
  | "OVER/UNDER 1.5"
  | "OVER/UNDER 2.5"
  | "OVER/UNDER 3.5"
  | "BTTS";
export type MarketSignal = {
  market: MainstreamMarket;
  selection: string;
  probability: number;
  confidence: number;
  tier: "PRIMARY" | "SECONDARY" | "WATCH";
  rationale: string;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const pct = (n: number) => Math.round(clamp(n) * 100);

function goalProbability(result: AuthoritativeMatchAnalysis, key: string) {
  return result.engines.find((item) => item.id === "TOTALS")?.values[key];
}
function bttsProbability(result: AuthoritativeMatchAnalysis) {
  return result.engines.find((item) => item.id === "BTTS")?.values.yes;
}

export function buildMainstreamMarketMap(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  const { home, draw, away } = result.probabilities;
  const winner =
    home >= draw && home >= away ? result.home.team : away >= draw ? result.away.team : "DRAW";
  const winnerProbability = Math.max(home, draw, away);
  const map: MarketSignal[] = [
    {
      market: "1X2",
      selection: winner === "DRAW" ? "DRAW" : `${winner} WIN`,
      probability: winnerProbability,
      confidence: result.confidence,
      tier: "PRIMARY",
      rationale: `Highest core 1X2 probability: ${pct(winnerProbability)}%.`,
    },
  ];

  const dc = [
    { selection: "1X", probability: home + draw },
    { selection: "X2", probability: draw + away },
    { selection: "12", probability: home + away },
  ].sort((a, b) => b.probability - a.probability)[0];
  map.push({
    market: "DOUBLE CHANCE",
    selection: dc.selection,
    probability: dc.probability,
    confidence: Math.round((result.confidence + pct(dc.probability)) / 2),
    tier: dc.probability >= 0.62 ? "SECONDARY" : "WATCH",
    rationale: `Two-result coverage at ${pct(dc.probability)}% model probability.`,
  });

  const dnbHome = home / Math.max(0.0001, home + away);
  const dnbAway = away / Math.max(0.0001, home + away);
  const dnbProbability = Math.max(dnbHome, dnbAway);
  map.push({
    market: "DRAW NO BET",
    selection: dnbHome >= dnbAway ? `DNB — ${result.home.team}` : `DNB — ${result.away.team}`,
    probability: dnbProbability,
    confidence: Math.round((result.confidence + pct(dnbProbability)) / 2),
    tier: dnbProbability >= 0.62 ? "SECONDARY" : "WATCH",
    rationale: "Draw is removed from the win comparison and the stronger side becomes the DNB lean.",
  });

  for (const line of [1.5, 2.5, 3.5] as const) {
    const over = goalProbability(result, `over${line}`);
    if (typeof over !== "number") continue;
    const p = Math.max(over, 1 - over);
    map.push({
      market: `OVER/UNDER ${line}`,
      selection: over >= 0.5 ? `OVER ${line}` : `UNDER ${line}`,
      probability: p,
      confidence: pct(p),
      tier: p >= 0.62 ? "SECONDARY" : "WATCH",
      rationale: `Goal model leans ${over >= 0.5 ? "over" : "under"} at ${pct(p)}%.`,
    });
  }

  const btts = bttsProbability(result);
  if (typeof btts === "number") {
    const p = Math.max(btts, 1 - btts);
    map.push({
      market: "BTTS",
      selection: btts >= 0.5 ? "BTTS — YES" : "BTTS — NO",
      probability: p,
      confidence: pct(p),
      tier: p >= 0.62 ? "SECONDARY" : "WATCH",
      rationale: `Scoring model leans ${btts >= 0.5 ? "both teams to score" : "at least one team to fail to score"}.`,
    });
  }
  return map;
}

/**
 * Deliver one actionable market without changing the authoritative 1X2 call.
 * The selector rewards probability, confidence and robustness and refuses to
 * promote a fragile market solely because it is numerically high.
 */
export function bestQualifiedMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  const markets = buildMainstreamMarketMap(result);
  const candidates = markets.filter((m) => {
    const minProbability = m.market === "OVER/UNDER 1.5" ? 0.64 : m.market === "DOUBLE CHANCE" ? 0.62 : 0.57;
    return m.probability >= minProbability && result.quality >= 42 && result.risk !== "VERY HIGH";
  });
  const ranked = (candidates.length ? candidates : markets.filter((m) => m.market !== "1X2")).sort(
    (a, b) => {
      const score = (m: MarketSignal) =>
        m.probability * 0.55 + (m.confidence / 100) * 0.25 + (result.robustness.score / 100) * 0.2;
      return score(b) - score(a);
    },
  );
  return ranked[0] ?? markets[0];
}

export function primaryMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  return buildMainstreamMarketMap(result)[0];
}
