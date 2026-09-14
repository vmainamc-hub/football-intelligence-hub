import { createServerFn } from "@tanstack/react-start";
import { loadFreeFixtures, type MatchRow } from "./intelligence";
import { analyzeAuthoritatively } from "./authoritative";

export const analyzeFreeMatch = createServerFn({ method: "POST" })
  .validator((input: { code: string; fixture: MatchRow }) => input)
  .handler(async ({ data }) => {
    const groups = await loadFreeFixtures();
    const group = groups.find((item) => item.code === data.code);
    if (!group) throw new Error(`League ${data.code} is not available in FREE MODE.`);
    return analyzeAuthoritatively(data.fixture, group.matches);
  });
