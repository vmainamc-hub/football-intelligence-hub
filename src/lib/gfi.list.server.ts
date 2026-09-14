import type { MatchDTO } from "./gfi.server";

/**
 * Shared PostgREST projection + row mapper for match list queries.
 *
 * Server-only: this module is imported dynamically from inside server function
 * handlers so it never enters the client bundle.
 */
export const listSelect =
  "id,kickoff,round,status,ft_home,ft_away,home_team_id,away_team_id,competition_id,competitions(name,code,season,country),home:teams!matches_home_team_id_fkey(name),away:teams!matches_away_team_id_fkey(name)";

type ListRow = {
  id: string;
  kickoff: string;
  round: string | null;
  status: string;
  ft_home: number | null;
  ft_away: number | null;
  home_team_id: string;
  away_team_id: string;
  competition_id: string;
  competitions: { name: string; code: string; season: string; country: string | null } | null;
  home: { name: string } | null;
  away: { name: string } | null;
};

export function mapRows(rows: unknown[]): MatchDTO[] {
  return (rows as ListRow[]).map((r) => ({
    id: r.id,
    kickoff: r.kickoff,
    round: r.round,
    status: r.status,
    ftHome: r.ft_home,
    ftAway: r.ft_away,
    homeId: r.home_team_id,
    awayId: r.away_team_id,
    homeName: r.home?.name ?? "Unknown",
    awayName: r.away?.name ?? "Unknown",
    competitionId: r.competition_id,
    competition: r.competitions?.name ?? "Unknown competition",
    competitionCode: r.competitions?.code ?? "",
    season: r.competitions?.season ?? "",
    country: r.competitions?.country ?? null,
  }));
}
