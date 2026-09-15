import type { MatchRow } from "./intelligence";

type SearchHit = { title: string; url: string; content?: string; publishedDate?: string; score?: number };
export type WebEvidenceResult = {
  configured: boolean;
  attempted: boolean;
  provider: "tavily" | "none";
  queries: string[];
  hits: number;
  relevantHits: number;
  fetchedPages: number;
  extractedRows: MatchRow[];
  sources: string[];
  sourceFamilies: string[];
  facts: Array<{ type: string; text: string; url: string; confidence: number }>;
  errors: string[];
};

const SEARCH_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 7000;
const MAX_QUERY_COUNT = 6;
const MAX_RESULTS_PER_QUERY = 5;
const MAX_RELEVANT_RESULTS = 12;
const MAX_CONTENT_CHARS = 12_000;

const canonical = (url: string) => {
  try {
    const u = new URL(url);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"].forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch { return url; }
};
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; } };
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const relevant = (text: string, home: string, away: string) => {
  const t = norm(text), h = norm(home), a = norm(away);
  return !!h && !!a && ((t.includes(h) && t.includes(a)) || t.includes(h) || t.includes(a));
};
const timeoutFetch = async (url: string, init: RequestInit, ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

function buildQueries(home: string, away: string, date: string) {
  const year = date.slice(0, 4);
  return [
    `"${home}" "${away}" ${date}`,
    `"${home}" results form ${year}`,
    `"${away}" results form ${year}`,
    `"${home}" injuries lineup team news ${date}`,
    `"${away}" injuries lineup team news ${date}`,
    `"${home}" "${away}" preview odds xG ${date}`,
  ].slice(0, MAX_QUERY_COUNT);
}

function extractRows(text: string, home: string, away: string, publishedDate?: string): MatchRow[] {
  const rows: MatchRow[] = [];
  const lines = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const dateRe = /(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/;
  const scoreRe = /\b([0-9]{1,2})\s*[-–:]\s*([0-9]{1,2})\b/;
  for (const line of lines) {
    const lower = norm(line);
    const dateMatch = line.match(dateRe);
    const score = line.match(scoreRe);
    if (!dateMatch || !score) continue;
    const hasHome = lower.includes(norm(home)), hasAway = lower.includes(norm(away));
    if (!hasHome && !hasAway) continue;
    const iso = dateMatch[1].replace(/[/.]/g, "-").split("-").map((v, i) => i === 1 || i === 2 ? v.padStart(2, "0") : v).join("-");
    const hg = Number(score[1]), ag = Number(score[2]);
    if (hg > 20 || ag > 20) continue;
    const inferredHome = hasHome && (!hasAway || lower.indexOf(norm(home)) <= lower.indexOf(norm(away))) ? home : away;
    const inferredAway = inferredHome === home ? (hasAway ? away : "") : (hasHome ? home : "");
    if (!inferredAway) continue;
    const result = hg === ag ? "D" : hg > ag ? "H" : "A";
    rows.push({ date: iso, home: inferredHome, away: inferredAway, hg, ag, result, source: "tavily-web-search", sourceId: line.slice(0, 180) });
  }
  // Search snippets sometimes carry a publication date but not an ISO date in the prose.
  // Do not invent a match date from it; only explicitly dated score rows enter the model.
  void publishedDate;
  return rows.slice(0, 40);
}

export async function acquireWebEvidence(home: string, away: string, date: string): Promise<WebEvidenceResult> {
  const key = process.env.TAVILY_API_KEY || process.env.WEB_SEARCH_API_KEY || "";
  const empty = (configured = !!key): WebEvidenceResult => ({ configured, attempted: !!key, provider: key ? "tavily" : "none", queries: [], hits: 0, relevantHits: 0, fetchedPages: 0, extractedRows: [], sources: [], sourceFamilies: [], facts: [], errors: [] });
  if (!key) return empty(false);

  const queries = buildQueries(home, away, date);
  const errors: string[] = [];
  const allHits: SearchHit[] = [];
  for (const q of queries) {
    try {
      const response = await timeoutFetch(SEARCH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, query: q, search_depth: "basic", max_results: MAX_RESULTS_PER_QUERY, include_answer: false, include_raw_content: false, include_images: false }),
      }, SEARCH_TIMEOUT_MS);
      if (!response.ok) { errors.push(`search ${response.status}`); continue; }
      const json = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string; score?: number }> };
      for (const r of json.results ?? []) if (r.url && r.title) allHits.push({ title: r.title, url: canonical(r.url), content: r.content, publishedDate: r.published_date, score: r.score });
    } catch (error) { errors.push(`search ${error instanceof Error ? error.message : "failed"}`); }
  }

  const unique = [...new Map(allHits.map(h => [h.url, h])).values()];
  const relevantHits = unique.filter(h => relevant(`${h.title} ${h.content ?? ""}`, home, away));
  const pages = relevantHits
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_RELEVANT_RESULTS);
  const rows: MatchRow[] = [];
  const facts: WebEvidenceResult["facts"] = [];
  const sources = new Set<string>();
  const families = new Set<string>();

  for (const hit of pages) {
    sources.add(hit.url);
    families.add(hostOf(hit.url));
    const text = `${hit.title}. ${hit.content ?? ""}`.slice(0, MAX_CONTENT_CHARS);
    const extracted = extractRows(text, home, away, hit.publishedDate);
    for (const row of extracted) rows.push(row);
    if (relevant(text, home, away)) {
      facts.push({
        type: "WEB_SOURCE",
        text: `${hit.title}: ${(hit.content ?? "").slice(0, 500)}`,
        url: hit.url,
        confidence: extracted.length ? 0.8 : 0.55,
      });
    }
  }

  const dedupRows = [...new Map(rows.map(r => [`${r.date}|${norm(r.home)}|${norm(r.away)}|${r.hg}|${r.ag}`, r])).values()];
  return { configured: true, attempted: true, provider: "tavily", queries, hits: unique.length, relevantHits: relevantHits.length, fetchedPages: pages.length, extractedRows: dedupRows, sources: [...sources], sourceFamilies: [...families], facts: facts.slice(0, 40), errors };
}
