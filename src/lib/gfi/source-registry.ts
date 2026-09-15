import { createServerFn } from "@tanstack/react-start";
import { UNIVERSAL_SOURCES, getUniversalFixtures } from "./universal-sources";
import { loadFreeFixtures } from "./intelligence";
import { isTavilyConfigured } from "./tavily-evidence";

export type RuntimeSource = (typeof UNIVERSAL_SOURCES)[number] & {
  status: "CONNECTED" | "OFFLINE" | "FAILED";
  observedRows?: number;
  checkedAt: string;
  error?: string;
};

export type SystemDiagnostics = {
  status: "OPTIMAL" | "DEGRADED" | "MINIMAL";
  totalFixtures: number;
  totalGroups: number;
  activeSources: number;
  breakdown: {
    footballData: number;
    espn: number;
    betika: number;
    sportscore: number;
    theSportsDb: number;
    openFootball: number;
    tavily: { configured: boolean };
  };
  sources: RuntimeSource[];
  failingSources: string[];
  checkedAt: string;
};

export async function getSystemDiagnostics(): Promise<SystemDiagnostics> {
  const checkedAt = new Date().toISOString();
  const failingSources: string[] = [];
  const breakdown = {
    footballData: 0,
    espn: 0,
    betika: 0,
    sportscore: 0,
    theSportsDb: 0,
    openFootball: 0,
    tavily: { configured: isTavilyConfigured() },
  };

  let totalGroups = 0;
  let totalFixtures = 0;

  const sources: RuntimeSource[] = UNIVERSAL_SOURCES.map((s) => ({
    ...s,
    status: s.configured ? "CONNECTED" : "OFFLINE",
    checkedAt,
  }));

  try {
    const groups = await loadFreeFixtures();
    totalGroups = groups.length;
    for (const g of groups) {
      for (const m of g.matches) {
        totalFixtures += 1;
        const src = m.source ?? "";
        if (src === "football-data") breakdown.footballData += 1;
        else if (src === "espn") breakdown.espn += 1;
        else if (src === "betika") breakdown.betika += 1;
        else if (src === "sportscore") breakdown.sportscore += 1;
        else if (src === "sportsdb") breakdown.theSportsDb += 1;
        else if (src === "openfootball") breakdown.openFootball += 1;
      }
    }

    // Update per-source observation counts
    const fd = sources.find((s) => s.name === "Football-Data.co.uk");
    if (fd) fd.observedRows = breakdown.footballData;
    const espn = sources.find((s) => s.name === "ESPN");
    if (espn) espn.observedRows = breakdown.espn;
    const betika = sources.find((s) => s.name === "Betika");
    if (betika) betika.observedRows = breakdown.betika;
    const ss = sources.find((s) => s.name === "SportScore");
    if (ss) ss.observedRows = breakdown.sportscore;
    const db = sources.find((s) => s.name === "TheSportsDB");
    if (db) db.observedRows = breakdown.theSportsDb;
    const of = sources.find((s) => s.name === "OpenFootball");
    if (of) of.observedRows = breakdown.openFootball;
    const tavily = sources.find((s) => s.name === "Tavily Web Evidence");
    if (tavily) tavily.status = breakdown.tavily.configured ? "CONNECTED" : "OFFLINE";
  } catch (err) {
    failingSources.push(`Pipeline error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const activeExternalSources = [
    breakdown.espn > 0,
    breakdown.betika > 0,
    breakdown.sportscore > 0,
    breakdown.theSportsDb > 0,
    breakdown.openFootball > 0,
  ].filter(Boolean).length;

  let status: SystemDiagnostics["status"] = "MINIMAL";
  if (activeExternalSources >= 2) {
    status = "OPTIMAL";
  } else if (activeExternalSources >= 1) {
    status = "DEGRADED";
  } else {
    status = "MINIMAL";
  }

  const activeSources =
    (breakdown.footballData > 0 ? 1 : 0) +
    activeExternalSources +
    (breakdown.tavily.configured ? 1 : 0);

  return {
    status,
    totalFixtures,
    totalGroups,
    activeSources,
    breakdown,
    sources,
    failingSources,
    checkedAt,
  };
}

export const inspectSystemDiagnostics = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemDiagnostics> => {
    return getSystemDiagnostics();
  },
);

export const inspectSystem = createServerFn({ method: "GET" }).handler(
  async (): Promise<RuntimeSource[]> => {
    const diag = await inspectSystemDiagnostics();
    return diag.sources;
  },
);
