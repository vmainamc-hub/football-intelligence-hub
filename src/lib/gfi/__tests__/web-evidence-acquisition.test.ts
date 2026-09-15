import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireWebEvidence } from "../web-evidence-acquisition";

test("web evidence acquisition is safe and explicit when no search credential is configured", async () => {
  const old = process.env.BRAVE_SEARCH_API_KEY;
  const oldGeneric = process.env.WEB_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  try {
    const result = await acquireWebEvidence("Vlasim", "Slovan Liberec", "2026-09-15");
    assert.equal(result.configured, false);
    assert.equal(result.attempted, false);
    assert.deepEqual(result.extractedRows, []);
    assert.deepEqual(result.facts, []);
  } finally {
    if (old === undefined) delete process.env.BRAVE_SEARCH_API_KEY; else process.env.BRAVE_SEARCH_API_KEY = old;
    if (oldGeneric === undefined) delete process.env.WEB_SEARCH_API_KEY; else process.env.WEB_SEARCH_API_KEY = oldGeneric;
  }
});
