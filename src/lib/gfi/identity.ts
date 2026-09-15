/**
 * Shared identity + data-integrity helpers.
 *
 * CRITICAL: Football-Data CSV rows for scheduled fixtures carry EMPTY FTHG/FTAG
 * cells. `Number("")` is 0, so a naive parse silently turns every future fixture
 * into a completed 0-0 and poisons the historical model. Score cells are only
 * accepted when the cell actually contains a number. A genuine completed 0-0
 * still parses to 0 and stays distinguishable through its FTR result field.
 */
export function parseScoreCell(value: string | undefined): number | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  if (!/^-?\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseResultCell(value: string | undefined): "H" | "D" | "A" | undefined {
  const raw = (value ?? "").trim().toUpperCase();
  return raw === "H" || raw === "D" || raw === "A" ? raw : undefined;
}

/** A match is historical only when both scores were actually published. */
export function isCompletedMatch(match: {
  hg?: number;
  ag?: number;
  result?: "H" | "D" | "A";
}): boolean {
  return typeof match.hg === "number" && typeof match.ag === "number";
}

const TEAM_NOISE =
  /\b(fc|afc|cf|sc|ac|as|ss|ssc|cd|ud|sd|rc|rcd|club|clube|calcio|football|futbol|futebol|sporting clube|sporting club|deportivo|association)\b/g;

/** Normalized comparison key: "Real Madrid CF" and "Real Madrid" collapse to one identity. */
export function canonicalTeamKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\./g, " ")
    .replace(TEAM_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_ALIASES: Record<string, string> = {
  "sp braga": "Braga",
  braga: "Braga",
  "man united": "Manchester United",
  "man utd": "Manchester United",
  "man city": "Manchester City",
  "real madrid": "Real Madrid",
  barcelona: "Barcelona",
  elche: "Elche",
  "ath madrid": "Atletico Madrid",
  "atletico madrid": "Atletico Madrid",
  "ath bilbao": "Athletic Bilbao",
  "athletic": "Athletic Bilbao",
  "inter": "Inter",
  "internazionale": "Inter",
  "nott m": "Nottingham Forest",
  "nottingham": "Nottingham Forest",
  "paris sg": "Paris Saint-Germain",
  "paris saint germain": "Paris Saint-Germain",
  "bayern munich": "Bayern Munich",
  "sporting": "Sporting CP",
  "sporting cp": "Sporting CP",
};

/** Human-facing canonical team name, so one club is never stored twice. */
export function canonicalTeamName(value: string): string {
  const key = canonicalTeamKey(value);
  if (TEAM_ALIASES[key]) return TEAM_ALIASES[key];
  return value.trim().replace(/\s+/g, " ");
}

export function sameTeamIdentity(a: string, b: string): boolean {
  return canonicalTeamKey(a) === canonicalTeamKey(b);
}

const COMPETITION_ALIASES: Record<string, string> = {
  "la liga": "La Liga",
  "spanish la liga": "La Liga",
  "spanish laliga": "La Liga",
  laliga: "La Liga",
  "primera division": "La Liga",
  "la liga 2": "La Liga 2",
  "spanish la liga 2": "La Liga 2",
  "segunda division": "La Liga 2",
  "premier league": "Premier League",
  "english premier league": "Premier League",
  epl: "Premier League",
  championship: "Championship",
  "english championship": "Championship",
  bundesliga: "Bundesliga",
  "german bundesliga": "Bundesliga",
  "2 bundesliga": "2. Bundesliga",
  "german 2 bundesliga": "2. Bundesliga",
  "serie a": "Serie A",
  "italian serie a": "Serie A",
  "serie b": "Serie B",
  "italian serie b": "Serie B",
  "ligue 1": "Ligue 1",
  "french ligue 1": "Ligue 1",
  "ligue 2": "Ligue 2",
  "french ligue 2": "Ligue 2",
  eredivisie: "Eredivisie",
  "dutch eredivisie": "Eredivisie",
  "primeira liga": "Primeira Liga",
  "liga portugal": "Primeira Liga",
  "liga portugal betclic": "Primeira Liga",
  "portuguese primeira liga": "Primeira Liga",
};

export function competitionKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Equivalent competition names resolve to one competition context. */
export function canonicalCompetitionName(value: string | undefined): string {
  const raw = (value ?? "").trim();
  const key = competitionKey(raw);
  return COMPETITION_ALIASES[key] ?? (raw || "Worldwide Football");
}
