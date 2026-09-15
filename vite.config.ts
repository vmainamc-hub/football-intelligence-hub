import { execSync } from "node:child_process";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

function gitCommitSha() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return process.env.VITE_BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "UNKNOWN_BUILD";
  }
}

const buildSha = gitCommitSha();
const buildTime = new Date().toISOString();

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_BUILD_SHA": JSON.stringify(buildSha),
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
    },
  },
});
