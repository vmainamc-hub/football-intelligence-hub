import type { AuthoritativeMatchAnalysis } from "./authoritative";

export type MainstreamMarket = "1X2" | "DOUBLE CHANCE" | "DRAW NO BET" | "OVER/UNDER 2.5" | "BTTS";
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
  const engine = result.engines.find((item) => item.id === "TOTALS");
  return engine?.values[key];
}

function bttsProbability(result: AuthoritativeMatchAnalysis) {
  const engine = result.engines.find((item) => item.id === "BTTS");
  return engine?.values.yes;
}

export function buildMainstreamMarketMap(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  const { home, draw, away } = result.probabilities;
  const ordered = [
    { selection: result.finalPrediction.includes(result.fixtureId) ? result.finalPrediction : home >= away && home >= draw ? "HOME WIN" : away >= home && away >= draw ? "AWAY WIN" : "DRAW", probability: Math.max(home, draw, away) },
    { selection: "1X", probability: home + draw },
    { selection: "X2", probability: draw + away },
    { selection: "12", probability: home + away },
  ];

  const top = ordered[0];
  const confidence = result.confidence;
  const map: MarketSignal[] = [
    {
      market: "1X2",
      selection: top.selection,
      probability: top.probability,
      confidence,
      tier: "PRIMARY",
      rationale: `Highest core 1X2 probability: ${pct(top.probability)}%.`,
    },
  ];

  const doubleChance = ordered.slice(1).sort((a, b) => b.probability - a.probability)[0];
  map.push({
    market: "DOUBLE CHANCE",
    selection: doubleChance.selection,
    probability: doubleChance.probability,
    confidence: Math.round((confidence + pct(doubleChance.probability)) / 2),
    tier: "SECONDARY",
    rationale: `Covers two of the three full-time outcomes; model coverage is ${pct(doubleChance.probability)}%.`,
  });

  const dnbHome = home / Math.max(0.0001, home + away);
  const dnbAway = away / Math.max(0.0001, home + away);
  const dnbSelection = dnbHome >= dnbAway ? `DRAW NO BET — ${result.home}` : `DRAW NO BET — ${result.away}`;
  const dnbProbability = Math.max(dnbHome, dnbAway);
  map.push({
    market: "DRAW NO BET",
    selection: dnbSelection,
    probability: dnbProbability,
    confidence: Math.round((confidence + pct(dnbProbability)) / 2),
    tier: "SECONDARY",
    rationale: "Draw is removed from the win probability comparison; the stronger side becomes the DNB lean.",
  });

  const over25 = goalProbability(result, "over2.5");
  if (typeof over25 === "number") {
    map.push({
      market: "OVER/UNDER 2.5",
      selection: over25 >= 0.5 ? "OVER 2.5" : "UNDER 2.5",
      probability: Math.max(over25, 1 - over25),
      confidence: pct(Math.max(over25, 1 - over25)),
      tier: "SECONDARY",
      rationale: `Goal model leans ${over25 >= 0.5 ? "over" : "under"} at ${pct(Math.max(over25, 1 - over25))}%.`,
    });
  }

  const btts = bttsProbability(result);
  if (typeof btts === "number") {
    map.push({
      market: "BTTS",
      selection: btts >= 0.5 ? "BTTS — YES" : "BTTS — NO",
      probability: Math.max(btts, 1 - btts),
      confidence: pct(Math.max(btts, 1 - btts)),
      tier: "SECONDARY",
      rationale: `Scoring model leans ${btts >= 0.5 ? "both teams to score" : "at least one team to fail to score"}.`,
    });
  }

  return map.map((item) => ({
    ...item,
    tier: item.market === "1X2" ? "PRIMARY" : item.probability >= 0.62 ? "SECONDARY" : "WATCH",
  }));
}

export function primaryMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  return buildMainstreamMarketMap(result)[0];
}
