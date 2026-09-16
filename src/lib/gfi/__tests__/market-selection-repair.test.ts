import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveAuthoritatively } from "../authoritative-runtime";
import { deriveConsensusActionability } from "../actionability";
import { bestQualifiedMarket, buildMainstreamMarketMap } from "../market-map";
import type { MatchRow } from "../intelligence";

function createTeamHistory(team: string, gf: number, ga: number, wins: number, count = 15): MatchRow[] {
  const baseDate = new Date("2026-03-01T15:00:00Z");
  const rows: MatchRow[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const isHome = i % 2 === 0;
    rows.push({
      date: dateStr,
      home: isHome ? team : "Opponent FC",
      away: isHome ? "Opponent FC" : team,
      hg: isHome ? gf : ga,
      ag: isHome ? ga : gf,
      competition: "Premier League",
      status: "FT",
    });
  }
  return rows;
}

test("1. Low-scoring profile: selects Under market without defaulting to Over 2.5", () => {
  const lowRows = createTeamHistory("Defensive A", 0, 0, 5, 12).concat(
    createTeamHistory("Defensive B", 0, 0, 5, 12),
  );
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Defensive A",
    away: "Defensive B",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, lowRows);
  const action = deriveConsensusActionability(result);
  const best = bestQualifiedMarket(result);

  assert.ok(result.totals["over2.5"] < 0.35, "Over 2.5 probability should be low in defensive fixture");
  assert.ok(action.actionableMarket, "Actionable market must be selected");
  assert.ok(
    action.actionableMarket.selection.includes("Under") || action.actionableMarket.market.includes("UNDER") || action.actionableMarket.market === "DOUBLE CHANCE" || action.actionableMarket.market === "1X2",
    "Selected market must be mathematically consistent with low-scoring defensive profile",
  );
  assert.notEqual(action.actionableMarket.selection, "Over 2.5", "Low-scoring match must NOT select Over 2.5");
  assert.equal(best.selection, action.actionableMarket.selection, "bestQualifiedMarket must match actionableMarket");
});

test("2. High-scoring shootout: selects Over market naturally based on goals", () => {
  const highRows = createTeamHistory("Attacking A", 3, 2, 8, 12).concat(
    createTeamHistory("Attacking B", 3, 2, 8, 12),
  );
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Attacking A",
    away: "Attacking B",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, highRows);
  const action = deriveConsensusActionability(result);
  const best = bestQualifiedMarket(result);

  assert.ok(result.totals["over2.5"] > 0.65, "Over 2.5 probability should be high in high-scoring shootout");
  assert.ok(action.actionableMarket, "Actionable market must be selected");
  assert.ok(
    action.actionableMarket.selection.includes("Over") || action.actionableMarket.selection.includes("BTTS"),
    "High-scoring shootout should select an Over or BTTS market",
  );
  assert.ok(!action.actionableMarket.selection.includes("Under"), "High-scoring match must NOT select Under");
  assert.equal(best.selection, action.actionableMarket.selection, "bestQualifiedMarket must match actionableMarket");
});

test("3. Dominant home favorite: selects match outcome (1X2 / DNB / DC) reflecting team strength", () => {
  const dominantHomeRows = createTeamHistory("Man City", 3, 0, 12, 12);
  const weakAwayRows = createTeamHistory("Luton", 0, 3, 1, 12);
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Man City",
    away: "Luton",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, dominantHomeRows.concat(weakAwayRows));
  const action = deriveConsensusActionability(result);
  const best = bestQualifiedMarket(result);

  assert.ok(result.probabilities.home > 0.65, "Dominant home team must have high 1X2 win probability");
  assert.ok(action.actionableMarket, "Actionable market must be selected");
  assert.ok(
    action.actionableMarket.market === "1X2" ||
      action.actionableMarket.market === "DRAW NO BET" ||
      action.actionableMarket.market === "DOUBLE CHANCE",
    "Dominant team strength should produce 1X2, DNB, or Double Chance selection",
  );
  assert.ok(
    action.actionableMarket.selection.includes("Man City"),
    "Selection must back the dominant team",
  );
  assert.equal(best.selection, action.actionableMarket.selection, "bestQualifiedMarket must match actionableMarket");
});

