import test from "node:test";
import assert from "node:assert/strict";
import { acquireWebEvidence, isTavilyConfigured } from "../tavily-evidence";

test("Tavily evidence: graceful handling without API key", async () => {
  // Save original env
  const origKey = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;

  try {
    const result = await acquireWebEvidence({
      home: "Arsenal",
      away: "Chelsea",
      fixtureDate: "2026-09-17",
    });

    assert.equal(result.configured, false);
    assert.equal(result.attempted, false);
    assert.equal(result.searchesAttempted, 0);
    assert.equal(result.resultsReturned, 0);
    assert.deepEqual(result.structuredFacts, []);
    assert.deepEqual(result.datedScoreRows, []);
  } finally {
    if (origKey) process.env.TAVILY_API_KEY = origKey;
  }
});

test("Tavily evidence: graceful handling with empty team params", async () => {
  const origKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-dummy-key";

  try {
    const result = await acquireWebEvidence({
      home: "",
      away: "Chelsea",
    });

    assert.equal(result.configured, true);
    assert.equal(result.attempted, false);
    assert.equal(result.searchesAttempted, 0);
  } finally {
    if (origKey !== undefined) {
      process.env.TAVILY_API_KEY = origKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  }
});

test("Tavily evidence: hard timeout and error caching protection", async () => {
  const origKey = process.env.TAVILY_API_KEY;
  const origFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-dummy-key";

  let callCount = 0;
  // Mock fetch that hangs or fails
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    callCount++;
    const signal = init?.signal;
    return new Promise((resolve, reject) => {
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      }
    });
  }) as typeof fetch;

  try {
    const startTime = Date.now();
    const result1 = await acquireWebEvidence({
      home: "MockHomeTeamTimeoutTest",
      away: "MockAwayTeamTimeoutTest",
      fixtureDate: "2026-09-17",
    });
    const elapsed = Date.now() - startTime;

    assert.equal(result1.attempted, true);
    assert.ok(result1.error, "Result must contain timeout error");
    assert.ok(elapsed < 8_000, `Execution time (${elapsed}ms) must be under 8000ms`);
    assert.equal(callCount, 1);

    // Immediate second call should be caught by negative cache and NOT hit fetch again
    const result2 = await acquireWebEvidence({
      home: "MockHomeTeamTimeoutTest",
      away: "MockAwayTeamTimeoutTest",
      fixtureDate: "2026-09-17",
    });

    assert.equal(callCount, 1, "Second call must hit cache and NOT invoke fetch again");
    assert.equal(result2.error, result1.error);
  } finally {
    globalThis.fetch = origFetch;
    if (origKey !== undefined) {
      process.env.TAVILY_API_KEY = origKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  }
});

test("Tavily evidence: in-flight request deduplication prevents concurrent bursts", async () => {
  const origKey = process.env.TAVILY_API_KEY;
  const origFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-dummy-key";

  let fetchInvocations = 0;
  globalThis.fetch = (async () => {
    fetchInvocations++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response(
      JSON.stringify({
        results: [
          {
            title: "Arsenal vs Chelsea 2-1 Match Report",
            url: "https://bbc.com/sport/football/123",
            content: "Arsenal beat Chelsea 2-1 in a London derby.",
            published_date: "2026-09-17",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    // Fire 3 simultaneous requests for the exact same fixture
    const [res1, res2, res3] = await Promise.all([
      acquireWebEvidence({ home: "DedupTeamA", away: "DedupTeamB", fixtureDate: "2026-09-17" }),
      acquireWebEvidence({ home: "DedupTeamA", away: "DedupTeamB", fixtureDate: "2026-09-17" }),
      acquireWebEvidence({ home: "DedupTeamA", away: "DedupTeamB", fixtureDate: "2026-09-17" }),
    ]);

    assert.equal(fetchInvocations, 1, "Must only invoke fetch once for concurrent duplicate calls");
    assert.equal(res1.usefulFootballResults, 1);
    assert.equal(res2.usefulFootballResults, 1);
    assert.equal(res3.usefulFootballResults, 1);
  } finally {
    globalThis.fetch = origFetch;
    if (origKey !== undefined) {
      process.env.TAVILY_API_KEY = origKey;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  }
});

