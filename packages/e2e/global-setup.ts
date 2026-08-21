/**
 * Playwright `globalSetup`: regenerate `fixtures/payloads.json` and
 * `fixtures/sample-tabs.json` before any test runs. We compare mtime
 * of the fixtures against the maximum mtime of the codec source dir;
 * if the codec is newer, regenerate. Otherwise reuse the committed
 * fixtures unchanged.
 *
 * Regeneration is fast (<1s on a laptop with brotli-wasm preloaded by
 * node) and guarantees v-parity forever, so the agent never again has
 * to spend a debug session on a stale fixture set.
 */

import { regenerateIfStale } from "./lib/regenerate-fixtures.ts";

export default async function globalSetup(): Promise<void> {
  // The signature must return a function Playwright can call; the
  // side-effect (regenerating fixtures) is what we care about.
  await regenerateIfStale();
}
