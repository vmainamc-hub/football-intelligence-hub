import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeAuthoritatively, type AuthoritativeMatchAnalysis } from "./authoritative";
import { simulationEngineOutput } from "./simulation-engine";

export type AnalysisPipelineTrace = {
  fixtureId: string;
  source: string;
  competition: string;
  competitionsLoaded: number;
  historicalRowsLoaded: number;
  targetCompetitionRows: number;
  homeRowsMatched: number;
  awayRowsMatched: number;
  homeSample: number;
  awaySample: number;
  h2hSample: number;
  enginesRun: string[];
  evidenceMode: "TARGET_COMPETITION" | "GLOBAL_CONTEXT" | "LIMITED";
  simulation: { iterations: number; homeWin: number; draw: number; awayWin: number; agreement: number };
  generatedAt: string;
};

export type ServerMatchAnalysis = AuthoritativeMatchAnalysis & { pipeline: AnalysisPipelineTrace };

const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bfootball club\b/g, "").replace(/\b(afc|fc|cf|sc)\b/g, "").replace(/[^a-z0-9]/g, "").trim();
const aliases = (value: string) => { const base = normalizeName(value); const variants = new Set([base]); for (const suffix of ["united", "city", "town", "rovers", "athletic"]) if (base.endsWith(suffix) && base.length > suffix.length + 3) variants.add(base.slice(0, -suffix.length)); return variants; };
function sameTeam(a: string, b: string) { if (a === b) return true; const aa = aliases(a), bb = aliases(b); for (const value of aa) if (bb.has(value)) return true; return false; }
function dateKey(value: string) { const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return value; const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]); return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
function fixtureId(fixture: MatchRow) { return [dateKey(fixture.date), normalizeName(fixture.home), normalizeName(fixture.away), fixture.time ?? "", fixture.league ?? "", fixture.source ?? "free", fixture.sourceId ?? ""].join("|"); }
function prepareHistoricalMatches(fixture: MatchRow, rows: MatchRow[]) { return rows.filter((row) => row.hg !== undefined && row.ag !== undefined).filter((row) => dateKey(row.date) < dateKey(fixture.date)).map((row) => ({ ...row, home: sameTeam(row.home, fixture.home) ? fixture.home : sameTeam(row.home, fixture.away) ? fixture.away : row.home, away: sameTeam(row.away, fixture.home) ? fixture.home : sameTeam(row.away, fixture.away) ? fixture.away : row.away })).sort((a, b) => `${dateKey(a.date)} ${a.time ?? ""}`.localeCompare(`${dateKey(b.date)} ${b.time ?? ""}`)); }
function dedupeRows(rows: MatchRow[]) { const seen = new Set<string>(), result: MatchRow[] = []; for (const row of rows) { const id = `${dateKey(row.date)}|${normalizeName(row.home)}|${normalizeName(row.away)}|${row.hg ?? ""}|${row.ag ?? ""}`; if (seen.has(id)) continue; seen.add(id); result.push(row); } return result; }

export const analyzeFreeMatch = createServerFn({ method: "POST" })
  .validator((input: { code: string; fixture: MatchRow }) => input)
  .handler(async ({ data }): Promise<ServerMatchAnalysis> => {
    const groups = await loadFreeFixtures();
    const group = groups.find((item) => item.code === data.code);
    if (!group) throw new Error(`Competition ${data.code} is not available in FREE MODE.`);
    const targetRows = prepareHistoricalMatches(data.fixture, group.matches);
    const globalRows = prepareHistoricalMatches(data.fixture, groups.flatMap((item) => item.matches));
    const historical = dedupeRows([...targetRows, ...globalRows]);
    const homeRows = historical.filter((row) => sameTeam(row.home, data.fixture.home) || sameTeam(row.away, data.fixture.home));
    const awayRows = historical.filter((row) => sameTeam(row.home, data.fixture.away) || sameTeam(row.away, data.fixture.away));
    const evidenceMode: AnalysisPipelineTrace["evidenceMode"] = Math.min(homeRows.length, awayRows.length) >= 8 ? "TARGET_COMPETITION" : Math.min(homeRows.length, awayRows.length) >= 4 ? "GLOBAL_CONTEXT" : "LIMITED";
    const result = analyzeAuthoritatively({ ...data.fixture }, historical);
    const simulation = simulationEngineOutput(result, 10000);
    const engines = [...result.engines, simulation.engine];
    const winner = result.probabilities.home >= result.probabilities.draw && result.probabilities.home >= result.probabilities.away ? "home" : result.probabilities.away >= result.probabilities.draw ? "away" : "draw";
    const simulationWinner = simulation.summary.homeWin >= simulation.summary.draw && simulation.summary.homeWin >= simulation.summary.awayWin ? "home" : simulation.summary.awayWin >= simulation.summary.draw ? "away" : "draw";
    const simulationContradicts = winner !== simulationWinner && simulation.summary.scenarioAgreement < 0.72;
    const finalDecision = simulationContradicts && (result.decision === "HOME EDGE" || result.decision === "AWAY EDGE") ? "NO STRONG EDGE" : result.decision;
    const finalPrediction = finalDecision === "HOME EDGE" ? `HOME WIN — ${result.home.team}` : finalDecision === "AWAY EDGE" ? `AWAY WIN — ${result.away.team}` : finalDecision === "DRAW LEAN" ? "DRAW LEAN" : result.finalPrediction;
    const generatedAt = new Date().toISOString();
    return {
      ...result,
      engines,
      decision: finalDecision,
      finalPrediction,
      pipeline: {
        fixtureId: fixtureId(data.fixture),
        source: data.fixture.source ?? "free-data",
        competition: data.fixture.league ?? group.league,
        competitionsLoaded: groups.length,
        historicalRowsLoaded: historical.length,
        targetCompetitionRows: targetRows.length,
        homeRowsMatched: homeRows.length,
        awayRowsMatched: awayRows.length,
        homeSample: result.home.played,
        awaySample: result.away.played,
        h2hSample: result.engines.find((engine) => engine.id === "H2H")?.values.matches ?? 0,
        enginesRun: engines.map((engine) => engine.id),
        evidenceMode,
        simulation: { iterations: simulation.summary.iterations, homeWin: simulation.summary.homeWin, draw: simulation.summary.draw, awayWin: simulation.summary.awayWin, agreement: simulation.summary.scenarioAgreement },
        generatedAt,
      },
    };
  });
