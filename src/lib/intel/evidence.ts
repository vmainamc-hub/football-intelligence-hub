import type { Features } from "./features";
import type { EvidenceItem } from "./types";
import type { ProviderHealth } from "./providers";

function daysBetween(a: string, b: string) {
  return Math.max(0, Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000));
}

export function buildEvidence(f: Features, providers: ProviderHealth[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const now = f.cutoff;

  const push = (claim: string, category: string, opts: Partial<EvidenceItem> = {}) =>
    items.push({
      claim,
      category,
      source: "Internal computation over stored results",
      sourceKind: "COMPUTED",
      reliability: 0.9,
      confidence: 0.8,
      freshnessDays: null,
      observedAt: null,
      ...opts,
    });

  for (const team of [f.home, f.away] as const) {
    const venue = team.id === f.home.id ? team.home : team.away;
    const venueLabel = team.id === f.home.id ? "at home" : "away";
    push(
      `${team.name} average ${team.overall.scored.toFixed(2)} scored and ${team.overall.conceded.toFixed(2)} conceded across the last ${team.overall.played} stored matches.`,
      "Team form",
      { confidence: Math.min(0.95, team.overall.played / 20) },
    );
    if (venue.played > 0) {
      push(
        `${team.name} ${venueLabel}: ${venue.played} matches, ${venue.scored.toFixed(2)} scored, ${venue.conceded.toFixed(2)} conceded, ${(venue.bttsRate * 100).toFixed(0)}% both teams scored.`,
        "Venue split",
        { confidence: Math.min(0.9, venue.played / 10) },
      );
    }
    push(
      `${team.name} Elo rating ${Math.round(team.elo)} after all stored results before kickoff.`,
      "Team strength",
    );
    if (team.form.results.length) {
      push(
        `${team.name} recent results ${team.form.results.join("-")} (${team.form.points} points from ${team.form.results.length}).`,
        "Momentum",
        { confidence: 0.7 },
      );
    }
    if (team.lastMatchDate) {
      push(
        `${team.name} had ${team.restDays} days rest and played ${team.matchesInLast14Days} match(es) in the previous 14 days.`,
        "Congestion",
        {
          freshnessDays: daysBetween(now, team.lastMatchDate),
          observedAt: team.lastMatchDate,
          confidence: 0.85,
        },
      );
    }
  }

  push(
    `${f.target.competition} baseline: ${f.league.homeGoals.toFixed(2)} home goals, ${f.league.awayGoals.toFixed(2)} away goals, ${(f.league.homeWinRate * 100).toFixed(0)}% home wins across ${f.league.matches} stored matches.`,
    "League baseline",
    { reliability: 0.95, confidence: Math.min(0.95, f.league.matches / 300) },
  );

  if (f.h2h.matches.length) {
    const last = f.h2h.matches[0]!;
    push(
      `${f.h2h.matches.length} stored meetings: ${f.h2h.homeWins} ${f.home.name} wins, ${f.h2h.draws} draws, ${f.h2h.awayWins} ${f.away.name} wins, ${f.h2h.avgTotal.toFixed(2)} goals per game.`,
      "Head-to-head",
      {
        observedAt: last.kickoff,
        freshnessDays: daysBetween(now, last.kickoff),
        confidence: Math.min(0.7, f.h2h.matches.length / 8),
      },
    );
  } else {
    items.push({
      claim:
        "No stored meetings between these teams. Head-to-head evidence is unavailable rather than estimated.",
      category: "Head-to-head",
      source: "System",
      sourceKind: "SYSTEM",
      reliability: 1,
      confidence: 1,
      freshnessDays: null,
      observedAt: null,
      conflict: "DATA SOURCE UNAVAILABLE",
    });
  }

  items.push({
    claim: `Result history sourced from the openfootball open dataset (${f.historyCount} matches available before this kickoff).`,
    category: "Provenance",
    source: "openfootball",
    sourceKind: "OPEN_DATASET",
    reliability: 0.88,
    confidence: 0.9,
    freshnessDays: null,
    observedAt: null,
    url: "https://github.com/openfootball/football.json",
  });

  for (const p of providers.filter((x) => x.status !== "CONNECTED")) {
    items.push({
      claim: `${p.provides.join(", ")} not collected — ${p.name} is ${p.status.replace(/_/g, " ").toLowerCase()}.`,
      category: "Missing source",
      source: p.name,
      sourceKind: "PROVIDER",
      reliability: 1,
      confidence: 1,
      freshnessDays: null,
      observedAt: null,
      conflict: p.status === "NOT_CONFIGURED" ? "NOT CONFIGURED" : "DATA SOURCE UNAVAILABLE",
    });
  }

  return items;
}
