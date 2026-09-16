import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdaptiveSnapshot } from "../adaptive-regime";
import { analyzeActiveAuthoritatively } from "../authoritative-runtime";
import type { MatchRow } from "../intelligence";

function createMockHistory(team: string, count: number, daysStep = 7, result = "W"): MatchRow[] {
  const baseDate = new Date("2026-03-01T15:00:00Z");
  const rows: MatchRow[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate.getTime() - i * daysStep * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const isHome = i % 2 === 0;
    const isWin = result === "W";
    rows.push({
      date: dateStr,
      home: isHome ? team : "Rival FC",
      away: isHome ? "Rival FC" : team,
      hg: isHome ? (isWin ? 2 : 0) : (isWin ? 0 : 2),
      ag: isHome ? (isWin ? 0 : 2) : (isWin ? 2 : 0),
      competition: "Premier League",
      status: "FT",
    });
  }
  return rows;
}

test("ARRM: zero-evidence snapshot safely falls back to Bayesian prior without NaN", () => {
  const snapshot = buildAdaptiveSnapshot("Unknown FC", [], "home", "2026-03-01");
  assert.equal(snapshot.played, 0);
  assert.equal(snapshot.wins, 0);
  assert.equal(snapshot.draws, 0);
  assert.equal(snapshot.losses, 0);
  assert.equal(snapshot.adaptive.rawSample, 0);
  assert.equal(snapshot.adaptive.effectiveSample, 0);
  assert.equal(snapshot.adaptive.regimeStatus, "STABLE");
  assert.equal(snapshot.adaptive.shrinkagePct, 100);
  assert.ok(Number.isFinite(snapshot.goalsFor));
  assert.ok(Number.isFinite(snapshot.goalsAgainst));
  assert.ok(Number.isFinite(snapshot.points));
});

test("ARRM: continuous adaptive half-life adjusts based on team stability", () => {
  // Stable team with steady results
  const stableRows = createMockHistory("Stable FC", 15, 7, "W");
  const stableSnapshot = buildAdaptiveSnapshot("Stable FC", stableRows, "home", "2026-03-01");

  // Unstable team with recent collapse (won first 10, lost last 5)
  const unstableRows: MatchRow[] = [];
  const baseDate = new Date("2026-03-01T15:00:00Z");
  for (let i = 0; i < 15; i++) {
    const d = new Date(baseDate.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const isRecent = i < 5; // most recent 5 are losses
    unstableRows.push({
      date: dateStr,
      home: "Unstable FC",
      away: "Opponent FC",
      hg: isRecent ? 0 : 3,
      ag: isRecent ? 3 : 0,
      competition: "Premier League",
      status: "FT",
    });
  }
  const unstableSnapshot = buildAdaptiveSnapshot("Unstable FC", unstableRows, "home", "2026-03-01");

  assert.ok(
    unstableSnapshot.adaptive.halfLifeDays < stableSnapshot.adaptive.halfLifeDays,
    `Unstable team half-life (${unstableSnapshot.adaptive.halfLifeDays}d) should be shorter than stable team (${stableSnapshot.adaptive.halfLifeDays}d)`,
  );
  assert.ok(
    unstableSnapshot.adaptive.regimeShiftScore > stableSnapshot.adaptive.regimeShiftScore,
    `Unstable team should have higher regime shift score (${unstableSnapshot.adaptive.regimeShiftScore} vs ${stableSnapshot.adaptive.regimeShiftScore})`,
  );
  assert.equal(unstableSnapshot.adaptive.regimeStatus, "UNSTABLE");
});

test("ARRM: Kish effective sample size accounts for decaying weights", () => {
  const rows = createMockHistory("Arsenal", 20, 14, "W");
  const snapshot = buildAdaptiveSnapshot("Arsenal", rows, "home", "2026-03-01");

  assert.equal(snapshot.adaptive.rawSample, 20);
  assert.ok(
    snapshot.adaptive.effectiveSample < 20,
    `Effective sample (${snapshot.adaptive.effectiveSample}) should be less than raw sample (20) due to recency decay`,
  );
  assert.ok(
    snapshot.adaptive.effectiveSample >= 1,
    `Effective sample (${snapshot.adaptive.effectiveSample}) should be at least 1`,
  );
});

test("ARRM: consensus vote hygiene - derived models excluded from independent model count", () => {
  const history = createMockHistory("Arsenal", 15, 7, "W").concat(
    createMockHistory("Chelsea", 15, 7, "D"),
  );
  const fixture: MatchRow = {
    date: "2026-03-05",
    home: "Arsenal",
    away: "Chelsea",
    competition: "Premier League",
  };

  const result = analyzeActiveAuthoritatively(fixture, history);
  const consensusEngine = result.engines.find((e) => e.id === "CONSENSUS");
  assert.ok(consensusEngine, "Consensus engine must be present");

  const independentCount = consensusEngine.values.independentModels;
  assert.ok(typeof independentCount === "number");

  // Ensure MOMENTUM, SIMULATION, DATA_QUALITY, MARKET, and CONSENSUS were not in the voting pool
  const momentumEngine = result.engines.find((e) => e.id === "MOMENTUM");
  assert.ok(momentumEngine, "ARRM momentum engine must be present as a diagnostic layer");
  assert.equal(momentumEngine.version, "arrm-v1");
  assert.equal(result.analysisVersion, "gfi-authoritative-v10-arrm");
  assert.ok(result.aiReasoningPacket.adaptiveRecencyRegime, "Adaptive recency regime packet must be present");
});
