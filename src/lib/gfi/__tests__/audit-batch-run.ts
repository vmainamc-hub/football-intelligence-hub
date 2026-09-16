import { runBatchAnalysisInternal } from "../batch-analysis";

async function testBatch() {
  console.log("Running runBatchAnalysisInternal...");
  const res = await runBatchAnalysisInternal({ request: "Predict today's next matches", limit: 15 });
  console.log(`Returned ${res.returned} selections.`);
  for (const s of res.selections) {
    console.log(`[${s.fixture.league}] ${s.fixture.home} vs ${s.fixture.away}: ${s.market.market} -> ${s.market.selection} (prob=${s.market.probability.toFixed(3)}, score=${s.score})`);
  }
}

testBatch().catch(console.error);
