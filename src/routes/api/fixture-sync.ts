import { createFileRoute } from "@tanstack/react-router";
import { loadFreeFixtures } from "@/lib/gfi/intelligence";
import { mineLivingReservoir } from "@/lib/gfi/living-reservoir";

function authorized(request: Request) {
  const configured = (typeof process !== "undefined" && (process.env.CRON_SECRET || process.env.LOVABLE_CRON_SECRET)) || "";
  if (!configured) return process.env.NODE_ENV !== "production";
  return (request.headers.get("authorization") ?? "") === `Bearer ${configured}`;
}

export const Route = createFileRoute("/api/fixture-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const groups = await loadFreeFixtures();
          const fixtures = groups.flatMap((group) => group.matches.filter((m) => m.hg === undefined && m.ag === undefined).map((m) => ({ ...m, league: group.league, code: group.code, season: group.season })));
          const sourceCounts = fixtures.reduce<Record<string, number>>((acc, fixture) => { const source = fixture.source ?? "free"; acc[source] = (acc[source] ?? 0) + 1; return acc; }, {});
          const mining = await mineLivingReservoir(fixtures, 24);
          return Response.json({ ok: true, syncedAt: new Date().toISOString(), groups: groups.length, upcomingFixtures: fixtures.length, sourceCounts, mining });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
      },
    },
  },
});
