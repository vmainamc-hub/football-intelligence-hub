import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures } from "./intelligence";
import { analyzeLoadedFixture } from "./server-pipeline";

export type BacktestReport = {
  fixtures: number;
  evaluated: number;
  correct: number;
  hitRate: number;
  brier: number;
  logLoss: number;
  averageConfidence: number;
  averageQuality: number;
  enginesObserved: string[];
};

export const runBacktest = createServerFn({ method: "POST" })
  .validator((input: { limit?: number }) => input)
  .handler(async ({ data }): Promise<BacktestReport> => {
    const groups = await loadFreeFixtures();
    const completed = groups.flatMap((g) =>
      g.matches
        .filter((m) => m.hg !== undefined && m.ag !== undefined)
        .map((m) => ({ ...m, league: g.league, code: g.code })),
    );
    const fixtures = completed.slice(-Math.max(12, Math.min(data.limit ?? 40, 80)));
    let correct = 0,
      brier = 0,
      logLoss = 0,
      conf = 0,
      quality = 0;
    const engineIds = new Set<string>();
    for (const fixture of fixtures) {
      const analysis = analyzeLoadedFixture(fixture, fixture.code, groups);
      const actual =
        fixture.hg! > fixture.ag! ? "home" : fixture.hg! < fixture.ag! ? "away" : "draw";
      const predicted =
        analysis.probabilities.home >= analysis.probabilities.away &&
        analysis.probabilities.home >= analysis.probabilities.draw
          ? "home"
          : analysis.probabilities.away >= analysis.probabilities.draw
            ? "away"
            : "draw";
      if (predicted === actual) correct++;
      const q =
        actual === "home"
          ? analysis.probabilities.home
          : actual === "draw"
            ? analysis.probabilities.draw
            : analysis.probabilities.away;
      brier += (1 - q) ** 2;
      logLoss -= Math.log(Math.max(0.0001, q));
      conf += analysis.confidence;
      quality += analysis.quality;
      analysis.engines.forEach((e) => engineIds.add(e.id));
    }
    const evaluated = fixtures.length;
    return {
      fixtures: completed.length,
      evaluated,
      correct,
      hitRate: evaluated ? correct / evaluated : 0,
      brier: evaluated ? brier / evaluated : 0,
      logLoss: evaluated ? logLoss / evaluated : 0,
      averageConfidence: evaluated ? conf / evaluated : 0,
      averageQuality: evaluated ? quality / evaluated : 0,
      enginesObserved: [...engineIds],
    };
  });
