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
  return result?.engines?.find((item) => item.id === "TOTALS")?.values?.[key];
}
function bttsProbability(result: AuthoritativeMatchAnalysis) {
  return result?.engines?.find((item) => item.id === "BTTS")?.values?.yes;
}

export function buildMainstreamMarketMap(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  const probs = result?.probabilities ?? { home: 0.33, draw: 0.34, away: 0.33 };
  const home = typeof probs.home === "number" ? probs.home : 0.33;
  const draw = typeof probs.draw === "number" ? probs.draw : 0.34;
  const away = typeof probs.away === "number" ? probs.away : 0.33;
  const homeTeam = result?.home?.team ?? "Home";
  const awayTeam = result?.away?.team ?? "Away";
  const winner = home >= draw && home >= away ? homeTeam : away >= draw ? awayTeam : "DRAW";
  const winnerProbability = Math.max(home, draw, away);
  const confidence = result?.confidence ?? 50;
  const map: MarketSignal[] = [
    {
      market: "1X2",
      selection: winner === "DRAW" ? "DRAW" : `${winner} WIN`,
      probability: winnerProbability,
      confidence,
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
    confidence: Math.round((confidence + pct(dc.probability)) / 2),
    tier: dc.probability >= 0.62 ? "SECONDARY" : "WATCH",
    rationale: `Two-result coverage at ${pct(dc.probability)}% model probability.`,
  });

  const dnbHome = home / Math.max(0.0001, home + away);
  const dnbAway = away / Math.max(0.0001, home + away);
  const dnbProbability = Math.max(dnbHome, dnbAway);
  map.push({
    market: "DRAW NO BET",
    selection: dnbHome >= dnbAway ? `DNB — ${homeTeam}` : `DNB — ${awayTeam}`,
    probability: dnbProbability,
    confidence: Math.round((confidence + pct(dnbProbability)) / 2),
    tier: dnbProbability >= 0.62 ? "SECONDARY" : "WATCH",
    rationale:
      "Draw is removed from the win comparison and the stronger side becomes the DNB lean.",
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

function unavailableMarket(reason: string): MarketSignal {
  return {
    market: "1X2",
    selection: "NO QUALIFIED MARKET",
    probability: 0,
    confidence: 0,
    tier: "WATCH",
    rationale: reason,
  };
}

/**
 * Deliver one actionable market without changing the authoritative 1X2 call.
 * Crucially, this function never falls back to a high-looking low-information
 * market such as UNDER 3.5 when the team sample is insufficient.
 */
export function bestQualifiedMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  const markets = buildMainstreamMarketMap(result);
  const quality = result?.quality ?? 0;
  const risk = result?.risk ?? "VERY HIGH";
  const robustnessScore = result?.robustness?.score ?? 0;
  const homeSample = result?.home?.played ?? 0;
  const awaySample = result?.away?.played ?? 0;

  if (
    result?.decision === "INSUFFICIENT INTELLIGENCE" ||
    homeSample < 4 ||
    awaySample < 4 ||
    quality < 40
  ) {
    return unavailableMarket(
      `No market is promoted because evidence coverage is insufficient: home sample ${homeSample}, away sample ${awaySample}, quality ${quality}.`,
    );
  }

  const candidates = markets.filter((m) => {
    const minProbability =
      m.market === "OVER/UNDER 1.5" ? 0.64 : m.market === "DOUBLE CHANCE" ? 0.62 : 0.57;
    return m.probability >= minProbability && risk !== "VERY HIGH";
  });
  const riskPenalty = risk === "VERY HIGH" ? 0.25 : risk === "HIGH" ? 0.1 : 0;
  const pool = candidates.length ? candidates : markets.filter((m) => m.market !== "1X2");
  const ranked = pool.sort((a, b) => {
    const score = (m: MarketSignal) =>
      m.probability * 0.45 +
      (m.confidence / 100) * 0.25 +
      (robustnessScore / 100) * 0.15 +
      (quality / 100) * 0.15 -
      riskPenalty;
    return score(b) - score(a);
  });
  return ranked[0] ?? unavailableMarket("No mainstream market cleared the current evidence gates.");
}

export function primaryMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  return buildMainstreamMarketMap(result)[0];
}
