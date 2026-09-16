import { createServerFn } from "@tanstack/react-start";
import type { MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamName } from "./identity";

type Source = { name: string; url: string; region: string; priority: number };
const GH = "https://api.github.com",
  RAW = "https://raw.githubusercontent.com/openfootball";
const EXCLUDED = new Set([
  "awesome-football",
  "openfootball.github.io",
  "quick-starter",
  "sandbox",
  "spec",
  "v0-format",
  "opendata-theme",
]);
const DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
let discoveryCache: { at: number; sources: Source[] } | null = null;

async function getJson(url: string) {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), 12000);
  try {
    const token = typeof process !== "undefined" ? process.env.GITHUB_TOKEN : "";
    const r = await fetch(url, {
      signal: c.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Global-Football-Intelligence/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function discoverInternal(): Promise<Source[]> {
  if (discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS)
    return discoveryCache.sources;
  const repos = (await getJson(`${GH}/orgs/openfootball/repos?per_page=100&sort=updated`)) as any[];
  const out: Source[] = [];
  for (const repo of repos) {
    const name = String(repo.name ?? "");
    if (!name || EXCLUDED.has(name) || repo.archived) continue;
    const tree = await getJson(
      `${GH}/repos/openfootball/${name}/git/trees/${repo.default_branch ?? "master"}?recursive=1`,
    ).catch(() => null);
    for (const f of (tree?.tree ?? [])
      .filter((x: any) => x.type === "blob" && /\.(json|txt)$/i.test(String(x.path ?? "")))
      .slice(0, 500)) {
      const path = String(f.path ?? "");
      if (!path) continue;
      out.push({
        name: `openfootball/${name}:${path}`,
        url: `${RAW}/${name}/${repo.default_branch ?? "master"}/${path}`,
        region: name,
        priority: name === "world" ? 1 : 2,
      });
    }
  }
  const sources = out.sort((a, b) => a.priority - b.priority).slice(0, 10000);
  discoveryCache = { at: Date.now(), sources };
  return sources;
}

export const discoverOpenFootballUniverse = createServerFn({ method: "GET" }).handler(
  async (): Promise<Source[]> => discoverInternal(),
);

function parse(payload: any, source: string): MatchRow[] {
  const arr = Array.isArray(payload?.matches)
    ? payload.matches
    : Array.isArray(payload)
      ? payload
      : [];
  return arr.flatMap((x: any, i: number) => {
    const date = String(x?.date ?? "").slice(0, 10),
      home = String(x?.team1 ?? x?.home ?? "").trim(),
      away = String(x?.team2 ?? x?.away ?? "").trim();
    if (!date || !home || !away) return [];
    const ft = Array.isArray(x?.score?.ft) ? x.score.ft : [],
      hg = ft[0] == null ? undefined : Number(ft[0]),
      ag = ft[1] == null ? undefined : Number(ft[1]);
    return [
      {
        date,
        time: typeof x?.time === "string" ? x.time.slice(0, 5) : undefined,
        home: canonicalTeamName(home),
        away: canonicalTeamName(away),
        hg: Number.isFinite(hg) ? hg : undefined,
        ag: Number.isFinite(ag) ? ag : undefined,
        result:
          Number.isFinite(hg) && Number.isFinite(ag)
            ? hg! > ag!
              ? "H"
              : hg === ag
                ? "D"
                : "A"
            : undefined,
        league: canonicalCompetitionName(String(payload?.name ?? source)),
        source: "openfootball",
        sourceId: `${source}#${i}`,
      },
    ];
  });
}

async function fetchSource(source: Source) {
  try {
    const r = await fetch(source.url, { headers: { Accept: "application/json,text/plain,*/*" } });
    if (!r.ok) return [] as MatchRow[];
    const text = await r.text();
    try {
      return parse(JSON.parse(text), source.name);
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

export const harvestOpenFootballUniverse = createServerFn({ method: "POST" })
  .validator((input: { limit?: number; offset?: number }) => input)
  .handler(async ({ data }) => {
    const sources = await discoverInternal();
    const limit = Math.max(10, Math.min(data.limit ?? 120, 250));
    const offset = Math.max(0, Math.min(data.offset ?? 0, Math.max(0, sources.length - 1)));
    const sample = sources.slice(offset, offset + limit);
    const rows: MatchRow[] = [];
    for (const source of sample) rows.push(...(await fetchSource(source)));
    return {
      sourcesDiscovered: sources.length,
      sourcesSampled: sample.length,
      offset,
      nextOffset: offset + sample.length < sources.length ? offset + sample.length : null,
      matches: rows,
      distinctTeams: new Set(rows.flatMap((r) => [r.home, r.away])).size,
      distinctCompetitions: new Set(rows.map((r) => r.league ?? "Worldwide Football")).size,
    };
  });
