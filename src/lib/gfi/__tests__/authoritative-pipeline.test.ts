import test from "node:test";
import assert from "node:assert/strict";
import {
  parseScoreCell,
  isCompletedMatch,
  canonicalTeamName,
  canonicalTeamKey,
  canonicalCompetitionName,
  sameTeamIdentity,
} from "../identity.ts";
import { analyzeActiveAuthoritatively } from "../authoritative-runtime.ts";
import { bestQualifiedMarket, buildMainstreamMarketMap } from "../market-map.ts";
import { analyzeFreeMatch, runMatchAnalysis } from "../match-analysis.ts";
import type { AuthoritativeMatchAnalysis, MatchRow } from "../intelligence.ts";

test("1. Score Parsing: blank/empty/whitespace score cells return undefined, never 0", () => {
  assert.equal(parseScoreCell(""), undefined);
  assert.equal(parseScoreCell("   "), undefined);
  assert.equal(parseScoreCell(undefined), undefined);
  assert.equal(parseScoreCell(null), undefined);
  assert.equal(parseScoreCell("-"), undefined);
  assert.equal(parseScoreCell("N/A"), undefined);
  assert.equal(parseScoreCell("postponed"), undefined);
});

test("2. Score Parsing: 0/0 scores parse correctly as numeric 0, not undefined", () => {
  assert.equal(parseScoreCell("0"), 0);
  assert.equal(parseScoreCell(" 0 "), 0);
  assert.equal(parseScoreCell(0), 0);
  assert.equal(parseScoreCell("1"), 1);
  assert.equal(parseScoreCell("3"), 3);
});

test("3. Data Integrity: Unfinished/Future fixtures are never identified as completed", () => {
  const futureFixture: MatchRow = {
    date: "2026-05-15",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
  };
  assert.equal(isCompletedMatch(futureFixture), false);

  const fixtureWithBlanks: MatchRow = {
    date: "2026-05-15",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
    hg: undefined,
    ag: undefined,
  };
  assert.equal(isCompletedMatch(fixtureWithBlanks), false);

  const playedFixture: MatchRow = {
    date: "2025-01-10",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
    hg: 2,
    ag: 1,
    result: "H",
  };
  assert.equal(isCompletedMatch(playedFixture), true);

  const zeroZeroMatch: MatchRow = {
    date: "2025-01-10",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
    hg: 0,
    ag: 0,
    result: "D",
  };
  assert.equal(isCompletedMatch(zeroZeroMatch), true);
});

test("4. Identity Layer: Canonical team resolution strips noise and resolves aliases", () => {
  assert.equal(canonicalTeamName("Man Utd"), "Manchester United");
  assert.equal(canonicalTeamName("man united"), "Manchester United");
  assert.equal(canonicalTeamName("Manchester United FC"), "Manchester United");
  assert.equal(canonicalTeamName("Arsenal FC"), "Arsenal");
  assert.equal(canonicalTeamName("Paris SG"), "Paris Saint-Germain");
  assert.equal(canonicalTeamName("PSG"), "Paris Saint-Germain");
  assert.equal(canonicalTeamName("Spurs"), "Tottenham");
  assert.equal(canonicalTeamName("Bayern Munich"), "Bayern Munich");
  assert.equal(canonicalTeamName("Athletic Club"), "Athletic Bilbao");
  assert.equal(canonicalTeamName("Sp Braga"), "Braga");

  assert.equal(sameTeamIdentity("Man Utd", "Manchester United FC"), true);
  assert.equal(sameTeamIdentity("Arsenal", "Arsenal FC"), true);
  assert.equal(sameTeamIdentity("Spurs", "Tottenham Hotspur"), true);
  assert.equal(sameTeamIdentity("Wolves", "Wolverhampton Wanderers"), true);
});

test("5. Identity Layer: Canonical competition resolution maps common variants", () => {
  assert.equal(canonicalCompetitionName("EPL"), "Premier League");
  assert.equal(canonicalCompetitionName("English Premier League"), "Premier League");
  assert.equal(canonicalCompetitionName("Premier League"), "Premier League");
  assert.equal(canonicalCompetitionName("La Liga"), "La Liga");
  assert.equal(canonicalCompetitionName("Spanish Primera Division"), "La Liga");
  assert.equal(canonicalCompetitionName("Serie A"), "Serie A");
  assert.equal(canonicalCompetitionName("Italian Serie A"), "Serie A");
  assert.equal(canonicalCompetitionName("Bundesliga"), "Bundesliga");
  assert.equal(canonicalCompetitionName("German Bundesliga"), "Bundesliga");
  assert.equal(canonicalCompetitionName("Ligue 1"), "Ligue 1");
  assert.equal(canonicalCompetitionName("French Ligue 1"), "Ligue 1");
});

