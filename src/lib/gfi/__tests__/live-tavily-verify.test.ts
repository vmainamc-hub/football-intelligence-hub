import test from "node:test";
import assert from "node:assert/strict";
import { runMatchAnalysis } from "../match-analysis";

test("Live Tavily sparse fixture production verification", async () => {
  const sparseFixture = {
    home: "Nairobi City Stars",
    away: "Bidco United",
    date: "2026-09-17",
    time: "15:00",
    league: "Kenyan Premier League",
    code: "KPL_LIVE_TAVILY_VERIFY",
    season: "2026",
    source: "betika",
    sourceId: "live-tavily-verify-1",
  };

  const analysis = await runMatchAnalysis(sparseFixture.code, sparseFixture);

  const tavilyItems = analysis.evidenceLedger.filter(
    (item) =>
      item.source === "OPTIONAL_PROVIDER" ||
      item.provider === "Tavily / web" ||
      item.id.startsWith("TAVILY_"),
  );

  const webEv = analysis.aiReasoningPacket?.research?.webEvidence;

  console.log("\n================ LIVE TAVILY VERIFICATION METRICS ================");
  console.log(`Tavily configured: ${webEv?.configured ? "YES" : "NO"}`);
  console.log(`Real API request: ${webEv?.attempted ? "YES" : "NO"}`);
  console.log(`Searches: ${webEv?.searchesAttempted ?? 0}`);
  console.log(`Results: ${webEv?.resultsReturned ?? 0}`);
  console.log(`Useful football results: ${webEv?.usefulFootballResults ?? 0}`);
  console.log(`Structured facts: ${webEv?.structuredFactsCount ?? 0}`);
  console.log(`Dated score rows: ${webEv?.datedScoreRowsCount ?? 0}`);
  console.log(`Evidence ledger entries: ${tavilyItems.length}`);
  console.log(`Authoritative model consumed evidence: ${analysis.probabilities ? "YES" : "NO"}`);
  console.log(`Model recalculated: ${analysis.ensemble ? "YES" : "NO"}`);
  console.log(
    `Source lineage preserved: ${
      tavilyItems.every((it) => it.provider === "Tavily / web" && it.sourceFamily === "Tavily / web")
        ? "YES"
        : "NO"
    }`,
  );
  console.log("==================================================================\n");

  assert.ok(webEv?.configured, "Tavily must be configured");
  assert.ok(webEv?.attempted, "Real API request must be attempted");
  assert.ok((webEv?.resultsReturned ?? 0) > 0, "Tavily must return results");
  assert.ok((webEv?.usefulFootballResults ?? 0) > 0, "Useful football results must be extracted");
  assert.ok(tavilyItems.length > 0, "Tavily items must be present in canonical evidence ledger");
  assert.equal(tavilyItems[0]?.provider, "Tavily / web");
  assert.equal(tavilyItems[0]?.sourceFamily, "Tavily / web");
  assert.equal(tavilyItems[0]?.source, "OPTIONAL_PROVIDER");
});
