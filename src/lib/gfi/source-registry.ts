import { createServerFn } from "@tanstack/react-start";
import { fetchUniversalFixtures, UNIVERSAL_SOURCES } from "./universal-sources";
import { loadFreeFixturesInternal } from "./intelligence";

export type RuntimeSource = typeof UNIVERSAL_SOURCES[number] & { status: "CONNECTED" | "OFFLINE" | "FAILED"; observedRows?: number; checkedAt: string };

export const inspectSystem = createServerFn({ method: "GET" }).handler(async (): Promise<RuntimeSource[]> => {
  const checkedAt = new Date().toISOString();
  const out: RuntimeSource[] = UNIVERSAL_SOURCES.map((s) => ({ ...s, status: s.configured ? "CONNECTED" : "OFFLINE", checkedAt }));
  try {
    const groups = await loadFreeFixturesInternal();
    const total = groups.reduce((n, g) => n + g.matches.length, 0);
    const primary = out.find((s) => s.name === "Football-Data.co.uk");
    if (primary) { primary.observedRows = total; primary.status = total > 0 ? "CONNECTED" : "FAILED"; }
    const open = out.find((s) => s.name === "OpenFootball");
    if (open) open.observedRows = groups.reduce((n, g) => n + g.matches.filter((m) => m.source === "openfootball").length, 0);
  } catch {
    const primary = out.find((s) => s.name === "Football-Data.co.uk");
    if (primary) primary.status = "FAILED";
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await fetchUniversalFixtures({ data: { dateFrom: today, dateTo: today } });
    const sport = out.find((s) => s.name === "SportScore");
    const live = out.find((s) => s.name === "Global-Live");
    const db = out.find((s) => s.name === "TheSportsDB");
    if (sport) { sport.observedRows = rows.filter((r) => r.source === "sportscore").length; sport.status = "CONNECTED"; }
    if (live) { live.observedRows = rows.filter((r) => r.source === "global-live").length; live.status = "CONNECTED"; }
    if (db) { db.observedRows = rows.filter((r) => r.source === "sportsdb").length; db.status = "CONNECTED"; }
  } catch {
    // Individual optional source failures are non-fatal.
  }
  return out;
});