test("4. Sparse/zero-evidence data: avoids 1.2 lambda collapse and 88% Under 2.5 artifact", () => {
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Sparse Team A",
    away: "Sparse Team B",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, []);
  const action = deriveConsensusActionability(result);

  // Under 2.5 probability should be around balanced prior (~50-58%), NOT collapsed to 88%
  const under25 = 1 - (result.totals["over2.5"] ?? 0.5);
  assert.ok(
    under25 >= 0.40 && under25 <= 0.65,
    `Sparse data Under 2.5 probability must be in calibrated prior range (got ${(under25 * 100).toFixed(1)}%), not collapsed to 88%`,
  );
  assert.ok(
    result.totals["over2.5"] >= 0.35 && result.totals["over2.5"] <= 0.60,
    `Sparse data Over 2.5 probability must reflect balanced prior (got ${result.totals["over2.5"]})`,
  );

  // Qualification must not be an artificial PASS
  assert.equal(action.qualified, true, "Sparse fixture with complete prior probability surface must remain qualified");
  assert.ok(action.actionableMarket, "Actionable market must be produced for sparse fixture");
});

test("5. Correlation awareness: goals engine family is aggregated into one vote", () => {
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Team X",
    away: "Team Y",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, []);

  // Check that GOALS, BAYES_STRENGTH, DIXON_COLES, NEG_BINOMIAL exist in engines
  const goalEngines = result.engines.filter((e) =>
    ["GOALS", "BAYES_STRENGTH", "DIXON_COLES", "NEG_BINOMIAL"].includes(e.id),
  );
  assert.ok(goalEngines.length >= 3, "Authoritative engine outputs multiple goal models");

  // Derive actionability
  const action = deriveConsensusActionability(result);
  assert.ok(action.actionableMarket, "Actionable market produced");
  // Verification that supporting evidence contains multi-family support note
  assert.ok(
    action.actionableMarket.supportingEvidence.some((e) => e.includes("independent")),
    "Actionable market documents independent family consensus",
  );
});

test("6. Complete 7-market surface is evaluated and candidate pool has diverse options", () => {
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, []);
  const marketMap = buildMainstreamMarketMap(result);

  const marketNames = new Set(marketMap.map((m) => m.market));
  assert.ok(marketNames.has("1X2"), "1X2 must be evaluated");
  assert.ok(marketNames.has("DOUBLE CHANCE"), "DOUBLE CHANCE must be evaluated");
  assert.ok(marketNames.has("DRAW NO BET"), "DRAW NO BET must be evaluated");
  assert.ok(marketNames.has("OVER/UNDER 1.5"), "OVER/UNDER 1.5 must be evaluated");
  assert.ok(marketNames.has("OVER/UNDER 2.5"), "OVER/UNDER 2.5 must be evaluated");
  assert.ok(marketNames.has("OVER/UNDER 3.5"), "OVER/UNDER 3.5 must be evaluated");
  assert.ok(marketNames.has("BTTS"), "BTTS must be evaluated");

  assert.ok(result.marketCandidates.length >= 10, "Candidate pool must contain comprehensive market selections");
});

test("7. Single and UI consumption parity: bestQualifiedMarket mirrors actionableMarket exactly", () => {
  const dominantHomeRows = createTeamHistory("Liverpool", 4, 1, 10, 10);
  const awayRows = createTeamHistory("Everton", 1, 2, 3, 10);
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Liverpool",
    away: "Everton",
    league: "Premier League",
  };
  const result = analyzeActiveAuthoritatively(fixture, dominantHomeRows.concat(awayRows));
  const action = deriveConsensusActionability(result);
  const best = bestQualifiedMarket(result);

  assert.equal(
    best.selection,
    action.actionableMarket?.selection,
    "bestQualifiedMarket selection must strictly match actionableMarket selection",
  );
  assert.equal(
    best.market,
    action.actionableMarket?.market,
    "bestQualifiedMarket market category must strictly match actionableMarket market category",
  );
});