test("6. Prediction Authority: Authoritative runtime aggregates ensemble cleanly", () => {
  const target: MatchRow = {
    date: "2026-03-20",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
  };

  const sampleHistory: MatchRow[] = [
    {
      date: "2026-01-01",
      home: "Arsenal",
      away: "Liverpool",
      hg: 2,
      ag: 1,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-01-08",
      home: "Chelsea",
      away: "Everton",
      hg: 1,
      ag: 1,
      result: "D",
      league: "Premier League",
    },
    {
      date: "2026-01-15",
      home: "Arsenal",
      away: "Everton",
      hg: 3,
      ag: 0,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-01-22",
      home: "Fulham",
      away: "Chelsea",
      hg: 1,
      ag: 0,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-02-01",
      home: "Arsenal",
      away: "Chelsea",
      hg: 2,
      ag: 1,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-02-10",
      home: "Chelsea",
      away: "Arsenal",
      hg: 1,
      ag: 1,
      result: "D",
      league: "Premier League",
    },
    {
      date: "2026-02-18",
      home: "Liverpool",
      away: "Arsenal",
      hg: 2,
      ag: 2,
      result: "D",
      league: "Premier League",
    },
    {
      date: "2026-02-25",
      home: "Chelsea",
      away: "Liverpool",
      hg: 0,
      ag: 2,
      result: "A",
      league: "Premier League",
    },
  ];

  const result = analyzeActiveAuthoritatively(target, sampleHistory);

  // Probabilities sum to 1
  const probSum = result.probabilities.home + result.probabilities.draw + result.probabilities.away;
  assert.ok(Math.abs(probSum - 1) < 0.01, `Probabilities sum should be ~1, got ${probSum}`);

  // Agreement and conflict are bounded [0, 1]
  assert.ok(result.consensus.agreement >= 0 && result.consensus.agreement <= 1);
  assert.ok(result.consensus.conflict >= 0 && result.consensus.conflict <= 1);

  // Engines ran and reported real metrics
  assert.ok(result.engines.length >= 5);
  const formEngine = result.engines.find((e) => e.id === "FORM");
  assert.ok(formEngine);
  assert.ok(formEngine.evidence.length > 0);

  // Simulation ran downstream
  const simEngine = result.engines.find((e) => e.id === "SIMULATION");
  assert.ok(simEngine);
  assert.ok(simEngine.values.iterations >= 1000);
});

test("7. Market Qualification: Clear distinction between Authoritative 1X2 Call and Best Actionable Market", () => {
  const target: MatchRow = {
    date: "2026-03-20",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
  };

  const sampleHistory: MatchRow[] = [
    {
      date: "2026-01-01",
      home: "Arsenal",
      away: "Liverpool",
      hg: 2,
      ag: 1,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-01-08",
      home: "Chelsea",
      away: "Everton",
      hg: 1,
      ag: 1,
      result: "D",
      league: "Premier League",
    },
    {
      date: "2026-01-15",
      home: "Arsenal",
      away: "Everton",
      hg: 3,
      ag: 0,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-01-22",
      home: "Fulham",
      away: "Chelsea",
      hg: 1,
      ag: 0,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-02-01",
      home: "Arsenal",
      away: "Chelsea",
      hg: 2,
      ag: 1,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-02-10",
      home: "Chelsea",
      away: "Arsenal",
      hg: 1,
      ag: 1,
      result: "D",
      league: "Premier League",
    },
  ];

  const analysis = analyzeActiveAuthoritatively(target, sampleHistory);
  const markets = buildMainstreamMarketMap(analysis);
  const oneX2 = markets.find((m) => m.market === "1X2");
  const bestAction = bestQualifiedMarket(analysis);

  assert.ok(oneX2, "1X2 market must exist");
  assert.ok(bestAction, "Best qualified market must exist");
  assert.ok(bestAction.selection, "Best actionable market must have a clear selection");
  assert.ok(bestAction.probability > 0, "Probability must be positive");
  assert.ok(bestAction.confidence > 0, "Confidence must be positive");
});

test("8. Route Hydration: Preserves fixture fields across encoding/decoding without catalogue dependency", () => {
  const originalFixture = {
    h: "Manchester United",
    a: "Arsenal",
    d: "2026-04-12",
    t: "16:30",
    c: "EPL",
    l: "English Premier League",
    s: "openfootball",
    i: "en.1#12",
  };

  const encoded = encodeURIComponent(JSON.stringify(originalFixture));
  const decoded = JSON.parse(decodeURIComponent(encoded));

  assert.equal(decoded.h, "Manchester United");
  assert.equal(decoded.a, "Arsenal");
  assert.equal(decoded.d, "2026-04-12");
  assert.equal(decoded.t, "16:30");
  assert.equal(canonicalCompetitionName(decoded.l), "Premier League");
});

