/**
 * Programmatic vitest runner for the LLM evals. Loaded by run.ts; the
 * live-evals suite runs inside vitest (which supplies the wasm plugin
 * the viewer's decode path needs) and pushes outcomes into evalContext.
 */
import { startVitest } from "vitest/node";
import { fileURLToPath } from "node:url";

export async function runEvals(): Promise<number> {
  const vitest = await startVitest("test", [fileURLToPath(new URL("../src/__tests__/live-evals.test.ts", import.meta.url))], {
    watch: false,
    run: true,
    config: fileURLToPath(new URL("../vitest.config.ts", import.meta.url)),
  });
  const state = vitest.state;
  const failed = state.getFiles().some((f) => (f.result?.state ?? "pass") === "fail");
  return failed ? 1 : 0;
}
