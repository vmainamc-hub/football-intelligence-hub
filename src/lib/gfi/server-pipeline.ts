import type { MatchRow, FreeLeague } from "./intelligence";
import { analyzeActiveAuthoritatively } from "./authoritative-runtime";
import type { AuthoritativeMatchAnalysis } from "./authoritative";
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
  simulation: {
    iterations: number;
    homeWin: number;
    draw: number;
    awayWin: number;
    agreement: number;
  };
  generatedAt: string;
};
export type ServerMatchAnalysis = AuthoritativeMatchAnalysis & { pipeline: AnalysisPipelineTrace };
const normalizeName = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bfootball club\b/g, "")
    .replace(/\b(afc|fc|cf|sc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
const sameTeam = (a: string, b: string) => normalizeName(a) === normalizeName(b);
const dateKey = (v: string) => {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return v;
  const y = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${y.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const prepare = (f: MatchRow, r: MatchRow[]) =>
  r
    .filter((x) => x.hg !== undefined && x.ag !== undefined && dateKey(x.date) < dateKey(f.date))
    .map((x) => ({
      ...x,
      home: sameTeam(x.home, f.home) ? f.home : sameTeam(x.home, f.away) ? f.away : x.home,
      away: sameTeam(x.away, f.home) ? f.home : sameTeam(x.away, f.away) ? f.away : x.away,
    }))
    .sort((a, b) =>
      `${dateKey(a.date)} ${a.time ?? ""}`.localeCompare(`${dateKey(b.date)} ${b.time ?? ""}`),
    );
const dedupe = (r: MatchRow[]) => {
  const s = new Set<string>();
  return r.filter((x) => {
    const id = `${dateKey(x.date)}|${normalizeName(x.home)}|${normalizeName(x.away)}|${x.hg ?? ""}|${x.ag ?? ""}`;
    if (s.has(id)) return false;
    s.add(id);
    return true;
  });
};
export function analyzeLoadedFixture(
  fixture: MatchRow,
  code: string,
  groups: FreeLeague[],
): ServerMatchAnalysis {
  const group =
      groups.find((g) => g.code === code) || groups.find((g) => g.league === fixture.league),
    target = prepare(fixture, group?.matches ?? []),
    all = dedupe(
      prepare(
        fixture,
        groups.flatMap((g) => g.matches),
      ),
    ),
    home = all.filter((x) => sameTeam(x.home, fixture.home) || sameTeam(x.away, fixture.home)),
    away = all.filter((x) => sameTeam(x.home, fixture.away) || sameTeam(x.away, fixture.away)),
    mode: AnalysisPipelineTrace["evidenceMode"] =
      Math.min(home.length, away.length) >= 8
        ? "TARGET_COMPETITION"
        : Math.min(home.length, away.length) >= 4
          ? "GLOBAL_CONTEXT"
          : "LIMITED";
  const result = analyzeActiveAuthoritatively({ ...fixture }, all),
    sim = simulationEngineOutput(result, 10000),
    engines = [...result.engines, sim.engine],
    generatedAt = new Date().toISOString();
  return {
    ...result,
    engines,
    pipeline: {
      fixtureId: [
        dateKey(fixture.date),
        normalizeName(fixture.home),
        normalizeName(fixture.away),
        fixture.time ?? "",
        fixture.source ?? "free",
        fixture.sourceId ?? "",
      ].join("|"),
      source: fixture.source ?? "free-data",
      competition: fixture.league ?? group?.league ?? "Worldwide Football",
      competitionsLoaded: groups.length,
      historicalRowsLoaded: all.length,
      targetCompetitionRows: target.length,
      homeRowsMatched: home.length,
      awayRowsMatched: away.length,
      homeSample: result.home.played,
      awaySample: result.away.played,
      h2hSample: result.engines.find((e) => e.id === "H2H")?.values.matches ?? 0,
      enginesRun: engines.map((e) => e.id),
      evidenceMode: mode,
      simulation: {
        iterations: sim.summary.iterations,
        homeWin: sim.summary.homeWin,
        draw: sim.summary.draw,
        awayWin: sim.summary.awayWin,
        agreement: sim.summary.scenarioAgreement,
      },
      generatedAt,
    },
  };
}
