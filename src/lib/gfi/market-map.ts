import type { AuthoritativeMatchAnalysis } from "./authoritative";
import { isCoreActionableMarket } from "./markets";

export type CoreMarket = "1X2" | "OVER/UNDER 2.5" | "BTTS";
export type MainstreamMarket = CoreMarket | "DOUBLE CHANCE" | "DRAW NO BET" | "OVER/UNDER 1.5" | "OVER/UNDER 3.5";

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
const goal = (r: AuthoritativeMatchAnalysis, k: string) => r.engines.find((e) => e.id === "TOTALS")?.values?.[k];
const btts = (r: AuthoritativeMatchAnalysis) => r.engines.find((e) => e.id === "BTTS")?.values?.yes;
const tier = (p: number, c: number): MarketSignal["tier"] =>
  c < 50 ? "WATCH" : p >= 0.62 ? "PRIMARY" : p >= 0.56 ? "SECONDARY" : "WATCH";

function signal(
  market: MainstreamMarket,
  selection: string,
  probability: number,
  result: AuthoritativeMatchAnalysis,
  rationale: string,
): MarketSignal {
  const p = clamp(probability);
  const c = clamp(result.confidence / 100) * 100;
  return {
    market,
    selection,
    probability: p,
    confidence: Math.round(c),
    tier: tier(p, c),
    rationale: `${rationale} Epistemic confidence ${Math.round(c)}%; this is evidence confidence, not event probability.`,
  };
}

/**
 * Direct evaluation of the five authoritative core markets:
 * 1. Home Win
 * 2. Draw
 * 3. Away Win
 * 4. GG / BTTS Yes
 * 5. Over 2.5 Goals
 */
export function buildFiveCoreMarketComparison(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  const p = result.probabilities;
  const h = result.home.team;
  const a = result.away.team;
  const o25 = Number(goal(result, "over2.5"));
  const b = Number(btts(result));

  return [
    signal("1X2", `${h} WIN`, p.home, result, `Home-win probability ${pct(p.home)}%.`),
    signal("1X2", "DRAW", p.draw, result, `Draw probability ${pct(p.draw)}%.`),
    signal("1X2", `${a} WIN`, p.away, result, `Away-win probability ${pct(p.away)}%.`),
    signal("BTTS", "BTTS — YES", b, result, `BTTS Yes probability ${pct(b)}%.`),
    signal("OVER/UNDER 2.5", "OVER 2.5", o25, result, `Over 2.5 probability ${pct(o25)}%.`),
  ].filter((x) => Number.isFinite(x.probability));
}

/**
 * Maintained for backwards compatibility; returns the authoritative 5 core markets.
 */
export const buildSevenMarketComparison = buildFiveCoreMarketComparison;

/**
 * Authoritative market map restricted strictly to the 5 core actionable markets.
 */
export function buildMainstreamMarketMap(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  if (!result?.probabilities) {
    return [
      {
        market: "1X2",
        selection: "NO MARKET DATA",
        probability: 0,
        confidence: 0,
        tier: "WATCH",
        rationale: "No complete authoritative probability surface is available.",
      },
    ];
  }
  return buildFiveCoreMarketComparison(result);
}

function aiSelectedMarket(result: AuthoritativeMatchAnalysis): MarketSignal | undefined {
  const call = result.aiReasoningPacket?.aiAnalystCall as
    | { status?: string; selection?: string; rationale?: string; conviction?: string; market?: string }
    | undefined;
  if (!call || call.status !== "ACTIVE" || !call.selection) return undefined;

  // Strict core market validation: AI cannot select non-core markets
  if (!isCoreActionableMarket(call.market || "1X2", call.selection, result.home?.team, result.away?.team)) {
    return undefined;
  }

  const markets = buildMainstreamMarketMap(result);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetNorm = norm(call.selection);
  const mapped =
    markets.find((m) => norm(m.selection) === targetNorm) ||
    markets.find((m) => norm(m.selection).includes(targetNorm) || targetNorm.includes(norm(m.selection))) ||
    markets.find((m) => Boolean(call.market) && m.market.toLowerCase() === call.market!.toLowerCase());

  if (!mapped) return undefined;

  return {
    ...mapped,
    selection: call.selection,
    tier: mapped.probability >= 0.62 ? "PRIMARY" : mapped.probability >= 0.54 ? "SECONDARY" : "WATCH",
    rationale: `${call.rationale ?? "AI Football Analyst Council selection."} Final selection comes from the authoritative five-market surface; underlying model probability is unchanged. AI conviction: ${call.conviction ?? "MODERATE"}.`,
  };
}

export function bestQualifiedMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  const aiMarket = aiSelectedMarket(result);
  if (aiMarket) return aiMarket;

  const markets = buildMainstreamMarketMap(result);
  if (!markets.length || markets[0].selection === "NO MARKET DATA") {
    return (
      markets[0] ?? {
        market: "1X2",
        selection: "NO MARKET DATA",
        probability: 0,
        confidence: 0,
        tier: "WATCH",
        rationale: "No market observations were produced.",
      }
    );
  }

  const selected = result.qualification?.actionableMarket;
  if (
    selected &&
    Number.isFinite(selected.modelProbability) &&
    isCoreActionableMarket(selected.market, selected.selection, result.home?.team, result.away?.team)
  ) {
    const market = (selected.market as MainstreamMarket) || "1X2";
    const mapped =
      markets.find((m) => m.selection.toLowerCase() === selected.selection.toLowerCase()) ??
      markets.find((m) => m.market === selected.market);
    const prob = selected.modelProbability;
    const conf = result.confidence ?? 50;
    const t: MarketSignal["tier"] =
      conf < 45 ? "WATCH" : prob >= 0.62 ? "PRIMARY" : prob >= 0.54 ? "SECONDARY" : "WATCH";
    return {
      market: mapped?.market ?? market,
      selection: selected.selection,
      probability: clamp(prob),
      confidence: Math.round(conf),
      tier: t,
      rationale: `${selected.whyConsidered ?? ""} ${selected.supportingEvidence?.join(" ") ?? ""} Authoritative cross-engine selection.`.trim(),
    };
  }

  const ranked = markets.slice().sort((a, b) => b.probability - a.probability);
  const best = ranked[0];
  return {
    ...best,
    tier: best.probability >= 0.62 ? "PRIMARY" : best.probability >= 0.56 ? "SECONDARY" : "WATCH",
    rationale: `${best.rationale} Displayed as the strongest mathematical signal from the five core markets.`,
  };
}

export function primaryMarket(result: AuthoritativeMatchAnalysis) {
  return (
    buildMainstreamMarketMap(result)[0] ?? {
      market: "1X2",
      selection: "NO MARKET DATA",
      probability: 0,
      confidence: 0,
      tier: "WATCH" as const,
      rationale: "No market data.",
    }
  );
}
