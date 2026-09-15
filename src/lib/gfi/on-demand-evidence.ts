import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canonicalTeamKey } from "./identity";
import { runDeepEvidenceMining } from "./deep-evidence-miner";
import type { MatchRow } from "./intelligence";

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function matchKey(fixture: MatchRow) {
  return hash(
    `${fixture.date.slice(0, 10)}|${canonicalTeamKey(fixture.home)}|${canonicalTeamKey(fixture.away)}`,
  );
}

/**
 * If a fixture has no living evidence cell, create a due cell and run one
 * targeted deep-mining slot. This is deliberately bounded: sparse fixtures
 * get a chance to acquire evidence, but opening a match cannot launch a large
 * background crawl.
 */
export async function requestFixtureMining(fixture: MatchRow) {
  try {
    const key = matchKey(fixture);
    const now = new Date().toISOString();
    await supabaseAdmin.from("match_intelligence_cells").upsert(
      {
        match_key: key,
        home_team_key: canonicalTeamKey(fixture.home),
        away_team_key: canonicalTeamKey(fixture.away),
        home_team_name: fixture.home,
        away_team_name: fixture.away,
        competition: fixture.league ?? "Worldwide Football",
        kickoff: fixture.time
          ? `${fixture.date.slice(0, 10)}T${fixture.time.slice(0, 5)}:00Z`
          : `${fixture.date.slice(0, 10)}T12:00:00Z`,
        observed_at: now,
        next_mine_at: now,
        evidence_count: 0,
        source_count: 0,
        completeness: 0,
        status: "ACTIVE",
        updated_at: now,
      },
      { onConflict: "match_key" },
    );
    return await runDeepEvidenceMining({ matchBudget: 1, teamBudget: 2 });
  } catch {
    return { configured: false, processedMatches: 0, processedTeams: 0, evidence: 0 };
  }
}
