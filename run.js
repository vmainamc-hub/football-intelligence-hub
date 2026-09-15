import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Ensure binding to all interfaces for Cloud Run container routing
process.env.HOST = process.env.HOST || "0.0.0.0";
process.env.NITRO_HOST = process.env.NITRO_HOST || "0.0.0.0";
if (!process.env.PORT && !process.env.NITRO_PORT) {
  process.env.PORT = "3000";
}

const serverEntry = resolve(process.cwd(), ".output/server/index.mjs");

if (!existsSync(serverEntry)) {
  console.error(`Production server entry not found at: ${serverEntry}`);
  console.error("Please run 'npm run build' before starting the server.");
  process.exit(1);
}

await import(serverEntry);
