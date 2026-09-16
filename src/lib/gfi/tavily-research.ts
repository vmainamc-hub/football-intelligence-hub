import { canonicalTeamName, canonicalCompetitionName } from "./identity";
import type { MatchRow } from "./intelligence";
import type { WebEvidenceFact, WebEvidenceResult } from "./tavily-evidence";

const cache = new Map<string, { result: WebEvidenceResult; expiresAt: number }>();
const TTL = 60 * 60_000;
const TIMEOUT = 10_000;

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "web"; } };

function parseDate(text: string, fixtureDate: string) {
  const m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const n = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (n) { const d = new Date(`${n[1]} ${n[2]} ${n[3]} UTC`); if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10); }
  return "";
}

function parseTeamRows(text: string, team: string, fixtureDate: string, url: string, league?: string): MatchRow[] {
  const tn = norm(team), rows: MatchRow[] = [];
  if (!tn) return rows;
  const score = /(\d{1,2})\s*[-–:]\s*(\d{1,2})/g;
  for (const raw of text.slice(0, 50000).split(/\n|(?<=[.!?])\s+/).slice(0, 500)) {
    const line = raw.replace(/\s+/g, " ").trim(), nl = norm(line);
    if (!nl.includes(tn)) continue;
    score.lastIndex = 0;
    const m = score.exec(line);
    if (!m) continue;
    const hg = Number(m[1]), ag = Number(m[2]);
    if (hg > 15 || ag > 15) continue;
    const before = line.slice(0, m.index).trim(), after = line.slice(m.index + m[0].length).trim();
    const targetBefore = nl.indexOf(tn) < norm(before).length;
    const opponent = (targetBefore ? after : before).replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").slice(0, 80).trim();
    const date = parseDate(line, fixtureDate);
    if (!opponent || opponent.toLowerCase() === team.toLowerCase() || !date || date >= fixtureDate) continue;
    rows.push({
      date, home: canonicalTeamName(targetBefore ? team : opponent), away: canonicalTeamName(targetBefore ? opponent : team),
      hg: targetBefore ? hg : ag, ag: targetBefore ? ag : hg,
      result: targetBefore ? (hg > ag ? "H" : hg < ag ? "A" : "D") : (hg > ag ? "A" : hg < ag ? "H" : "D"),
      league: canonicalCompetitionName(league || "Worldwide Football"), source: "tavily-web", sourceId: url,
    });
  }
  return rows;
}

const dedupe = (rows: MatchRow[]) => {
  const seen = new Set<string>();
  return rows.filter(r => { const k = `${r.date}|${r.home}|${r.away}|${r.hg}|${r.ag}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

export async function acquireExpandedWebEvidence(params: { home: string; away: string; fixtureDate?: string; league?: string }): Promise<WebEvidenceResult> {
  const key = process.env.TAVILY_API_KEY?.trim(), searchedAt = new Date().toISOString();
  if (!key) return { configured: false, attempted: false, searchesAttempted: 0, resultsReturned: 0, usefulFootballResults: 0, structuredFacts: [], datedScoreRows: [], evidenceMerged: false, sources: [], searchedAt };
  const date = params.fixtureDate?.slice(0, 10) || searchedAt.slice(0, 10), cacheKey = `${date}|${norm(params.home)}|${norm(params.away)}`;
  const hit = cache.get(cacheKey); if (hit && hit.expiresAt > Date.now()) return hit.result;
  const year = date.slice(0, 4);
  const queries = [
    `"${params.home}" recent football results ${year}`,
    `"${params.away}" recent football results ${year}`,
    `"${params.home}" "${params.away}" head to head football results`,
    `"${params.home}" "${params.away}" football preview form injuries news ${year}`,
  ];
  const resultSets = await Promise.all(queries.map(async query => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const r = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 6, include_answer: false, include_raw_content: true }), signal: controller.signal });
      if (!r.ok) return [];
      const body = await r.json() as { results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string; published_date?: string }> };
      return body.results || [];
    } catch { return []; } finally { clearTimeout(timer); }
  }));
  const facts: WebEvidenceFact[] = [], rows: MatchRow[] = [], sources = new Set<string>(), seenFacts = new Set<string>();
  for (const item of resultSets.flat()) {
    if (!item.url) continue;
    const text = `${item.title || ""}\n${item.content || ""}\n${item.raw_content || ""}`;
    if (!/football|soccer|match|result|score|league|cup|goal|form|lineup|injur/i.test(text)) continue;
    const d = domain(item.url); sources.add(`web:${d}`);
    const parsed = dedupe([...parseTeamRows(text, params.home, date, item.url, params.league), ...parseTeamRows(text, params.away, date, item.url, params.league)]);
    rows.push(...parsed);
    const fk = `${item.url}|${item.title || ""}`;
    if (!seenFacts.has(fk)) { seenFacts.add(fk); facts.push({ provider: "tavily", sourceFamily: "web", sourceUrl: item.url, sourceDomain: d, title: (item.title || "Tavily football source").slice(0, 200), snippet: (item.content || item.raw_content || "").slice(0, 400), factType: parsed.length ? "score" : /h2h|head.?to.?head/i.test(text) ? "h2h" : /form|win|draw|loss/i.test(text) ? "form" : "news", extractedAt: searchedAt, extractedDate: item.published_date, scoreRow: parsed[0] }); }
  }
  const unique = dedupe(rows);
  const result: WebEvidenceResult = { configured: true, attempted: true, searchesAttempted: queries.length, resultsReturned: resultSets.flat().length, usefulFootballResults: facts.length, structuredFacts: facts, datedScoreRows: unique, evidenceMerged: unique.length > 0 || facts.length > 0, sources: [...sources], searchedAt };
  cache.set(cacheKey, { result, expiresAt: Date.now() + TTL });
  return result;
}
