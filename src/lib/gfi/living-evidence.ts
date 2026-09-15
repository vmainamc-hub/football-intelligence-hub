import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MatchRow } from "./intelligence";
import { canonicalTeamKey, canonicalTeamName } from "./identity";

function env(name: string) {
  return typeof process === "undefined" ? "" : process.env[name] ?? "";
}

function client(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function dateKey(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return value.slice(0, 10);
  const year = match[3].length === 2 ? Number(match[3]) + 2000 : Number(match[3]);
  return `${String(year).padStart(4, "0")}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function rowKey(row: MatchRow) {
  return `${dateKey(row.date)}|${canonicalTeamKey(row.home)}|${canonicalTeamKey(row.away)}|${row.hg ?? ""}|${row.ag ?? ""}`;
}

function toMatchRow(value: unknown): MatchRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.date !== "string" || typeof row.home !== "string" || typeof row.away !== "string") return null;
  const hg = typeof row.hg === "number" ? row.hg : Number.isFinite(Number(row.hg)) && row.hg !== "" && row.hg !== null ? Number(row.hg) : undefined;
  const ag = typeof row.ag === "number" ? row.ag : Number.isFinite(Number(row.ag)) && row.ag !== "" && row.ag !== null ? Number(row.ag) : undefined;
  return {
    date: dateKey(row.date),
    time: typeof row.time === "string" ? row.time : undefined,
    home: canonicalTeamName(row.home),
    away: canonicalTeamName(row.away),
    hg,
    ag,
    result: typeof row.result === "string" ? row.result : hg !== undefined && ag !== undefined ? (hg > ag ? "H" : hg < ag ? "A" : "D") : undefined,
    league: typeof row.league === "string" ? row.league : "Worldwide Football",
    source: typeof row.source === "string" ? row.source : "living-reservoir",
    sourceId: typeof row.sourceId === "string" ? row.sourceId : undefined,
  };
}

function summaryRows(summary: unknown, key: "historicalRows" | "recentRows" | "h2h") {
  if (!summary || typeof summary !== "object") return [];
  const value = (summary as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.map(toMatchRow).filter((row): row is MatchRow => Boolean(row));
}

export type LivingEvidenceContext = {
  matchRows: MatchRow[];
  h2hRows: MatchRow[];
  homeTeamRows: MatchRow[];
  awayTeamRows: MatchRow[];
  sourceFamilies: string[];
  sourceFamilyCounts: Record<string, number>;
  matchCompleteness: number;
  homeCompleteness: number;
  awayCompleteness: number;
  evidenceCount: number;
  sourceCount: number;
  lastMinedAt?: string;
  status: "LIVE_CELL" | "NO_CELL";
};

export async function loadLivingEvidence(fixture: MatchRow): Promise<LivingEvidenceContext> {
  const db = client();
  if (!db) {
    return { matchRows: [], h2hRows: [], homeTeamRows: [], awayTeamRows: [], sourceFamilies: [], sourceFamilyCounts: {}, matchCompleteness: 0, homeCompleteness: 0, awayCompleteness: 0, evidenceCount: 0, sourceCount: 0, status: "NO_CELL" };
  }

  const matchKey = `${dateKey(fixture.date)}|${canonicalTeamKey(fixture.home)}|${canonicalTeamKey(fixture.away)}`;
  const homeKey = canonicalTeamKey(fixture.home);
  const awayKey = canonicalTeamKey(fixture.away);
  const [matchRes, homeRes, awayRes] = await Promise.all([
    db.from("match_intelligence_cells").select("summary,completeness,evidence_count,source_count,last_mined_at,status").eq("match_key", matchKey).maybeSingle(),
    db.from("team_intelligence_cells").select("summary,completeness,evidence_count,source_count,last_mined_at,status").eq("team_key", homeKey).maybeSingle(),
    db.from("team_intelligence_cells").select("summary,completeness,evidence_count,source_count,last_mined_at,status").eq("team_key", awayKey).maybeSingle(),
  ]);

  const match = matchRes.data;
  const home = homeRes.data;
  const away = awayRes.data;
  const matchRows = match ? summaryRows(match.summary, "historicalRows") : [];
  const h2hRows = match ? summaryRows(match.summary, "h2h") : [];
  const homeTeamRows = home ? summaryRows(home.summary, "recentRows") : [];
  const awayTeamRows = away ? summaryRows(away.summary, "recentRows") : [];
  const summary = match?.summary && typeof match.summary === "object" ? match.summary as Record<string, unknown> : {};
  const sourceFamilies = Array.isArray(summary.sourceFamilies) ? summary.sourceFamilies.filter((x): x is string => typeof x === "string") : [];
  const sourceFamilyCounts = summary.sourceFamilyCounts && typeof summary.sourceFamilyCounts === "object"
    ? Object.fromEntries(Object.entries(summary.sourceFamilyCounts as Record<string, unknown>).filter(([, value]) => typeof value === "number')) as Record<string, number>
    : {};
  const seen = new Set<string>();
  const unique = (rows: MatchRow[]) => rows.filter((row) => {
    const id = rowKey(row);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return {
    matchRows: unique(matchRows),
    h2hRows: unique(h2hRows),
    homeTeamRows: unique(homeTeamRows),
    awayTeamRows: unique(awayTeamRows),
    sourceFamilies,
    sourceFamilyCounts,
    matchCompleteness: Number(match?.completeness ?? 0),
    homeCompleteness: Number(home?.completeness ?? 0),
    awayCompleteness: Number(away?.completeness ?? 0),
    evidenceCount: Number(match?.evidence_count ?? 0) + Number(home?.evidence_count ?? 0) + Number(away?.evidence_count ?? 0),
    sourceCount: Math.max(Number(match?.source_count ?? 0), Number(home?.source_count ?? 0) + Number(away?.source_count ?? 0)),
    lastMinedAt: [match?.last_mined_at, home?.last_mined_at, away?.last_mined_at].filter(Boolean).sort().at(-1) as string | undefined,
    status: match || home || away ? "LIVE_CELL" : "NO_CELL",
  };
}
