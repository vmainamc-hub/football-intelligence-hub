import type { AuthoritativeMatchAnalysis, MarketCandidate } from "./authoritative";

/**
 * CORE ACTIONABLE MARKETS
 * The entire prediction and AI analyst pipeline is restricted to exactly five markets:
 * 1. HOME WIN
 * 2. DRAW
 * 3. AWAY WIN
 * 4. GG / BTTS YES
 * 5. OVER 2.5 GOALS
 */
export const CORE_ACTIONABLE_MARKET_KEYS = [
  "HOME_WIN",
  "DRAW",
  "AWAY_WIN",
  "BTTS_YES",
  "OVER_2_5",
] as const;

export type CoreActionableMarketKey = (typeof CORE_ACTIONABLE_MARKET_KEYS)[number];

export const CORE_MARKET_NAMES = [
  "HOME WIN",
  "DRAW",
  "AWAY WIN",
  "GG / BTTS YES",
  "OVER 2.5 GOALS",
] as const;

export interface CoreMarketSpec {
  key: CoreActionableMarketKey;
  market: "1X2" | "BTTS" | "OVER/UNDER 2.5";
  selection: string;
  label: string;
  category: string;
}

/**
 * Canonical 5-market definitions for a specific match fixture.
 */
export function getCoreMarketSpecs(homeTeam: string, awayTeam: string): Record<CoreActionableMarketKey, CoreMarketSpec> {
  return {
    HOME_WIN: {
      key: "HOME_WIN",
      market: "1X2",
      selection: `${homeTeam} Win`,
      label: `${homeTeam} Win`,
      category: "1X2",
    },
    DRAW: {
      key: "DRAW",
      market: "1X2",
      selection: "Draw",
      label: "Draw",
      category: "1X2",
    },
    AWAY_WIN: {
      key: "AWAY_WIN",
      market: "1X2",
      selection: `${awayTeam} Win`,
      label: `${awayTeam} Win`,
      category: "1X2",
    },
    BTTS_YES: {
      key: "BTTS_YES",
      market: "BTTS",
      selection: "BTTS — YES",
      label: "BTTS — YES",
      category: "BTTS",
    },
    OVER_2_5: {
      key: "OVER_2_5",
      market: "OVER/UNDER 2.5",
      selection: "Over 2.5 Goals",
      label: "Over 2.5 Goals",
      category: "OVER/UNDER 2.5",
    },
  };
}

/**
 * Check if a market + selection combination belongs to the 5 core markets.
 * Rejects all forbidden markets: Over 1.5, Under 1.5, Under 2.5, Over 3.5, Under 3.5,
 * BTTS No, Double Chance (1X, X2, 12), Draw No Bet (DNB), etc.
 */
export function isCoreActionableMarket(
  market: string,
  selection = "",
  homeTeam?: string,
  awayTeam?: string,
): boolean {
  const normMarket = market.toUpperCase().trim();
  const normSel = (selection || market).toLowerCase().trim();
  const fullText = `${normMarket} ${normSel}`.toLowerCase();

  // Reject explicitly forbidden total lines and sides
  if (fullText.includes("1.5") || fullText.includes("3.5") || fullText.includes("4.5")) {
    return false;
  }
  if (fullText.includes("under")) {
    return false;
  }
  if (fullText.includes("double chance") || normMarket === "DC" || fullText.includes("draw no bet") || fullText.includes("dnb")) {
    return false;
  }
  if (normSel.includes("or draw") || normSel.includes("1x") || normSel.includes("x2") || normSel.includes("12")) {
    return false;
  }

  // 1. OVER 2.5
  if (fullText.includes("over 2.5") || (normMarket.includes("2.5") && normSel.includes("over"))) {
    return true;
  }

  // 2. BTTS YES / GG
  if (fullText.includes("btts") || fullText.includes("both teams to score") || fullText.includes("gg")) {
    if (normSel.includes("no") || normSel.includes("clean sheet") || fullText.includes("btts no")) {
      return false;
    }
    return normSel.includes("yes") || normSel === "btts" || normSel === "gg" || fullText.includes("btts — yes") || fullText.includes("btts - yes") || fullText.includes("both teams to score");
  }

  // 3. 1X2: HOME WIN, DRAW, AWAY WIN
  if (normSel === "draw" || fullText === "1x2 draw" || normMarket === "DRAW") return true;
  if (homeTeam && normSel.includes(homeTeam.toLowerCase())) {
    return true;
  }
  if (awayTeam && normSel.includes(awayTeam.toLowerCase())) {
    return true;
  }
  if (normSel.includes("home win") || normSel.includes("away win")) return true;
  if (normMarket === "HOME" && normSel.includes("win")) return true;
  if (normMarket === "AWAY" && normSel.includes("win")) return true;
  if (normMarket === "1X2" && (normSel.endsWith("win") || normSel.endsWith(" win"))) return true;

  return false;
}

/**
 * Filter an array of market candidates to only the 5 core actionable markets.
 */
export function filterToCoreActionableCandidates(
  candidates: MarketCandidate[],
  homeTeam: string,
  awayTeam: string,
): MarketCandidate[] {
  return candidates.filter((c) => isCoreActionableMarket(c.market, c.selection, homeTeam, awayTeam));
}

/**
 * Validate that a council selection matches one of the five core markets.
 */
export function validateCoreCouncilSelection(
  selection: string,
  homeTeam: string,
  awayTeam: string,
): { valid: boolean; normalizedKey?: CoreActionableMarketKey } {
  const norm = selection.trim().toLowerCase();
  const hNorm = homeTeam.trim().toLowerCase();
  const aNorm = awayTeam.trim().toLowerCase();

  if (norm.includes("1.5") || norm.includes("3.5") || norm.includes("under") || norm.includes("dnb") || norm.includes("double chance") || norm.includes("1x") || norm.includes("x2") || norm.includes("btts — no") || norm.includes("btts no")) {
    return { valid: false };
  }

  if (norm === "draw") {
    return { valid: true, normalizedKey: "DRAW" };
  }
  if (norm.includes(hNorm) && (norm.includes("win") || norm.endsWith("win"))) {
    return { valid: true, normalizedKey: "HOME_WIN" };
  }
  if (norm.includes(aNorm) && (norm.includes("win") || norm.endsWith("win"))) {
    return { valid: true, normalizedKey: "AWAY_WIN" };
  }
  if (norm.includes("btts") && (norm.includes("yes") || norm === "btts" || norm.includes("gg"))) {
    return { valid: true, normalizedKey: "BTTS_YES" };
  }
  if (norm.includes("over 2.5") || norm === "over 2.5 goals" || norm === "over 2.5") {
    return { valid: true, normalizedKey: "OVER_2_5" };
  }

  return { valid: false };
}
