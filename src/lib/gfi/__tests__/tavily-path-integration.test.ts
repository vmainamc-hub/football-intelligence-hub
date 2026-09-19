import test from "node:test";
import assert from "node:assert/strict";
import { runMatchAnalysis } from "../match-analysis";
import type { MatchRow } from "../intelligence";

test("Tavily Data Path Integration: Mock Tavily response -> structured football facts -> evidence ledger -> authoritative analysis input", async () => {
  const origKey = process.env.TAVILY_API_KEY;
  const origFetch = globalThis.fetch;

  // Set mock key so tavily-evidence identifies as configured
  process.env.TAVILY_API_KEY = "mock-tavily-test-key";

  // Mock global fetch to return a simulated Tavily response containing dated football results
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;

    if (urlStr.includes("api.tavily.com")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Mockingbird Rovers vs Pegasus Wanderers 2-1 Match Report",
              url: "https://example.com/sports/mockingbird-pegasus-match",
              content:
                "Mockingbird Rovers 2 - 1 Pegasus Wanderers on 2026-02-14 in an exciting football clash with early goals.",
              published_date: "2026-02-14",
            },
            {
              title: "Pegasus Wanderers vs Mockingbird Rovers 0-1 Result Summary",
              url: "https://football-archive.org/match/10029",
              content:
                "Pegasus Wanderers 0 - 1 Mockingbird Rovers on 2025-11-20. Mockingbird solid away form continues with clean sheet.",
              published_date: "2025-11-20",
            },
            {
              title: "Mockingbird Rovers recent head to head preview",
              url: "https://soccer-news.org/h2h/mockingbird-pegasus",
              content:
                "Both teams have met several times with strong form in league football and intense competition.",
              published_date: "2026-03-01",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Return empty json for non-tavily calls to avoid slow external network timeouts
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const sparseFixture: MatchRow = {
      date: "2026-09-17",
      time: "19:00",
      home: "Mockingbird Rovers",
      away: "Pegasus Wanderers",
      league: "Worldwide Football",
      code: "TEST_MOCK_TAVILY_INTEG",
      season: "2026",
      source: "universal-sources",
      sourceId: "mock-tavily-test-fixture",
    };

    // Run the complete production match-analysis pipeline
    const analysis = await runMatchAnalysis(sparseFixture.code!, sparseFixture, []);

    // 1. Verify structured facts and dated score extraction
    assert.ok(analysis.aiReasoningPacket, "aiReasoningPacket must exist");
    const research = analysis.aiReasoningPacket.research as {
      webMatches?: number;
      webEvidence?: {
        usefulFootballResults: number;
        datedScoreRowsCount: number;
        factsCount: number;
      };
    };
    assert.ok(research, "Research packet must be present");
    assert.ok(research.webMatches! >= 1, `webMatches must be >= 1, got ${research.webMatches}`);
    assert.ok(
      research.webEvidence && research.webEvidence.usefulFootballResults >= 1,
      "Useful football results must be >= 1",
    );

    // 2. Verify evidence ledger contains Tavily entries with preserved provenance
    const tavilyLedgerItems = analysis.evidenceLedger.filter(
      (item) => item.provider === "Tavily / web" || item.id.startsWith("TAVILY_"),
    );
    assert.ok(
      tavilyLedgerItems.length > 0,
      "Evidence ledger must contain normalized Tavily / web items",
    );

    for (const item of tavilyLedgerItems) {
      assert.equal(item.provider, "Tavily / web");
      assert.equal(item.sourceFamily, "Tavily / web");
      assert.equal(item.source, "OPTIONAL_PROVIDER");
      assert.ok(
        item.provenance && item.provenance.startsWith("http"),
        `Provenance must preserve URL: ${item.provenance}`,
      );
      assert.ok(
        item.statement.includes("Web evidence"),
        `Statement must identify web evidence: ${item.statement}`,
      );
    }

    // 3. Verify that the authoritative engine model inputs received the historical rows
    // The historical rows from Tavily (dated 2026-02-14 and 2025-11-20) are before the fixture date (2026-09-17)
    // and must be ingested by the authoritative engine (home.played or away.played > 0)
    assert.ok(
      analysis.home.played > 0 || analysis.away.played > 0,
      `Authoritative engine must consume historical rows into team snapshots (home: ${analysis.home.played}, away: ${analysis.away.played})`,
    );

    // 4. Verify authoritative engines recalculated model inputs
    const formEngine = analysis.engines.find((e) => e.id === "FORM");
    const h2hEngine = analysis.engines.find((e) => e.id === "H2H");
    assert.ok(formEngine, "Authoritative FORM engine must be present");
    assert.ok(h2hEngine, "Authoritative H2H engine must be present");

    // Form engine evidence must reflect the team sample
    assert.ok(
      formEngine.evidence.some((ev) => ev.includes("Mockingbird Rovers") || ev.includes("PPG")),
      "FORM engine evidence must reference calculated team PPG",
    );

    // 5. Verify that Tavily evidence did NOT bypass the authoritative engine
    // Decision, consensus, probabilities, and final prediction are authoritative engine outputs
    assert.ok(analysis.decision, "Decision must be generated by authoritative engine");
    assert.ok(analysis.probabilities.home > 0 && analysis.probabilities.home < 1);
    assert.ok(analysis.consensus, "Consensus must be formed by authoritative engines");
    assert.ok(
      analysis.engines.every((e) => e.id !== ("TAVILY" as any)),
      "Tavily must NOT be an engine family; it remains purely evidence",
    );
  } finally {
    globalThis.fetch = origFetch;
    if (origKey !== undefined) {
      process.env.TAVILY_API_KEY = origKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  }
});

test("Tavily Data Path Integration: Graceful continuation when Tavily fails or returns no evidence", async () => {
  const origKey = process.env.TAVILY_API_KEY;
  const origFetch = globalThis.fetch;

  process.env.TAVILY_API_KEY = "mock-tavily-test-key";

  // Simulate network 500 error from Tavily
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes("api.tavily.com")) {
      return new Response("Service Unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const sparseFixture: MatchRow = {
      date: "2026-09-17",
      time: "20:00",
      home: "Silent Falcons",
      away: "Quiet Hawks",
      league: "Worldwide Football",
      code: "TEST_FAIL_CONTINUE",
      season: "2026",
      source: "universal-sources",
      sourceId: "fail-test-fixture",
    };

    // The entire pipeline must complete successfully without crashing
    const analysis = await runMatchAnalysis(sparseFixture.code!, sparseFixture, []);

    assert.ok(analysis, "Analysis must resolve even if Tavily errors");
    assert.ok(analysis.probabilities, "Probabilities must still be computed via priors");
    assert.ok(analysis.decision, "Authoritative decision must be produced");
    assert.ok(
      analysis.warnings.some((w) => w.includes("sample") || w.includes("evidence")),
      "Appropriate warning regarding sparse sample must be retained",
    );
  } finally {
    globalThis.fetch = origFetch;
    if (origKey !== undefined) {
      process.env.TAVILY_API_KEY = origKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  }
});
