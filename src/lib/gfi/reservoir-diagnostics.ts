import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  if (typeof process === "undefined") return "";
  return process.env[name] ?? "";
}

export const inspectReservoir = createServerFn({ method: "GET" }).handler(async () => {
  const url = env("SUPABASE_URL");
  const publishable = env("SUPABASE_PUBLISHABLE_KEY");
  const secret = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const result = {
    urlConfigured: Boolean(url),
    publishableConfigured: Boolean(publishable),
    serverSecretConfigured: Boolean(secret),
    project: url ? url.replace(/^https?:\/\//, "").replace(/\.supabase\.co.*$/, "") : "",
    schemaReady: true,
    missingTables: [] as string[],
    errors: [] as string[],
  };
  if (!url || !publishable) {
    result.schemaReady = false;
    result.errors.push("Supabase URL or publishable key is missing.");
    return result;
  }
  const db = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tables = [
    "teams",
    "team_aliases",
    "competitions",
    "matches",
    "source_observations",
    "ingest_runs",
    "research_runs",
    "research_evidence",
    "predictions",
    "engine_predictions",
    "snapshots",
  ];
  for (const table of tables) {
    const { error } = await db.from(table).select("*").limit(1);
    if (error) {
      const message = error.message || String(error);
      if (/schema cache|does not exist|relation .* not found/i.test(message))
        result.missingTables.push(table);
      else result.errors.push(`${table}: ${message}`);
    }
  }
  result.schemaReady = result.missingTables.length === 0 && result.errors.length === 0;
  if (!result.serverSecretConfigured)
    result.errors.push(
      "Server-side Supabase secret is missing; privileged reservoir writes cannot run.",
    );
  return result;
});
