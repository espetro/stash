/**
 * Thin delegation to the canonical generator that now lives in
 * `packages/shared/fixtures/generate.ts`. Kept so existing invocations
 * (`pnpm --filter @stash/e2e exec tsx fixtures/generate.ts` and
 * Playwright's `globalSetup` via lib/regenerate-fixtures.ts) keep
 * working unchanged. The generator writes to the shared fixtures dir;
 * we then mirror the JSONs here because e2e helpers read them from
 * `packages/e2e/fixtures/` (rewiring those imports is a later wave).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { writeFixtures } from "../../shared/fixtures/generate";

export * from "../../shared/fixtures/generate";

async function mirrorToLocal(): Promise<void> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const sharedDir = path.resolve(here, "..", "..", "shared", "fixtures");
  fs.copyFileSync(path.join(sharedDir, "payloads.json"), path.join(here, "payloads.json"));
  fs.copyFileSync(path.join(sharedDir, "sample-tabs.json"), path.join(here, "sample-tabs.json"));
}

export async function main(): Promise<void> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const sharedDir = path.resolve(here, "..", "..", "shared", "fixtures");
  await writeFixtures(sharedDir);
  await mirrorToLocal();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
