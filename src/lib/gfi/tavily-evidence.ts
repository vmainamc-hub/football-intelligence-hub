import { canonicalTeamName, canonicalCompetitionName } from "./identity";
import type { MatchRow } from "./intelligence";

export type WebEvidenceFact = {
  provider: "tavily";
  sourceFamily: "web";
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  snippet: string;
  factType: "score" | "h2h" | "form" | "news";
  extractedAt: string;
  extractedDate?: string;
  scoreRow?: MatchRow;
};

export type WebEvidenceResult = {
  configured: boolean;
  attempted: boolean;
  searchesAttempted: number;
  resultsReturned: number;
  usefulFootballResults: number;
  structuredFacts: WebEvidenceFact[];
  datedScoreRows: MatchRow[];
  evidenceMerged: boolean;
  sources: string[];
  searchedAt: string;
  error?: string;
};

// Credit conservation: In-memory cache with 1-hour TTL for successes, 10-min for errors
const webEvidenceCache = new Map<string, { result: WebEvidenceResult; expiresAt: number }>();
const inFlightWebEvidence = new Map<string, Promise<WebEvidenceResult>>();

const CACHE_TTL_MS = 60 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 6_000;

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function extractYear(dateStr?: string): number {
  if (!dateStr) return new Date().getFullYear();
  const m = dateStr.match(/(\d{4})/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

function parseScoreFromText(
  text: string,
  homeTeam: string,
  awayTeam: string,
  defaultDate: string,
  url: string,
  league?: string,
): MatchRow[] {
  const rows: MatchRow[] = [];
  // Match patterns like "Team A 2-1 Team B", "Team A 2 : 0 Team B", "Team A (2) - (1) Team B"
  const scoreRegex = /(\d{1,2})\s*[-–:]\s*(\d{1,2})/g;
  const dateRegex =
    /\b(202\d[-/]\d{1,2}[-/]\d{1,2})\b|\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+202\d)\b/i;

  const boundedText = text.slice(0, 20_000);
  const lines = boundedText.split(/\n|\.\s+/).slice(0, 100);
  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = scoreRegex.exec(line)) !== null) {
      const hg = Number(match[1]);
      const ag = Number(match[2]);
      if (hg > 15 || ag > 15) continue; // Unlikely football score

      // Check if line mentions teams
      const lowerLine = line.toLowerCase();
      const normHome = homeTeam.toLowerCase().slice(0, 5);
      const normAway = awayTeam.toLowerCase().slice(0, 5);
      const mentionsHome = normHome && lowerLine.includes(normHome);
      const mentionsAway = normAway && lowerLine.includes(normAway);

      if (mentionsHome && mentionsAway) {
        const dateMatch = line.match(dateRegex);
        let rowDate = "";
        if (dateMatch) {
          const rawD = dateMatch[1] || dateMatch[2];
          const parsed = new Date(rawD);
          if (!Number.isNaN(parsed.getTime())) {
            rowDate = parsed.toISOString().slice(0, 10);
          }
        }

        // If no explicit date in line, default to previous day of defaultDate to guarantee historical
        if (!rowDate) {
          const d = new Date(defaultDate);
          d.setDate(d.getDate() - 1);
          rowDate = d.toISOString().slice(0, 10);
        }

        // Strictly historical results (strictly before fixture date)
        if (rowDate < defaultDate) {
          const homePos = normHome ? lowerLine.indexOf(normHome) : -1;
          const awayPos = normAway ? lowerLine.indexOf(normAway) : -1;
          const isHomeFirst = homePos !== -1 && awayPos !== -1 ? homePos < awayPos : true;

          const team1 = isHomeFirst ? homeTeam : awayTeam;
          const team2 = isHomeFirst ? awayTeam : homeTeam;

          rows.push({
            date: rowDate,
            home: canonicalTeamName(team1),
            away: canonicalTeamName(team2),
            hg,
            ag,
            result: hg > ag ? "H" : hg < ag ? "A" : "D",
            league: canonicalCompetitionName(league || "Worldwide Football"),
            source: "tavily-web",
            sourceId: url,
          });
        }
      }
    }
  }
  return rows;
}

/**
 * Checks if Tavily API key is available in the environment.
 * NEVER returns or logs the key value.
 */
export function isTavilyConfigured(): boolean {
  const key = typeof process !== "undefined" ? process.env.TAVILY_API_KEY : undefined;
  return Boolean(key && key.trim().length > 0);
}

/**
 * acquireWebEvidence:
 * Automatically called by the research orchestrator when internal evidence is sparse.
 * Queries Tavily, extracts structured facts and score rows, retains full source lineage,
 * and caches results to conserve credits.
 */
export async function acquireWebEvidence(params: {
  home: string;
  away: string;
  fixtureDate?: string;
  league?: string;
  forceSearch?: boolean;
}): Promise<WebEvidenceResult> {
  const apiKey = typeof process !== "undefined" ? process.env.TAVILY_API_KEY?.trim() : undefined;
  const searchedAt = new Date().toISOString();

  if (!apiKey) {
    return {
      configured: false,
      attempted: false,
      searchesAttempted: 0,
      resultsReturned: 0,
      usefulFootballResults: 0,
      structuredFacts: [],
      datedScoreRows: [],
      evidenceMerged: false,
      sources: [],
      searchedAt,
    };
  }

  const { home, away, fixtureDate, league, forceSearch } = params;
  if (!home || !away) {
    return {
      configured: true,
      attempted: false,
      searchesAttempted: 0,
      resultsReturned: 0,
      usefulFootballResults: 0,
      structuredFacts: [],
      datedScoreRows: [],
      evidenceMerged: false,
      sources: [],
      searchedAt,
    };
  }

  const dateStr = fixtureDate ? fixtureDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const cacheKey = `${dateStr}|${canonicalTeamName(home).toLowerCase()}|${canonicalTeamName(away).toLowerCase()}`;

  // Credit conservation: Return cached results if available
  if (!forceSearch) {
    const cached = webEvidenceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  // In-flight deduplication: prevent concurrent identical queries from triggering multiple Tavily requests
  const existingInFlight = inFlightWebEvidence.get(cacheKey);
  if (existingInFlight && !forceSearch) {
    return existingInFlight;
  }

  const task = executeTavilySearch({
    apiKey,
    home,
    away,
    fixtureDate,
    league,
    dateStr,
    cacheKey,
    searchedAt,
  });

  inFlightWebEvidence.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlightWebEvidence.delete(cacheKey);
  }
}

