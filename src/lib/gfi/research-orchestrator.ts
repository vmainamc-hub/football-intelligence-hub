import { createServerFn } from "@tanstack/react-start";
import { reservoirHistoricalContext, type ReservoirMatch } from "./data-reservoir";
import { queryUniversalFixtures } from "./universal-sources";
import { fetchEspnFixtures } from "./espn-sources";
import { acquireExpandedWebEvidence, type WebEvidenceResult } from "./tavily-research";
import { sameTeamIdentity } from "./identity";
import type { MatchRow } from "./intelligence";

export { acquireExpandedWebEvidence, type WebEvidenceResult } from "./tavily-research";

export type ResearchResult = {
  query: string;
  matches: MatchRow[];
  reservoirMatches: number;
  liveMatches: number;
  webMatches: number;
  distinctSources: number;
  sources: string[];
  coverage: number;
  searchedAt: string;
  webEvidence?: WebEvidenceResult;
};
const identity = (r: MatchRow) => `${r.date}|${r.home.toLowerCase()}|${r.away.toLowerCase()}|${r.time ?? ""}|${r.hg ?? ""}|${r.ag ?? ""}`;
const toMatch = (r: ReservoirMatch): MatchRow => ({ date: r.date, time: r.time, home: r.home, away: r.away, hg: r.hg, ag: r.ag, result: r.result, league: r.league, code: r.code, source: r.source, sourceId: r.reservoirId });
const addDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateFromQuery = (q: string) => q.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
const stripDate = (q: string) => q.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
const parseTeams = (q: string) => { const clean = stripDate(q), m = clean.match(/^(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+)$/i); return m ? { home: m[1].trim(), away: m[2].trim() } : { home: clean, away: "" }; };

export async function performFixtureResearchInternal(queryRaw: string): Promise<ResearchResult> {
  const query = queryRaw.trim(), searchedAt = new Date().toISOString();
  if (!query) return { query, matches: [], reservoirMatches: 0, liveMatches: 0, webMatches: 0, distinctSources: 0, sources: [], coverage: 0, searchedAt };
  const { home, away } = parseTeams(query), fixtureDate = dateFromQuery(query), today = new Date().toISOString().slice(0, 10), from = fixtureDate ? addDays(fixtureDate, -7) : addDays(today, -7), to = fixtureDate ? addDays(fixtureDate, 1) : addDays(today, 1);
  const [stored, live, espn] = await Promise.all([
    reservoirHistoricalContext(home, away, 500).catch(() => [] as ReservoirMatch[]),
    queryUniversalFixtures(stripDate(query)).catch(() => [] as MatchRow[]),
    fetchEspnFixtures(from, to).catch(() => [] as MatchRow[]),
  ]);
  const merged = new Map<string, MatchRow>();
  for (const r of stored) { const m = toMatch(r); merged.set(identity(m), m); }
  for (const r of live) merged.set(identity(r), r);
  for (const r of espn) {
    if (r.hg === undefined || r.ag === undefined) continue;
    const exact = sameTeamIdentity(r.home, home) && sameTeamIdentity(r.away, away);
    const reverse = sameTeamIdentity(r.home, away) && sameTeamIdentity(r.away, home);
    if (exact || reverse) merged.set(identity(r), r);
  }

  const historical = () => [...merged.values()].filter(r => r.hg !== undefined && r.ag !== undefined && (!fixtureDate || r.date < fixtureDate));
  const homeEvidence = () => historical().filter(r => sameTeamIdentity(r.home, home) || sameTeamIdentity(r.away, home)).length;
  const awayEvidence = () => historical().filter(r => sameTeamIdentity(r.home, away) || sameTeamIdentity(r.away, away)).length;
  const h2hEvidence = () => historical().filter(r => (sameTeamIdentity(r.home, home) && sameTeamIdentity(r.away, away)) || (sameTeamIdentity(r.home, away) && sameTeamIdentity(r.away, home))).length;

  let webEvidence: WebEvidenceResult | undefined;
  let webMatches = 0;
  // Never use the size of the global reservoir to decide whether web research is needed.
  // A database containing 575 unrelated rows is still a zero-evidence fixture.
  const needsInternetResearch = Boolean(home && away && (homeEvidence() < 8 || awayEvidence() < 8 || h2hEvidence() < 2));
  if (needsInternetResearch) {
    try {
      webEvidence = await acquireExpandedWebEvidence({ home, away, fixtureDate, league: undefined });
      for (const r of webEvidence.datedScoreRows) {
        const key = identity(r);
        if (!merged.has(key)) { merged.set(key, r); webMatches++; }
      }
    } catch (error) {
      console.warn("[research] expanded Tavily acquisition failed", error);
    }
  }

  const matches = [...merged.values()].sort((a, b) => `${a.date}|${a.time ?? ""}`.localeCompare(`${b.date}|${b.time ?? ""}`));
  const sources = [...new Set([...matches.map(r => r.source ?? "unknown"), ...(webEvidence?.sources ?? [])])];
  const history = matches.filter(r => r.hg !== undefined && r.ag !== undefined).length;
  const fixtureEvidence = matches.some(r => fixtureDate ? r.date === fixtureDate : r.hg === undefined || r.ag === undefined);
  const coverage = Math.min(100, Math.round(Math.min(50, history * 2) + (fixtureEvidence ? 20 : 0) + (sources.length >= 2 ? 20 : 0) + (history > 10 ? 10 : 0)));
  return { query, matches, reservoirMatches: stored.length, liveMatches: live.length + espn.filter(r => { return (sameTeamIdentity(r.home, home) && sameTeamIdentity(r.away, away)) || (sameTeamIdentity(r.home, away) && sameTeamIdentity(r.away, home)); }).length, webMatches, distinctSources: sources.length, sources, coverage, searchedAt, webEvidence };
}

export const researchFixture = createServerFn({ method: "GET" }).validator((input: { query: string }) => input).handler(async ({ data }): Promise<ResearchResult> => performFixtureResearchInternal(data.query));
export async function researchTeamOrFixture(query: string) { return typeof window !== "undefined" ? researchFixture({ data: { query } }) : performFixtureResearchInternal(query); }
