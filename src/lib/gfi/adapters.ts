export type WeatherEvidence = {
  available: boolean;
  temperatureC?: number;
  precipitationProbability?: number;
  windKph?: number;
  note: string;
};
export type OptionalEvidence = {
  available: boolean;
  source: string;
  quality: number;
  facts: string[];
  note: string;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export async function fetchMatchWeather(
  lat?: number,
  lon?: number,
  date?: string,
): Promise<WeatherEvidence> {
  if (lat == null || lon == null || !date)
    return { available: false, note: "Weather coordinates are not available for this fixture." };
  try {
    const u = new URL("https://api.open-meteo.com/v1/forecast");
    u.searchParams.set("latitude", String(lat));
    u.searchParams.set("longitude", String(lon));
    u.searchParams.set(
      "daily",
      "temperature_2m_mean,precipitation_probability_max,windspeed_10m_max",
    );
    u.searchParams.set("timezone", "auto");
    u.searchParams.set("start_date", date);
    u.searchParams.set("end_date", date);
    const r = await fetch(u);
    if (!r.ok) throw new Error("weather request failed");
    const j = await r.json();
    return {
      available: true,
      temperatureC: num(j.daily?.temperature_2m_mean?.[0]),
      precipitationProbability: num(j.daily?.precipitation_probability_max?.[0]),
      windKph: num(j.daily?.windspeed_10m_max?.[0]),
      note: "Open-Meteo forecast; weather is contextual evidence and does not directly override match probabilities.",
    };
  } catch {
    return {
      available: false,
      note: "Weather provider unavailable; no weather facts were inferred.",
    };
  }
}

export function optionalProviderEvidence(
  kind: "XG" | "NEWS" | "LINEUPS",
  payload?: Record<string, unknown>,
): OptionalEvidence {
  if (!payload)
    return {
      available: false,
      source: `OPTIONAL_${kind}`,
      quality: 0,
      facts: [],
      note: `No ${kind.toLowerCase()} provider is configured in FREE MODE.`,
    };
  const facts = Object.entries(payload)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return {
    available: facts.length > 0,
    source: `OPTIONAL_${kind}`,
    quality: facts.length ? 70 : 0,
    facts,
    note: facts.length
      ? `Verified ${kind.toLowerCase()} adapter payload supplied by an external provider.`
      : `No usable ${kind.toLowerCase()} facts supplied.`,
  };
}

export type MarketOdds = { home?: number; draw?: number; away?: number };
export function analyseMarketDivergence(
  model: { home: number; draw: number; away: number },
  odds?: MarketOdds,
) {
  if (!odds?.home || !odds?.draw || !odds?.away)
    return {
      available: false,
      note: "No bookmaker odds loaded; market divergence is unavailable.",
    };
  const raw = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
  const z = raw.reduce((a, b) => a + b, 0);
  const implied = { home: raw[0] / z, draw: raw[1] / z, away: raw[2] / z };
  return {
    available: true,
    home: model.home - implied.home,
    draw: model.draw - implied.draw,
    away: model.away - implied.away,
    note: "Divergence = internal probability minus normalized market implied probability.",
  };
}
