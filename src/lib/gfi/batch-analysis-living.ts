import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type FreeLeague, type MatchRow } from "./intelligence";
import { canonicalCompetitionName, canonicalTeamKey } from "./identity";
import { mineLivingReservoir } from "./living-reservoir";
import {
  runBatchAnalysisInternal,
  type BatchAnalysisResponse,
} from "./batch-analysis";

function dateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value.slice(0, 10);
  const y = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${String(y).padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function canonicalFixtureKey(fixture: MatchRow) {
  return `${dateKey(fixture.date)}|${canonicalTeamKey(fixture.home)}|${canonicalTeamKey(fixture.away)}`;
}

function uniqueFixtures(groups: FreeLeague[]) {
  const unique = new Map<string, MatchRow & { league: string; code: string; season: string }>();
  for (const group of groups) {
    for (const fixture of group.matches) {
      if (fixture.hg !== undefined || fixture.ag !== undefined) continue;
      const row = {
        ...fixture,
        league: canonicalCompetitionName(group.league),
        code: group.code,
        season: group.season,
      };
      const key = canonicalFixtureKey(row);
      const existing = unique.get(key);
      if (!existing) unique.set(key, row);
      else if (!existing.time && row.time) unique.set(key, row);
    }
  }
  return [...unique.values()];
}

function dedupeSelections(result: BatchAnalysisResponse) {
  const seen = new Set<string>();
  const selections = result.selections.filter((row) => {
    const key = canonicalFixtureKey(row.fixture);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...result, selections, returned: selections.length };
}

export const runLivingBatchAnalysis = createServerFn({ method: "POST" })
  .inputValidator(
    (input: unknown) => input as { request?: string; limit?: number; includeUpcoming?: boolean },
  )
  .handler(async ({ data }) => {
    const requestedText = (
      data.request ??
      (data.limit ? `Give me ${data.limit} safest picks` : "Predict today's next matches")
    ).trim();
    const requestedNumber = Number(requestedText.match(/\b(\d{1,2})\b/)?.[1] ?? 10);
    const overScan = Math.min(40, Math.max(requestedNumber * 3, requestedNumber + 10));

    // Warm a small rotating set of match/team dossiers before the analytical batch.
    // The heavyweight evidence remains in Supabase, so repeat batch requests reuse it.
    const groups = await loadFreeFixtures().catch(() => [] as FreeLeague[]);
    const candidates = uniqueFixtures(groups)
      .sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`))
      .slice(0, Math.min(24, overScan));
    await mineLivingReservoir(candidates, Math.min(12, candidates.length)).catch(() => undefined);

    // Overscan so deduplication never consumes the requested output count.
    const baseRequest =
      requestedNumber > 0 && !/\b\d{1,2}\b/.test(requestedText)
        ? `${requestedText} ${overScan}`
        : requestedText.replace(/\b(\d{1,2})\b/, String(overScan));
    const base = await runBatchAnalysisInternal({ ...data, request: baseRequest });
    const clean = dedupeSelections(base);
    const finalSelections = clean.selections.slice(0, requestedNumber);
    return {
      ...clean,
      requested: requestedNumber,
      returned: finalSelections.length,
      selections: finalSelections,
      message:
        finalSelections.length >= requestedNumber
          ? `${finalSelections.length} unique qualified selections returned after evidence warming and overscanning.`
          : `${requestedNumber} requested. ${finalSelections.length} unique selections cleared the qualification gates after duplicate removal.`,
    } satisfies BatchAnalysisResponse;
  });
