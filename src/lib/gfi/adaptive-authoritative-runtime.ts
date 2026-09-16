import type { MatchRow } from "./intelligence";
import type { AuthoritativeMatchAnalysis } from "./authoritative";
import { analyzeActiveAuthoritatively } from "./authoritative-runtime";

export function analyzeAdaptiveAuthoritatively(
  fixture: MatchRow,
  rows: MatchRow[],
): AuthoritativeMatchAnalysis {
  return analyzeActiveAuthoritatively(fixture, rows);
}

export { analyzeActiveAuthoritatively };

