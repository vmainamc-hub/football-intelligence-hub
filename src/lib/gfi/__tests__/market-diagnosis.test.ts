import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveAuthoritatively } from "../authoritative-runtime";
import { deriveConsensusActionability } from "../actionability";
import { bestQualifiedMarket } from "../market-map";
import type { MatchRow } from "../intelligence";

function createTeamHistory(team: string, gf: number, ga: number, wins: number, count = 15): MatchRow[] {
  const baseDate = new Date("2026-03-01T15:00:00Z");
  const rows: MatchRow[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const isHome = i % 2 === 0;
    const isWin = i < wins;
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

test("Market diagnosis: inspect market selection across diverse profiles", () => {
  // Scenario 1: Ultra-low scoring defensive clash (0-0, 1-0, 0-1 matches)
  const lowScoreRows = createTeamHistory("Defensive A", 0, 0, 5, 12).concat(
    createTeamHistory("Defensive B", 0, 0, 5, 12),
  );
  const lowFixture: MatchRow = {
    date: "2026-03-05",
    home: "Defensive A",
    away: "Defensive B",
    league: "Premier League",
  };
  const lowResult = analyzeActiveAuthoritatively(lowFixture, lowScoreRows);
  const lowAction = deriveConsensusActionability(lowResult);
  const lowBest = bestQualifiedMarket(lowResult);

  console.log("=== LOW SCORING CLASH ===");
  console.log("Final prediction:", lowResult.finalPrediction);
  console.log("Actionable market:", lowAction.actionableMarket?.market, lowAction.actionableMarket?.selection, lowAction.actionableMarket?.modelProbability);
  console.log("Best qualified:", lowBest.market, lowBest.selection, lowBest.probability);
  console.log("Totals:", lowResult.totals);

  // Scenario 2: High scoring shootout (4-2, 3-3, 3-2 matches)
  const highRows = createTeamHistory("Attacking A", 3, 2, 8, 12).concat(
    createTeamHistory("Attacking B", 3, 2, 8, 12),
  );
  const highFixture: MatchRow = {
    date: "2026-03-05",
    home: "Attacking A",
    away: "Attacking B",
    league: "Premier League",
  };
  const highResult = analyzeActiveAuthoritatively(highFixture, highRows);
  const highAction = deriveConsensusActionability(highResult);
  const highBest = bestQualifiedMarket(highResult);

  console.log("\n=== HIGH SCORING SHOOTOUT ===");
  console.log("Final prediction:", highResult.finalPrediction);
  console.log("Actionable market:", highAction.actionableMarket?.market, highAction.actionableMarket?.selection, highAction.actionableMarket?.modelProbability);
  console.log("Best qualified:", highBest.market, highBest.selection, highBest.probability);
  console.log("Totals:", highResult.totals);

  // Scenario 3: Massive home favorite (dominant wins) vs weak away (heavy losses)
  const dominantHomeRows = createTeamHistory("Man City", 3, 0, 12, 12);
  const weakAwayRows = createTeamHistory("Luton", 0, 3, 1, 12);
  const dominantFixture: MatchRow = {
    date: "2026-03-05",
    home: "Man City",
    away: "Luton",
    league: "Premier League",
  };
  const domResult = analyzeActiveAuthoritatively(dominantFixture, dominantHomeRows.concat(weakAwayRows));
  const domAction = deriveConsensusActionability(domResult);
  const domBest = bestQualifiedMarket(domResult);

  console.log("\n=== DOMINANT HOME FAVORITE ===");
  console.log("Final prediction:", domResult.finalPrediction);
  console.log("Actionable market:", domAction.actionableMarket?.market, domAction.actionableMarket?.selection, domAction.actionableMarket?.modelProbability);
  console.log("Best qualified:", domBest.market, domBest.selection, domBest.probability);
  console.log("Probabilities:", domResult.probabilities);

  // Scenario 4: Sparse / Zero evidence
  const sparseFixture: MatchRow = {
    date: "2026-03-05",
    home: "Unknown A",
    away: "Unknown B",
    league: "Premier League",
  };
  const sparseResult = analyzeActiveAuthoritatively(sparseFixture, []);
  const sparseAction = deriveConsensusActionability(sparseResult);
  const sparseBest = bestQualifiedMarket(sparseResult);

  console.log("\n=== SPARSE / ZERO EVIDENCE ===");
  console.log("Final prediction:", sparseResult.finalPrediction);
  console.log("Actionable market:", sparseAction.actionableMarket?.market, sparseAction.actionableMarket?.selection, sparseAction.actionableMarket?.modelProbability);
  console.log("Best qualified:", sparseBest.market, sparseBest.selection, sparseBest.probability);
  console.log("Probabilities:", sparseResult.probabilities);
  console.log("Totals:", sparseResult.totals);
});
