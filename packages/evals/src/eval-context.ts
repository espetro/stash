/**
 * Shared context between run.ts and the vitest live-evals suite:
 * run.ts populates the env (viewer origin, shortener, short URL),
 * the tests run inside vitest (which provides the wasm plugin the
 * viewer handler needs), and results land in evalContext.report.
 */
import type { EvalOutcome } from "./evals";

export interface EvalContext {
  viewerOrigin: string;
  shortenerOrigin: string;
  shortUrl: string;
  results: EvalOutcome[];
}

export const evalContext: EvalContext = {
  viewerOrigin: "",
  shortenerOrigin: "",
  shortUrl: "",
  results: [],
};
