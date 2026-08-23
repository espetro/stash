/**
 * Live LLM evals, run inside vitest so the viewer's vendored-wasm decode
 * path works (same wasmBytes plugin as the viewer's own tests). Loaded
 * only by the programmatic runner in run.ts; skipped under plain
 * `pnpm test` (guarded by EVALS_ARMED) to keep unit runs offline.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "../harness";
import { decodeComprehension, formatDiscovery, shortLinkRead, type EvalInput } from "../evals";
import { evalContext } from "../eval-context";
import { fixture, readLlmsTxt } from "../env";

const armed = process.env.EVALS_ARMED === "1";

function input(): EvalInput {
  return {
    client: createClient(),
    fixture: fixture("three-tabs"),
    viewerOrigin: evalContext.viewerOrigin,
    shortenerOrigin: evalContext.shortenerOrigin,
    shortUrl: evalContext.shortUrl,
    llmsTxt: readLlmsTxt(),
  };
}

describe.runIf(armed)("live LLM evals", () => {
  it("decode-comprehension", async () => {
    const outcome = await decodeComprehension(input());
    evalContext.results.push(outcome);
    if (!outcome.pass) throw new Error(outcome.reason);
    expect(outcome.pass).toBe(true);
  });

  it("format-discovery", async () => {
    const outcome = await formatDiscovery(input());
    evalContext.results.push(outcome);
    if (!outcome.pass) throw new Error(outcome.reason);
    expect(outcome.pass).toBe(true);
  });

  it("short-link-read", async () => {
    const outcome = await shortLinkRead(input());
    evalContext.results.push(outcome);
    if (!outcome.pass) throw new Error(outcome.reason);
    expect(outcome.pass).toBe(true);
  });
});
