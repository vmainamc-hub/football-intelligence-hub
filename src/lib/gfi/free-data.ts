import { createServerFn } from "@tanstack/react-start";

export type FreeDataFetchResult = {
  code: string;
  season: string;
  csv: string;
  sourceUrl: string;
  fetchedAt: string;
};

const BASE_URL = "https://www.football-data.co.uk/mmz4281";
const REQUEST_TIMEOUT_MS = 12_000;

function validSeason(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function validCode(value: string): boolean {
  return /^[A-Z0-9]{2,4}$/.test(value);
}

export async function getFreeLeagueCsv(
  codeParam: string,
  seasonParam: string,
): Promise<FreeDataFetchResult> {
  const code = codeParam.toUpperCase();
  const season = seasonParam;

  if (!validCode(code) || !validSeason(season)) {
    throw new Error("Invalid free football data request");
  }

  const sourceUrl = `${BASE_URL}/${season}/${code}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/csv,text/plain,*/*",
        "User-Agent": "Global-Football-Intelligence/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Football-Data source returned HTTP ${response.status}`);
    }

    const csv = await response.text();
    if (!csv.trim() || !/HomeTeam/i.test(csv.slice(0, 4000))) {
      throw new Error("Football-Data source returned an invalid or empty CSV");
    }

    return {
      code,
      season,
      csv,
      sourceUrl,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const fetchFreeLeagueCsv = createServerFn({ method: "GET" })
  .validator((input: { code: string; season: string }) => input)
  .handler(async ({ data }): Promise<FreeDataFetchResult> => {
    return getFreeLeagueCsv(data.code, data.season);
  });
