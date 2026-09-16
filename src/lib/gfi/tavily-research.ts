import { canonicalTeamName, canonicalCompetitionName, sameTeamIdentity } from "./identity";
import type { MatchRow } from "./intelligence";
import type { WebEvidenceFact, WebEvidenceResult } from "./tavily-evidence";

const cache = new Map<string, { result: WebEvidenceResult; expiresAt: number }>();
const TTL = 30 * 60_000;
const TIMEOUT = 15_000;
const SEARCH_VERSION = "tavily-research-v3";

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "web"; } };
const addDays = (value: string, days: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

function parseDate(text: string, fixtureDate: string) {
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const named = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (named) { const d = new Date(`${named[1]} ${named[2]} ${named[3]} UTC`); if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  const us = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (us) { const d = new Date(`${us[3]}-${us[2]}-${us[1]}T12:00:00Z`); if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  return "";
}

function cleanOpponent(value: string, target: string) {
  let text = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:FT|AET|HT|FINAL|RESULT|FULL.?TIME|PEN(?:ALTY)?S?)\b/gi, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}\b/gi, " ")
    .replace(/[|•·]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .trim();
  if (!text || sameTeamIdentity(text, target)) return "";
  if (text.length > 90) text = text.slice(0, 90).trim();
  return text;
}

function extractRows(text: string, targetTeam: string, fixtureDate: string, url: string, league?: string): MatchRow[] {
  const rows: MatchRow[] = [];
  const targetNorm = norm(targetTeam);
  if (!targetNorm) return rows;
  const rawLines = text.slice(0, 100_000).split(/\r?\n/).map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 1200);
  const scoreRegex = /(\d{1,2})\s*(?:[-–:]|\s+[-–]\s+)\s*(\d{1,2})/g;
  const seen = new Set<string>();

  for (let i = 0; i < rawLines.length; i++) {
    for (let radius = 0; radius <= 2; radius++) {
      const start = Math.max(0, i - radius), end = Math.min(rawLines.length, i + radius + 1);
      const line = rawLines.slice(start, end).join(" | ");
      const nl = norm(line);
      if (!nl.includes(targetNorm)) continue;
      scoreRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = scoreRegex.exec(line)) !== null) {
        const hg = Number(match[1]), ag = Number(match[2]);
        if (hg > 15 || ag > 15) continue;
        const before = line.slice(0, match.index);
        const after = line.slice(match.index + match[0].length);
        const targetPos = nl.indexOf(targetNorm);
        const scorePos = norm(line.slice(0, match.index)).length;
        const targetBefore = targetPos >= 0 && targetPos < scorePos;
        const opponent = cleanOpponent(targetBefore ? after : before, targetTeam);
        if (!opponent) continue;

        // Prefer an explicit date in the score row/window. Do not use Tavily's publication date as match date.
        const date = parseDate(line, fixtureDate);
        if (!date || date >= fixtureDate) continue;
        const home = targetBefore ? targetTeam : opponent;
        const away = targetBefore ? opponent : targetTeam;
        const row: MatchRow = {
          date,
          home: canonicalTeamName(home),
          away: canonicalTeamName(away),
          hg: targetBefore ? hg : ag,
          ag: targetBefore ? ag : hg,
          result: targetBefore ? (hg > ag ? "H" : hg < ag ? "A" : "D") : (hg > ag ? "A" : hg < ag ? "H" : "D"),
          league: canonicalCompetitionName(league || "Worldwide Football"),
          source: "tavily-web",
          sourceId: url,
        };
        const key = `${row.date}|${norm(row.home)}|${norm(row.away)}|${row.hg}|${row.ag}`;
        if (!seen.has(key)) { seen.add(key); rows.push(row); }
      }
      if (rows.length) break;
    }
  }
  return rows;
}

