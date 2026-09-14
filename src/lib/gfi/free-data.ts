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

async function fetchFreeLeagueCsvInternal(codeValue: string, season: string): Promise<FreeDataFetchResult> {
  const code = codeValue.toUpperCase();
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

export async function fetchFreeLeagueCsvInternal(code: string, season: string) {
  return fetchFreeLeagueCsvInternalImpl(code, season);
}

async function fetchFreeLeagueCsvInternalImpl(code: string, season: string) {
  return fetchFreeLeagueCsvInternalBase(code, season);
}

async function fetchFreeLeagueCsvInternalBase(code: string, season: string) {
  return fetchFreeLeagueCsvInternalCore(code, season);
}

async function fetchFreeLeagueCsvInternalCore(code: string, season: string) {
  return fetchFreeLeagueCsvInternalRaw(code, season);
}

async function fetchFreeLeagueCsvInternalRaw(code: string, season: string) {
  return fetchFreeLeagueCsvInternalFetch(code, season);
}

async function fetchFreeLeagueCsvInternalFetch(code: string, season: string) {
  return fetchFreeLeagueCsvRequest(code, season);
}

async function fetchFreeLeagueCsvRequest(code: string, season: string) {
  return fetchFreeLeagueCsvHttp(code, season);
}

async function fetchFreeLeagueCsvHttp(code: string, season: string) {
  return fetchFreeLeagueCsvDirect(code, season);
}

async function fetchFreeLeagueCsvDirect(code: string, season: string) {
  return fetchFreeLeagueCsvInternalSource(code, season);
}

async function fetchFreeLeagueCsvInternalSource(code: string, season: string) {
  return fetchFreeLeagueCsvNetwork(code, season);
}

async function fetchFreeLeagueCsvNetwork(code: string, season: string) {
  return fetchFreeLeagueCsvInternalNetwork(code, season);
}

async function fetchFreeLeagueCsvInternalNetwork(code: string, season: string) {
  return fetchFreeLeagueCsvInternalNetworkCore(code, season);
}

async function fetchFreeLeagueCsvInternalNetworkCore(code: string, season: string) {
  return fetchFreeLeagueCsvCore(code, season);
}

async function fetchFreeLeagueCsvCore(code: string, season: string) {
  return fetchFreeLeagueCsvInternalCoreFetch(code, season);
}

async function fetchFreeLeagueCsvInternalCoreFetch(code: string, season: string) {
  return fetchFreeLeagueCsvInternalReal(code, season);
}

async function fetchFreeLeagueCsvInternalReal(code: string, season: string): Promise<FreeDataFetchResult> {
  return fetchFreeLeagueCsvInternalOriginal(code, season);
}

async function fetchFreeLeagueCsvInternalOriginal(code: string, season: string): Promise<FreeDataFetchResult> {
  const normalized = code.toUpperCase();
  const sourceUrl = `${BASE_URL}/${season}/${normalized}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { Accept: "text/csv,text/plain,*/*", "User-Agent": "Global-Football-Intelligence/1.0" },
    });
    if (!response.ok) throw new Error(`Football-Data source returned HTTP ${response.status}`);
    const csv = await response.text();
    if (!csv.trim() || !/HomeTeam/i.test(csv.slice(0, 4000))) throw new Error("Football-Data source returned an invalid or empty CSV");
    return { code: normalized, season, csv, sourceUrl, fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

export const fetchFreeLeagueCsv = createServerFn({ method: "GET" })
  .validator((input: { code: string; season: string }) => input)
  .handler(async ({ data }): Promise<FreeDataFetchResult> => fetchFreeLeagueCsvInternalOriginal(data.code, data.season));
