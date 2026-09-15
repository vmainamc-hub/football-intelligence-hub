import test from "node:test";
import assert from "node:assert/strict";
import { analyzeActiveAuthoritatively } from "../authoritative-runtime.ts";
import type { MatchRow } from "../intelligence.ts";

test("audit regression: zero direct team evidence never creates the old near-certain low-score result", () => {
  const target: MatchRow = {
    date: "2026-09-15",
    home: "Wadi Degla",
    away: "Al Mokawloon",
    league: "Egyptian Premier League",
  };
  const globalHistory: MatchRow[] = Array.from({ length: 40 }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    home: i % 2 ? "Team A" : "Team B",
    away: i % 2 ? "Team C" : "Team D",
    hg: i % 4 === 0 ? 0 : i % 3 === 0 ? 2 : 1,
    ag: i % 5 === 0 ? 2 : i % 2,
    result: "H" as const,
    league: "Egyptian Premier League",
  }));
  const result = analyzeActiveAuthoritatively(target, globalHistory);
  const goals = result.engines.find((e) => e.id === "GOALS");
  assert.equal(result.home.played, 0);
  assert.equal(result.away.played, 0);
  assert.equal(result.decision, "INSUFFICIENT INTELLIGENCE");
  assert.equal(result.aiReasoningPacket.sparsePriorUsed, true);
  assert.match(result.warnings.join(" | "), /global prior/i);
  assert.ok(
    result.confidence < 70,
    `Sparse evidence confidence must remain limited; got ${result.confidence}`,
  );
  assert.ok(
    result.quality < 70,
    `Sparse evidence quality must remain limited; got ${result.quality}`,
  );
  assert.ok(result.probabilities.home > 0.25 && result.probabilities.home < 0.6);
  assert.ok(result.probabilities.draw > 0.15 && result.probabilities.draw < 0.45);
  assert.ok(result.probabilities.away > 0.15 && result.probabilities.away < 0.55);
  assert.ok(goals);
  assert.notEqual(Number(goals.values.lambdaHome), 0.25);
  assert.notEqual(Number(goals.values.lambdaAway), 0.2);
});

test("audit regression: event probability and epistemic confidence are distinct", () => {
  const target: MatchRow = {
    date: "2026-09-15",
    home: "Wadi Degla",
    away: "Al Mokawloon",
    league: "Egyptian Premier League",
  };
  const result = analyzeActiveAuthoritatively(target, []);
  const totals = result.engines.find((e) => e.id === "TOTALS");
  const over15 = Number(totals?.values["over1.5"] ?? NaN);
  assert.ok(Number.isFinite(over15));
  assert.notEqual(Math.round(over15 * 100), result.confidence);
  assert.equal(
    result.aiReasoningPacket.confidenceDefinition,
    "Epistemic confidence is evidence/coverage/consensus quality; it is never equal to event probability.",
  );
});