async function executeTavilySearch(params: {
  apiKey: string;
  home: string;
  away: string;
  fixtureDate?: string;
  league?: string;
  dateStr: string;
  cacheKey: string;
  searchedAt: string;
}): Promise<WebEvidenceResult> {
  const { apiKey, home, away, fixtureDate, league, dateStr, cacheKey, searchedAt } = params;
  const year = extractYear(fixtureDate);
  // Quality query: home, away, year, football context - no hardcoded country/league
  const query = `"${home}" vs "${away}" football match score results ${year}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const hardFallbackPromise = new Promise<WebEvidenceResult>((resolve) => {
    fallbackTimer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
      const timeoutResult: WebEvidenceResult = {
        configured: true,
        attempted: true,
        searchesAttempted: 1,
        resultsReturned: 0,
        usefulFootballResults: 0,
        structuredFacts: [],
        datedScoreRows: [],
        evidenceMerged: false,
        sources: [],
        searchedAt,
        error: `Tavily request timed out after ${REQUEST_TIMEOUT_MS}ms`,
      };
      webEvidenceCache.set(cacheKey, {
        result: timeoutResult,
        expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
      });
      resolve(timeoutResult);
    }, REQUEST_TIMEOUT_MS + 500);
  });

  const searchOperation = (async (): Promise<WebEvidenceResult> => {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const errResult: WebEvidenceResult = {
          configured: true,
          attempted: true,
          searchesAttempted: 1,
          resultsReturned: 0,
          usefulFootballResults: 0,
          structuredFacts: [],
          datedScoreRows: [],
          evidenceMerged: false,
          sources: [],
          searchedAt,
          error: `Tavily HTTP ${res.status}: ${errText.slice(0, 100)}`,
        };
        // Cache negative result for 10 minutes to prevent repeat failures
        webEvidenceCache.set(cacheKey, {
          result: errResult,
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
        });
        return errResult;
      }

      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
      };
      const rawResults = Array.isArray(data?.results) ? data.results.slice(0, 5) : [];

      const structuredFacts: WebEvidenceFact[] = [];
      const datedScoreRows: MatchRow[] = [];
      const sourcesSet = new Set<string>();

      for (const item of rawResults) {
        const url = item.url ?? "";
        const title = item.title ?? "";
        const content = item.content ?? "";
        const domain = getDomain(url);
        if (domain) sourcesSet.add(`web:${domain}`);

        const combinedText = `${title}\n${content}`.slice(0, 20_000);
        const isFootballRelevant =
          /football|soccer|score|match|vs|goal|league|cup|lineup|h2h|fc\b/i.test(combinedText);

        if (isFootballRelevant) {
          // Extract dated scores
          const parsedRows = parseScoreFromText(combinedText, home, away, dateStr, url, league);
          for (const row of parsedRows) {
            datedScoreRows.push(row);
          }

          const factType: WebEvidenceFact["factType"] =
            parsedRows.length > 0
              ? "score"
              : /h2h|head to head/i.test(combinedText)
                ? "h2h"
                : /form|win|draw|loss/i.test(combinedText)
                  ? "form"
                  : "news";

          structuredFacts.push({
            provider: "tavily",
            sourceFamily: "web",
            sourceUrl: url,
            sourceDomain: domain,
            title: title.slice(0, 200),
            snippet: content.slice(0, 280),
            factType,
            extractedAt: searchedAt,
            extractedDate: item.published_date,
            scoreRow: parsedRows[0],
          });
        }
      }

      const dedupeRows = (rows: MatchRow[]) => {
        const seen = new Set<string>();
        return rows.filter((r) => {
          const id = `${r.date}|${r.home}|${r.away}|${r.hg ?? ""}|${r.ag ?? ""}`;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      };

      const uniqueScores = dedupeRows(datedScoreRows);

      const result: WebEvidenceResult = {
        configured: true,
        attempted: true,
        searchesAttempted: 1,
        resultsReturned: rawResults.length,
        usefulFootballResults: structuredFacts.length,
        structuredFacts,
        datedScoreRows: uniqueScores,
        evidenceMerged: uniqueScores.length > 0 || structuredFacts.length > 0,
        sources: [...sourcesSet],
        searchedAt,
      };

      // Cache successful result for 1 hour
      webEvidenceCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const failResult: WebEvidenceResult = {
        configured: true,
        attempted: true,
        searchesAttempted: 1,
        resultsReturned: 0,
        usefulFootballResults: 0,
        structuredFacts: [],
        datedScoreRows: [],
        evidenceMerged: false,
        sources: [],
        searchedAt,
        error: message,
      };
      // Cache negative/error result for 10 minutes to prevent retry flood
      webEvidenceCache.set(cacheKey, {
        result: failResult,
        expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
      });
      return failResult;
    } finally {
      clearTimeout(timer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    }
  })();

  return Promise.race([searchOperation, hardFallbackPromise]);
}
