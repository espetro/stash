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
import { DEFAULT_DAEMON_BIN } from "./helpers/mcp-daemon.ts";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function ensureDaemonBinary(): void {
  const binaryPath = path.resolve(process.env.STASH_DAEMON_BIN || DEFAULT_DAEMON_BIN);
  if (fs.existsSync(binaryPath)) return;

  const daemonDir = path.resolve(here, "../../daemon");
  const viewerDist = path.join(daemonDir, "internal/viewer/dist");
  fs.mkdirSync(viewerDist, { recursive: true });
  if (fs.readdirSync(viewerDist).length === 0) {
    fs.writeFileSync(path.join(viewerDist, ".placeholder"), "");
  }

  const goVersion = spawnSync("go", ["version"], { stdio: "ignore" });
  if (goVersion.error?.code === "ENOENT") {
    process.stderr.write("warning: Go is not on PATH; skipping automatic stash-daemon build\n");
    return;
  }
  if (goVersion.error) throw goVersion.error;
  if (goVersion.status !== 0) {
    throw new Error(`go version exited with code ${goVersion.status}`);
  }

  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  const build = spawnSync("go", ["build", "-o", binaryPath, "./cmd/stash-daemon"], {
    cwd: daemonDir,
    stdio: "inherit",
  });
  if (build.error) throw build.error;
  if (build.status !== 0) {
    throw new Error(`go build exited with code ${build.status}`);
  }
}

export default async function globalSetup(): Promise<void> {
  // The signature must return a function Playwright can call; the
  // side-effect (regenerating fixtures) is what we care about.
  await regenerateIfStale();
  ensureDaemonBinary();
}
