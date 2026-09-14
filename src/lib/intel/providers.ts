/**
 * Provider registry.
 *
 * Adapters stay in the architecture permanently. Each one reports its own
 * status; nothing is ever invented when a provider is dormant. Adding a new
 * provider means adding an entry here plus an adapter module — no change to
 * the analysis pipeline or the UI.
 */

export type ProviderStatus =
  "CONNECTED" | "NOT_CONFIGURED" | "TEMPORARILY_UNAVAILABLE" | "DATA_NOT_AVAILABLE";

export type ProviderDescriptor = {
  id: string;
  name: string;
  kind: "FOOTBALL_DATA" | "NEWS" | "ODDS" | "WEATHER" | "AI" | "OPEN_DATASET";
  requiresKey: boolean;
  envKey?: string;
  free: boolean;
  provides: string[];
  homepage: string;
};

export const PROVIDERS: ProviderDescriptor[] = [
  {
    id: "openfootball",
    name: "openfootball open dataset",
    kind: "OPEN_DATASET",
    requiresKey: false,
    free: true,
    provides: ["Fixtures", "Historical results", "Competitions", "Teams"],
    homepage: "https://github.com/openfootball/football.json",
  },
  {
    id: "internal-engines",
    name: "Internal quantitative engines",
    kind: "FOOTBALL_DATA",
    requiresKey: false,
    free: true,
    provides: ["Team strength", "Elo", "Form", "Goal distributions", "Simulation", "Calibration"],
    homepage: "",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo weather",
    kind: "WEATHER",
    requiresKey: false,
    free: true,
    provides: ["Forecast temperature", "Wind", "Precipitation"],
    homepage: "https://open-meteo.com",
  },
  {
    id: "sportmonks",
    name: "Sportmonks",
    kind: "FOOTBALL_DATA",
    requiresKey: true,
    envKey: "SPORTMONKS_API_KEY",
    free: false,
    provides: ["Live fixtures", "xG", "Lineups", "Injuries", "Player stats", "Events"],
    homepage: "https://www.sportmonks.com",
  },
  {
    id: "api-football",
    name: "API-Football",
    kind: "FOOTBALL_DATA",
    requiresKey: true,
    envKey: "API_FOOTBALL_KEY",
    free: false,
    provides: ["Fixtures", "Statistics", "Lineups", "Injuries", "Odds"],
    homepage: "https://www.api-football.com",
  },
  {
    id: "newsapi",
    name: "NewsAPI",
    kind: "NEWS",
    requiresKey: true,
    envKey: "NEWSAPI_KEY",
    free: false,
    provides: ["Team news", "Press conferences", "Transfer reports"],
    homepage: "https://newsapi.org",
  },
  {
    id: "odds-api",
    name: "Odds provider",
    kind: "ODDS",
    requiresKey: true,
    envKey: "ODDS_API_KEY",
    free: false,
    provides: ["Opening odds", "Current odds", "Odds movement", "Market consensus"],
    homepage: "https://the-odds-api.com",
  },
];

export type ProviderHealth = ProviderDescriptor & {
  status: ProviderStatus;
  detail: string;
};

/** Must only be called from server code — it reads process.env. */
export function describeProviders(env: Record<string, string | undefined>): ProviderHealth[] {
  return PROVIDERS.map((p) => {
    if (!p.requiresKey) {
      return {
        ...p,
        status: "CONNECTED" as ProviderStatus,
        detail: "Free source — no credentials required",
      };
    }
    const key = p.envKey ? env[p.envKey] : undefined;
    return key
      ? { ...p, status: "CONNECTED" as ProviderStatus, detail: "Credential present" }
      : {
          ...p,
          status: "NOT_CONFIGURED" as ProviderStatus,
          detail: `Dormant adapter — set ${p.envKey} to activate. Nothing is invented in the meantime.`,
        };
  });
}
