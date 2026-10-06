import { defineConfig, devices } from "@playwright/test";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const isCI = !!process.env.CI;

// Resolve the workspace root for webServer spawning. `astro preview`
// must run from the viewer package, not the repo root, so we cd
// via `--filter`.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const VIEWER_PORT = 4321;

export default defineConfig({
  testDir: ".",
  testMatch: /specs\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: isCI
    ? [["github"], ["list"], ["./lib/runtime-conformance-reporter.ts"]]
    : [["list"], ["./lib/runtime-conformance-reporter.ts"]],
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  globalSetup: "./global-setup.ts",
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    baseURL: `http://localhost:${VIEWER_PORT}`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build + preview the viewer from its package so we test the
    // production bundle rather than the dev server. This:
    //   1. Skips the Astro dev toolbar injection that pollutes shadow
    //      DOM with `<a target="_blank">` anchors.
    //   2. Mirrors what real users hit on `stash.illo.fyi`.
    //   3. Is the only server lifecycle we need Playwright to manage —
    //      no `nohup`/`disown` ritual.
    command: `pnpm --filter stash-viewer exec astro build && pnpm --filter stash-viewer exec astro preview --port ${VIEWER_PORT}`,
    cwd: REPO_ROOT,
    url: `http://localhost:${VIEWER_PORT}/s/`,
    timeout: 180_000,
    reuseExistingServer: !isCI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