const dedupe = (rows: MatchRow[]) => {
  const seen = new Set<string>();
  return rows.filter(r => { const k = `${r.date}|${norm(r.home)}|${norm(r.away)}|${r.hg}|${r.ag}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

export async function acquireExpandedWebEvidence(params: { home: string; away: string; fixtureDate?: string; league?: string }): Promise<WebEvidenceResult> {
  const key = process.env.TAVILY_API_KEY?.trim(), searchedAt = new Date().toISOString();
  if (!key) return { configured: false, attempted: false, searchesAttempted: 0, resultsReturned: 0, usefulFootballResults: 0, structuredFacts: [], datedScoreRows: [], evidenceMerged: false, sources: [], searchedAt };
  const date = params.fixtureDate?.slice(0, 10) || searchedAt.slice(0, 10);
  const cacheKey = `${SEARCH_VERSION}|${date}|${norm(params.home)}|${norm(params.away)}|${norm(params.league || "")}`;
  const hit = cache.get(cacheKey); if (hit && hit.expiresAt > Date.now()) return hit.result;
  const year = date.slice(0, 4);
  const from = addDays(date, -120);
  const queries = [
    `"${params.home}" football results ${from} ${date}`,
    `"${params.away}" football results ${from} ${date}`,
    `"${params.home}" home results football ${year}`,
    `"${params.away}" away results football ${year}`,
    `"${params.home}" "${params.away}" head to head football results`,
    `"${params.home}" "${params.away}" match preview form statistics ${year}`,
    `"${params.home}" "${params.away}" injuries lineup news football ${year}`,
    `"${params.home}" "${params.away}" score result ${year} football`,
  ];

  const resultSets = await Promise.all(queries.map(async query => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 8, include_answer: false, include_raw_content: true }),
        signal: controller.signal,
      });
      if (!r.ok) return [];
      const body = await r.json() as { results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string; published_date?: string }> };
      return Array.isArray(body.results) ? body.results : [];
    } catch { return []; } finally { clearTimeout(timer); }
  }));

  const facts: WebEvidenceFact[] = [], rows: MatchRow[] = [], sources = new Set<string>(), seenFacts = new Set<string>();
  for (const item of resultSets.flat()) {
    if (!item.url) continue;
    const text = `${item.title || ""}\n${item.content || ""}\n${item.raw_content || ""}`.slice(0, 100_000);
    if (!/football|soccer|match|result|score|league|cup|goal|form|lineup|injur|fixture/i.test(text)) continue;
    const d = domain(item.url); sources.add(`web:${d}`);
    const parsed = dedupe([
      ...extractRows(text, params.home, date, item.url, params.league),
      ...extractRows(text, params.away, date, item.url, params.league),
    ]);
    rows.push(...parsed);
    const fk = `${item.url}|${item.title || ""}`;
    if (!seenFacts.has(fk)) {
      seenFacts.add(fk);
      facts.push({
        provider: "tavily",
        sourceFamily: "web",
        sourceUrl: item.url,
        sourceDomain: d,
        title: (item.title || "Tavily football source").slice(0, 200),
        snippet: (item.content || item.raw_content || "").slice(0, 500),
        factType: parsed.length ? "score" : /h2h|head.?to.?head/i.test(text) ? "h2h" : /form|win|draw|loss/i.test(text) ? "form" : "news",
        extractedAt: searchedAt,
        extractedDate: item.published_date,
        scoreRow: parsed[0],
      });
    }
  }

  const unique = dedupe(rows);
  const result: WebEvidenceResult = {
    configured: true,
    attempted: true,
    searchesAttempted: queries.length,
    resultsReturned: resultSets.flat().length,
    usefulFootballResults: facts.length,
    structuredFacts: facts,
    datedScoreRows: unique,
    evidenceMerged: unique.length > 0 || facts.length > 0,
    sources: [...sources],
    searchedAt,
  };
  cache.set(cacheKey, { result, expiresAt: Date.now() + TTL });
  return result;
}
