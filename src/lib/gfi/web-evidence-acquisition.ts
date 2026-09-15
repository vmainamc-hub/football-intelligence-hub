import type { MatchRow } from "./intelligence";

type SearchHit = { title: string; url: string; description?: string; age?: string };
export type WebEvidenceResult = {
  configured: boolean;
  attempted: boolean;
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

const SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const SEARCH_TIMEOUT_MS = 4500;
const PAGE_TIMEOUT_MS = 5000;
const MAX_QUERY_COUNT = 6;
const MAX_HITS_PER_QUERY = 5;
const MAX_PAGES = 10;
const MAX_PAGE_BYTES = 900_000;

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
const stripHtml = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
const timeoutFetch = async (url: string, init: RequestInit, ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

function buildQueries(home: string, away: string, date: string) {
  const base = `${home} ${away}`;
  return [
    `"${home}" "${away}" ${date}`,
    `"${home}" results form 2026`,
    `"${away}" results form 2026`,
    `"${home}" injuries lineup team news ${date}`,
    `"${away}" injuries lineup team news ${date}`,
    `"${home}" "${away}" preview odds xG ${date}`,
  ].slice(0, MAX_QUERY_COUNT);
}

function extractRows(text: string, home: string, away: string): MatchRow[] {
  const rows: MatchRow[] = [];
  const lines = text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const teamNames = [home, away];
  const dateRe = /(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/;
  const scoreRe = /\b([0-9]{1,2})\s*[-–:]\s*([0-9]{1,2})\b/;
  for (const line of lines) {
    const lower = norm(line);
    const dateMatch = line.match(dateRe);
    const score = line.match(scoreRe);
    if (!dateMatch || !score) continue;
    const hasHome = lower.includes(norm(home)), hasAway = lower.includes(norm(away));
    if (!hasHome && !hasAway) continue;
    const iso = dateMatch[1].replace(/[/.]/g, "-").split("-").map((v,i)=>i===1||i===2?v.padStart(2,"0"):v).join("-");
    const hg = Number(score[1]), ag = Number(score[2]);
    if (hg > 20 || ag > 20) continue;
    const inferredHome = hasHome && (!hasAway || lower.indexOf(norm(home)) <= lower.indexOf(norm(away))) ? home : away;
    const inferredAway = inferredHome === home ? (hasAway ? away : "") : (hasHome ? home : "");
    if (!inferredAway) continue;
    const result = hg === ag ? "D" : hg > ag ? "H" : "A";
    rows.push({ date: iso, home: inferredHome, away: inferredAway, hg, ag, result, source: "web-search-extracted", sourceId: line.slice(0, 180) });
  }
  return rows.slice(0, 40);
}

export async function acquireWebEvidence(home: string, away: string, date: string): Promise<WebEvidenceResult> {
  const key = process.env.BRAVE_SEARCH_API_KEY || process.env.WEB_SEARCH_API_KEY || "";
  const empty = (configured = !!key): WebEvidenceResult => ({ configured, attempted: !!key, queries: [], hits: 0, relevantHits: 0, fetchedPages: 0, extractedRows: [], sources: [], sourceFamilies: [], facts: [], errors: [] });
  if (!key) return empty(false);

  const queries = buildQueries(home, away, date);
  const errors: string[] = [];
  const allHits: SearchHit[] = [];
  for (const q of queries) {
    try {
      const url = `${SEARCH_URL}?${new URLSearchParams({ q, count: String(MAX_HITS_PER_QUERY), country: "CZ", search_lang: "en", extra_snippets: "true", safesearch: "moderate" })}`;
      const response = await timeoutFetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key } }, SEARCH_TIMEOUT_MS);
      if (!response.ok) { errors.push(`search ${response.status}`); continue; }
      const json = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } };
      for (const r of json.web?.results ?? []) if (r.url && r.title) allHits.push({ title: r.title, url: canonical(r.url), description: r.description, age: r.age });
    } catch (error) { errors.push(`search ${error instanceof Error ? error.message : "failed"}`); }
  }

  const unique = [...new Map(allHits.map(h => [h.url, h])).values()];
  const relevantHits = unique.filter(h => relevant(`${h.title} ${h.description ?? ""}`, home, away));
  const pages = relevantHits.slice(0, MAX_PAGES);
  const rows: MatchRow[] = [];
  const facts: WebEvidenceResult["facts"] = [];
  const sources = new Set<string>();
  const families = new Set<string>();

  for (const hit of pages) {
    sources.add(hit.url); families.add(hostOf(hit.url));
    const seed = `${hit.title}. ${hit.description ?? ""}`;
    const textParts = [seed];
    try {
      const response = await timeoutFetch(hit.url, { headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.1", "User-Agent": "GlobalFootballIntelligence/1.0 evidence-fetch" } }, PAGE_TIMEOUT_MS);
      if (response.ok) {
        const reader = response.body?.getReader();
        if (reader) {
          let total = 0, chunks = "";
          while (total < MAX_PAGE_BYTES) {
            const part = await reader.read(); if (part.done) break;
            total += part.value.byteLength;
            chunks += new TextDecoder().decode(part.value, { stream: true });
            if (total >= MAX_PAGE_BYTES) break;
          }
          textParts.push(stripHtml(chunks));
        } else textParts.push(stripHtml(await response.text()).slice(0, MAX_PAGE_BYTES));
      }
    } catch { /* search result remains usable as a bounded snippet */ }
    const text = textParts.join(" ");
    const extracted = extractRows(text, home, away);
    for (const row of extracted) rows.push(row);
    if (relevant(text, home, away)) facts.push({ type: "WEB_SOURCE", text: `${hit.title}: ${(hit.description ?? "").slice(0, 300)}`, url: hit.url, confidence: extracted.length ? 0.8 : 0.55 });
  }

  const dedupRows = [...new Map(rows.map(r => [`${r.date}|${norm(r.home)}|${norm(r.away)}|${r.hg}|${r.ag}`, r])).values()];
  return { configured: true, attempted: true, queries, hits: unique.length, relevantHits: relevantHits.length, fetchedPages: pages.length, extractedRows: dedupRows, sources: [...sources], sourceFamilies: [...families], facts: facts.slice(0, 40), errors };
}
