/**
 * Shared identity + data-integrity helpers.
 *
 * CRITICAL: Football-Data CSV rows for scheduled fixtures carry EMPTY FTHG/FTAG
 * cells. `Number("")` is 0, so a naive parse silently turns every future fixture
 * into a completed 0-0 and poisons the historical model. Score cells are only
 * accepted when the cell actually contains a number. A genuine completed 0-0
 * still parses to 0 and stays distinguishable through its FTR result field.
 */
export function parseScoreCell(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = (value ?? "").toString().trim();
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

export function sanitizeTeamName(value: string): string {
  if (!value) return "";
  let s = value.trim();
  // Strip score/minute/ranking numeric prefixes like "00 ", "45 ", "01 ", "1. ", "0-0 ", "12:30 "
  s = s.replace(/^\s*\d{1,3}\s*[-–.:]?\s+/i, "");
  s = s.replace(/^\s*\d{1,2}:\d{2}\s+/i, "");
  // Strip bracketed numbers like "[1] ", "(12) "
  s = s.replace(/^\s*[\[(]\d+[\])]\s*/i, "");
  // Strip trailing noise like " - 1st", " (R)", etc.
  s = s.replace(/\s+-\s+\d+.*$/, "");
  return s.trim() || value.trim();
}

/** Normalized comparison key: "Real Madrid CF" and "Real Madrid" collapse to one identity. */
export function canonicalTeamKey(value: string): string {
  const sanitized = sanitizeTeamName(value);
  const normalized = sanitized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\./g, " ")
    .replace(TEAM_NOISE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const alias = TEAM_ALIASES[normalized];
  if (alias) {
    return alias.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  return normalized;
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
  "athletic bilbao": "Athletic Bilbao",
  "athletic club": "Athletic Bilbao",
  athletic: "Athletic Bilbao",
  inter: "Inter",
  internazionale: "Inter",
  "nott m": "Nottingham Forest",
  nottingham: "Nottingham Forest",
  "nottingham forest": "Nottingham Forest",
  "paris sg": "Paris Saint-Germain",
  "paris saint germain": "Paris Saint-Germain",
  psg: "Paris Saint-Germain",
  "bayern munich": "Bayern Munich",
  bayern: "Bayern Munich",
  sporting: "Sporting CP",
  "sporting cp": "Sporting CP",
  "tottenham hotspur": "Tottenham",
  tottenham: "Tottenham",
  spurs: "Tottenham",
  "wolverhampton wanderers": "Wolves",
  wolves: "Wolves",
  wolverhampton: "Wolves",
  "west ham united": "West Ham",
  "west ham": "West Ham",
  "newcastle united": "Newcastle",
  newcastle: "Newcastle",
  "brighton and hove albion": "Brighton",
  brighton: "Brighton",
  "aston villa": "Aston Villa",
  villa: "Aston Villa",
  "leicester city": "Leicester",
  leicester: "Leicester",
  "borussia dortmund": "Borussia Dortmund",
  dortmund: "Borussia Dortmund",
  "bayer leverkusen": "Bayer Leverkusen",
  leverkusen: "Bayer Leverkusen",
  "borussia mgladbach": "Borussia Monchengladbach",
  "borussia monchengladbach": "Borussia Monchengladbach",
  mgladbach: "Borussia Monchengladbach",
  monchengladbach: "Borussia Monchengladbach",
  "eintracht frankfurt": "Eintracht Frankfurt",
  frankfurt: "Eintracht Frankfurt",
  "rb leipzig": "RB Leipzig",
  leipzig: "RB Leipzig",
  "real sociedad": "Real Sociedad",
  sociedad: "Real Sociedad",
  "real betis": "Real Betis",
  betis: "Real Betis",
  "celta vigo": "Celta Vigo",
  celta: "Celta Vigo",
  juventus: "Juventus",
  juve: "Juventus",
  "ac milan": "AC Milan",
  milan: "AC Milan",
  "as roma": "Roma",
  roma: "Roma",
  lazio: "Lazio",
  napoli: "Napoli",
  fiorentina: "Fiorentina",
  "olympique marseille": "Marseille",
  marseille: "Marseille",
  "olympique lyon": "Lyon",
  lyon: "Lyon",
  "as monaco": "Monaco",
  monaco: "Monaco",
  porto: "Porto",
  benfica: "Benfica",
  "manchester united": "Manchester United",
  "manchester city": "Manchester City",
  arsenal: "Arsenal",
  chelsea: "Chelsea",
  liverpool: "Liverpool",
};

/** Human-facing canonical team name, so one club is never stored twice. */
export function canonicalTeamName(value: string): string {
  const sanitized = sanitizeTeamName(value);
  const key = canonicalTeamKey(sanitized);
  if (TEAM_ALIASES[key]) return TEAM_ALIASES[key];
  const cleaned = sanitized
    .replace(/\b(FC|AFC|CF|SC|SSC)\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");
  const cleanedKey = canonicalTeamKey(cleaned);
  if (TEAM_ALIASES[cleanedKey]) return TEAM_ALIASES[cleanedKey];
  return cleaned || sanitized || value.trim().replace(/\s+/g, " ");
}

export function sameTeamIdentity(a: string, b: string): boolean {
  return (
    canonicalTeamName(a) === canonicalTeamName(b) || canonicalTeamKey(a) === canonicalTeamKey(b)
  );
}

const COMPETITION_ALIASES: Record<string, string> = {
  "la liga": "La Liga",
  "spanish la liga": "La Liga",
  "spanish laliga": "La Liga",
  laliga: "La Liga",
  "primera division": "La Liga",
  "spanish primera division": "La Liga",
  "primera division de espana": "La Liga",
  "la liga ea sports": "La Liga",
  "laliga ea sports": "La Liga",
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
  "efl cup": "EFL Cup",
  "carabao cup": "EFL Cup",
  "league cup": "EFL Cup",
  "fa cup": "FA Cup",
  "the fa cup": "FA Cup",
  "copa del rey": "Copa del Rey",
  "coppa italia": "Coppa Italia",
  "dfb pokal": "DFB-Pokal",
  "coupe de france": "Coupe de France",
  "uefa champions league": "UEFA Champions League",
  "champions league": "UEFA Champions League",
  ucl: "UEFA Champions League",
  "uefa europa league": "UEFA Europa League",
  "europa league": "UEFA Europa League",
  uel: "UEFA Europa League",
  "uefa conference league": "UEFA Conference League",
  "europa conference league": "UEFA Conference League",
  uecl: "UEFA Conference League",
  "conmebol libertadores": "Copa Libertadores",
  "copa libertadores": "Copa Libertadores",
  "conmebol sudamericana": "Copa Sudamericana",
  "copa sudamericana": "Copa Sudamericana",
  brasileirao: "Brasileirão",
  "brasileiro serie a": "Brasileirão",
  "campeonato brasileiro": "Brasileirão",
  "brasileiro serie b": "Brasileiro Serie B",
  mls: "MLS",
  "major league soccer": "MLS",
  "scottish premiership": "Scottish Premiership",
  "belgian pro league": "Belgian Pro League",
  "turkish super lig": "Turkish Super Lig",
  "greek super league": "Greek Super League",
  "austrian bundesliga": "Austrian Bundesliga",
  "swiss super league": "Swiss Super League",
  "danish superliga": "Danish Superliga",
  "norwegian eliteserien": "Norwegian Eliteserien",
  "swedish allsvenskan": "Swedish Allsvenskan",
  "liga mx": "Liga MX",
  "mexican liga mx": "Liga MX",
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
