import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeLoadedFixture, type ServerMatchAnalysis } from "./server-pipeline";

export type BatchAnalysisRow = { fixture: MatchRow & { league: string; code: string; season: string }; analysis: ServerMatchAnalysis; score: number };

function dateKey(value: string) { const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return value; const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]); return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
function kickoffValue(match: MatchRow) { return `${dateKey(match.date)}T${match.time ?? "23:59"}`; }
function actionableScore(analysis: ServerMatchAnalysis) {
  const p = analysis.probabilities;
  const top = Math.max(p.home, p.draw, p.away);
  return top * 60 + analysis.quality * 0.25 + analysis.consensus.agreement * 15 - analysis.consensus.conflict * 20;
}

export const runBatchAnalysis = createServerFn({ method: "POST" })
  .validator((input: { limit?: number; includeUpcoming?: boolean }) => input)
  .handler(async ({ data }): Promise<BatchAnalysisRow[]> => {
    const groups = await loadFreeFixtures();
    const includeUpcoming = data.includeUpcoming !== false;
    const rows = groups.flatMap((group) => group.matches.filter((m) => includeUpcoming ? true : m.hg !== undefined && m.ag !== undefined).map((m) => ({ ...m, league: group.league, code: group.code, season: group.season })));
    const unique = new Map<string, MatchRow & { league: string; code: string; season: string }>();
    for (const row of rows) unique.set(`${dateKey(row.date)}|${row.home}|${row.away}|${row.time ?? ""}|${row.source ?? ""}`, row);
    const ordered = [...unique.values()].sort((a, b) => kickoffValue(a).localeCompare(kickoffValue(b)));
    const target = includeUpcoming ? ordered.filter((m) => m.hg === undefined || m.ag === undefined).slice(0, Math.max(1, Math.min(data.limit ?? 20, 40))) : ordered.slice(-Math.max(1, Math.min(data.limit ?? 20, 40)));
    const analysed = target.map((fixture) => {
      const analysis = analyzeLoadedFixture(fixture, fixture.code, groups);
      return { fixture, analysis, score: actionableScore(analysis) };
    });
    return analysed.sort((a, b) => b.score - a.score);
  });
