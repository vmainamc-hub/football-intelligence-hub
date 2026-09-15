import test from "node:test";
import assert from "node:assert/strict";
import { kickoffKenya, type MatchRow } from "../intelligence.ts";
import { getUpcomingFixturesByDay } from "../upcoming.ts";
import { canonicalCompetitionName } from "../identity.ts";

test("Timezone Handling: Tuesday 23:00 UTC match converts to Wednesday 02:00 EAT and shifts calendar day", () => {
  const espnUtcMatch: MatchRow = {
    date: "2026-09-15", // Tuesday
    time: "23:00", // 23:00 UTC
    home: "Flamengo",
    away: "Palmeiras",
    source: "espn",
    league: "Copa Libertadores",
  };

  const kenyaTime = kickoffKenya(espnUtcMatch);
  assert.equal(
    kenyaTime,
    "2026-09-15+1 02:00",
    "23:00 UTC with +3h offset must convert to 02:00 with +1 day shift",
  );

  const days = getUpcomingFixturesByDay(
    [
      {
        league: "Copa Libertadores",
        code: "LIB",
        season: "2627",
        matches: [espnUtcMatch],
        sourceUrl: "espn-api",
        fetchedAt: new Date().toISOString(),
      },
    ],
    7,
  );

  // The match must appear on 2026-09-16 (Wednesday), NOT 2026-09-15 (Tuesday)
  const tuesdayBucket = days.find((d) => d.date === "2026-09-15");
  const wednesdayBucket = days.find((d) => d.date === "2026-09-16");

  assert.equal(tuesdayBucket?.matches.length ?? 0, 0, "Match must not be in Tuesday bucket");
  assert.equal(wednesdayBucket?.matches.length, 1, "Match must be in Wednesday bucket");
  assert.equal(wednesdayBucket?.matches[0].home, "Flamengo");
});

test("Timezone Handling: Betika EAT time is not double-shifted", () => {
  const betikaMatch: MatchRow = {
    date: "2026-09-15",
    time: "20:00", // Already in Kenya EAT
    home: "Arsenal",
    away: "Chelsea",
    source: "betika",
    league: "Premier League",
  };

  const kenyaTime = kickoffKenya(betikaMatch);
  assert.equal(
    kenyaTime,
    "2026-09-15 20:00",
    "Betika time is already EAT and should have 0 offset",
  );
});

test("Competition Normalization: Maps cups, continental tournaments, and leagues cleanly", () => {
  assert.equal(canonicalCompetitionName("EFL Cup"), "EFL Cup");
  assert.equal(canonicalCompetitionName("Carabao Cup"), "EFL Cup");
  assert.equal(canonicalCompetitionName("CONMEBOL Libertadores"), "Copa Libertadores");
  assert.equal(canonicalCompetitionName("CONMEBOL Sudamericana"), "Copa Sudamericana");
  assert.equal(canonicalCompetitionName("UEFA Champions League"), "UEFA Champions League");
  assert.equal(canonicalCompetitionName("Spanish La Liga"), "La Liga");
  assert.equal(canonicalCompetitionName("English Premier League"), "Premier League");
  assert.equal(canonicalCompetitionName("Brasileiro Serie B"), "Brasileiro Serie B");
});