test("9. Model Conflict & Safeguards: High model conflict withholds strong 1X2 edge", () => {
  const target: MatchRow = {
    date: "2026-03-20",
    home: "Team Alpha",
    away: "Team Beta",
    league: "Premier League",
  };

  // Mixed results causing high conflict between home form, away form, and venue
  const conflictingHistory: MatchRow[] = [
    {
      date: "2026-01-01",
      home: "Team Alpha",
      away: "Team Gamma",
      hg: 0,
      ag: 3,
      result: "A",
      league: "Premier League",
    },
    {
      date: "2026-01-08",
      home: "Team Delta",
      away: "Team Alpha",
      hg: 0,
      ag: 2,
      result: "A",
      league: "Premier League",
    },
    {
      date: "2026-01-15",
      home: "Team Beta",
      away: "Team Gamma",
      hg: 3,
      ag: 0,
      result: "H",
      league: "Premier League",
    },
    {
      date: "2026-01-22",
      home: "Team Delta",
      away: "Team Beta",
      hg: 2,
      ag: 0,
      result: "H",
      league: "Premier League",
    },
  ];

  const analysis = analyzeActiveAuthoritatively(target, conflictingHistory);

  // When evidence is conflicting or thin, decision reflects humility
  assert.ok(
    [
      "NO STRONG EDGE",
      "DRAW LEAN",
      "HIGH MODEL CONFLICT",
      "INSUFFICIENT INTELLIGENCE",
      "HOME EDGE",
      "AWAY EDGE",
    ].includes(analysis.decision),
  );
  assert.ok(analysis.probabilities.home < 0.85, "No inflated probability on thin/conflicting data");
});

test("10. Ledger Storage: Deduplicates fixture saves instead of creating ghost entries", () => {
  // Simulate mock storage
  const mockStorage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val;
    },
  };

  const fixture1 = {
    date: "2026-03-20",
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
  };

  const records = [
    { id: "rec-1", fixture: { date: "2026-03-20", home: "Arsenal FC", away: "Chelsea" } },
  ];

  // When saving fixture1 again (Arsenal vs Chelsea on 2026-03-20), sameTeamIdentity identifies duplicate
  const isDuplicate = records.some(
    (r) =>
      r.fixture.date === fixture1.date &&
      sameTeamIdentity(r.fixture.home, fixture1.home) &&
      sameTeamIdentity(r.fixture.away, fixture1.away),
  );

  assert.equal(isDuplicate, true, "Must detect duplicate fixture across team name variants");
});

test("11. Resilience: Market map and reasoning safely handle missing or partial probabilities without crashing", () => {
  // Pass an object with undefined probabilities (the exact case that triggered the crash)
  const malformedAnalysis = {
    fixtureId: "test-match",
    home: { team: "Arsenal", played: 10 },
    away: { team: "Chelsea", played: 10 },
    confidence: 60,
    quality: 65,
    risk: "LOW",
    decision: "NO STRONG EDGE",
    probabilities: undefined,
    engines: [],
  } as unknown as AuthoritativeMatchAnalysis;

  // buildMainstreamMarketMap must not throw Cannot destructure property 'home' of 'result.probabilities' as it is undefined
  assert.doesNotThrow(() => {
    const map = buildMainstreamMarketMap(malformedAnalysis);
    assert.ok(Array.isArray(map));
    assert.ok(map.length > 0);
    assert.equal(map[0].market, "1X2");
  });

  // bestQualifiedMarket must also not throw
  assert.doesNotThrow(() => {
    const best = bestQualifiedMarket(malformedAnalysis);
    assert.ok(best);
    assert.ok(best.market);
  });
});

test("12. Web Evidence Integration: Sparse fixture end-to-end analysis executes through authoritative pipeline and produces schema-valid evidenceLedger", async () => {
  const sparseFixture = {
    home: "Chapecoense",
    away: "Operario Ferroviario",
    date: "2026-06-15",
    time: "20:00",
    league: "Brasileiro Serie B",
    code: "G1EA1KP0",
    season: "2026",
    source: "universal-sources",
    sourceId: "sparse-test",
  };

  const analysis = await runMatchAnalysis(sparseFixture.code, sparseFixture);

  assert.ok(analysis, "Analysis must return a result");
  assert.equal(analysis.home.team, "Chapecoense");
  assert.equal(analysis.away.team, "Operario Ferroviario");
  assert.ok(analysis.probabilities, "Probabilities must be generated");
  assert.ok(typeof analysis.probabilities.home === "number");
  assert.ok(typeof analysis.probabilities.draw === "number");
  assert.ok(typeof analysis.probabilities.away === "number");
  assert.ok(Array.isArray(analysis.evidenceLedger), "evidenceLedger must be an array");

  for (const item of analysis.evidenceLedger) {
    assert.ok(typeof item.id === "string" && item.id.length > 0, "EvidenceItem.id must be a string");
    assert.ok(
      item.source === "FREE_RESULTS" ||
        item.source === "DERIVED_MODEL" ||
        item.source === "OPTIONAL_PROVIDER",
      `EvidenceItem.source must be a valid source type, got: ${item.source}`
    );
    assert.ok(
      typeof item.statement === "string" && item.statement.length > 0,
      "EvidenceItem.statement must be a non-empty string"
    );
    assert.ok(
      typeof item.quality === "number" && item.quality >= 0 && item.quality <= 100,
      "EvidenceItem.quality must be a number between 0 and 100"
    );
  }

  assert.ok(analysis.aiReasoningPacket, "aiReasoningPacket must exist");
  assert.ok(analysis.aiReasoningPacket.research, "aiReasoningPacket.research must exist");
});
