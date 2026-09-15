export const GFI_ANALYSIS_VERSION = "gfi-authoritative-v6.2";

export type GfiRuntimeFingerprint = {
  buildSha: string;
  buildTime: string;
  mode: string;
  production: boolean;
  analysisVersion: string;
  contractVersion: string;
};

const env = import.meta.env as Record<string, string | undefined>;

function firstDefined(values: Array<string | undefined>, fallback: string) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? fallback;
}

export const runtimeFingerprint: GfiRuntimeFingerprint = {
  buildSha: firstDefined(
    [env.VITE_BUILD_SHA, env.VITE_GIT_COMMIT_SHA, env.GITHUB_SHA, env.VERCEL_GIT_COMMIT_SHA],
    "UNKNOWN_BUILD",
  ),
  buildTime: firstDefined([env.VITE_BUILD_TIME], new Date().toISOString()),
  mode: firstDefined([env.MODE], "unknown"),
  production: Boolean(env.PROD),
  analysisVersion: GFI_ANALYSIS_VERSION,
  contractVersion: "gfi-result-v1",
};

export function assertAuthoritativeResult(result: unknown): asserts result is {
  analysisVersion: string;
  finalPrediction: string;
  predictedScore: string;
  decision: string;
  probabilities: { home: number; draw: number; away: number };
  engines: unknown[];
  aiReasoningPacket: Record<string, unknown>;
} {
  if (!result || typeof result !== "object") {
    throw new Error("AUTHORITATIVE_RESULT_MISSING");
  }

  const candidate = result as Record<string, unknown>;
  const probabilities = candidate.probabilities as Record<string, unknown> | undefined;
  const validProbabilities =
    probabilities &&
    ["home", "draw", "away"].every(
      (key) => typeof probabilities[key] === "number" && Number.isFinite(probabilities[key]),
    );

  const packet = candidate.aiReasoningPacket as Record<string, unknown> | undefined;
  const runtime = packet?.runtimeFingerprint as Record<string, unknown> | undefined;

  if (
    typeof candidate.analysisVersion !== "string" ||
    typeof candidate.finalPrediction !== "string" ||
    typeof candidate.predictedScore !== "string" ||
    typeof candidate.decision !== "string" ||
    !validProbabilities ||
    !Array.isArray(candidate.engines) ||
    candidate.engines.length === 0 ||
    !packet ||
    !runtime ||
    typeof runtime.buildSha !== "string" ||
    typeof runtime.analysisVersion !== "string" ||
    runtime.analysisVersion !== GFI_ANALYSIS_VERSION
  ) {
    throw new Error("AUTHORITATIVE_RESULT_INVALID");
  }

  if (candidate.analysisVersion !== GFI_ANALYSIS_VERSION) {
    throw new Error(
      `AUTHORITATIVE_RESULT_VERSION_MISMATCH:${String(candidate.analysisVersion)}`,
    );
  }

  const total =
    Number(probabilities.home) + Number(probabilities.draw) + Number(probabilities.away);
  if (Math.abs(total - 1) > 0.025) {
    throw new Error("AUTHORITATIVE_RESULT_PROBABILITIES_INVALID");
  }

  if (runtime.buildSha === "UNKNOWN_BUILD") {
    throw new Error("AUTHORITATIVE_BUILD_FINGERPRINT_MISSING");
  }
}

export function renderPredictionOrUnavailable(value: string | undefined | null) {
  const normalized = String(value ?? "").trim();
  return normalized || "ANALYSIS UNAVAILABLE";
}
