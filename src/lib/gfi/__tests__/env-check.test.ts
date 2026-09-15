import test from "node:test";
import { isTavilyConfigured } from "../tavily-evidence";

test("check env in test", () => {
  console.log("process.env.TAVILY_API_KEY length:", process.env.TAVILY_API_KEY ? process.env.TAVILY_API_KEY.length : 0);
  console.log("isTavilyConfigured():", isTavilyConfigured());
});
