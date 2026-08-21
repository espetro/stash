/**
 * Regenerates `fixtures/payloads.json` and `fixtures/sample-tabs.json`
 * only if the codec source is newer than the fixtures.
 *
 * Trade-off: rather than recomputing a content hash, we use mtimes.
 * Mtime is cheaper than hash and good enough because fixtures depend
 * only on the codec source (and the version of `@stash/codec` itself,
 * which is the `dist/` build on disk).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const FIXTURE_PATHS = ["payloads.json", "sample-tabs.json"] as const;

/** Find the newest mtime among all files in dir, recursively. */
function newestMtime(dir: string): number {
  let max = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      max = Math.max(max, newestMtime(full));
    } else if (e.isFile()) {
      max = Math.max(max, fs.statSync(full).mtimeMs);
    }
  }
  return max;
}

function fixturesAreStale(): boolean {
  const fixturesDir = path.resolve(process.cwd(), "fixtures");
  for (const name of FIXTURE_PATHS) {
    const full = path.join(fixturesDir, name);
    if (!fs.existsSync(full)) return true;
  }

  // Find the @stash/codec workspace package and compare mtime of its
  // source vs the fixture mtimes. The codec is the only consumer of
  // @msgpack/msgpack and the only thing that affects encoded bytes;
  // any source change there invalidates the fixtures.
  const codecSrcDir = path.resolve(process.cwd(), "..", "codec", "src");
  if (!fs.existsSync(codecSrcDir)) {
    // Outside monorepo (rare): just regenerate unconditionally.
    return true;
  }
  const codecMtime = newestMtime(codecSrcDir);
  for (const name of FIXTURE_PATHS) {
    const full = path.join(fixturesDir, name);
    const fixtureMtime = fs.statSync(full).mtimeMs;
    if (codecMtime > fixtureMtime) return true;
  }
  return false;
}

export async function regenerateIfStale(force = false): Promise<void> {
  if (!force && !fixturesAreStale()) {
    process.stdout.write("fixtures up-to-date (codec older than committed fixtures)\n");
    return;
  }

  // Run generate.ts in a child process so any brotli-wasm state stays
  // out of the parent's import graph. tsx is in devDependencies.
  const here = path.dirname(new URL(import.meta.url).pathname);
  const generatePath = path.join(here, "..", "fixtures", "generate.ts");
  execFileSync("pnpm", ["exec", "tsx", generatePath], { stdio: "inherit", cwd: process.cwd() });
}
