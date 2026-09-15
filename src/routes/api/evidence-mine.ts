import { createFileRoute } from "@tanstack/react-router";
import { runDeepEvidenceMining } from "@/lib/gfi/deep-evidence-miner";

function authorized(request: Request) {
  const configured =
    (typeof process !== "undefined" && (process.env.CRON_SECRET || process.env.LOVABLE_CRON_SECRET)) || "";
  if (!configured) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${configured}`;
}

export const Route = createFileRoute("/api/evidence-mine")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const result = await runDeepEvidenceMining({ matchBudget: 24, teamBudget: 32 });
          return Response.json({ ok: true, ...result, minedAt: new Date().toISOString() });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
      },
    },
  },
});
