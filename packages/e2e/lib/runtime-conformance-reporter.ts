/**
 * Playwright reporter: after the `@runtime`-tagged scenarios from
 * `specs/agent-runtime-conformance.spec` run, write
 * `reports/runtime-conformance.json` describing which runtime was
 * exercised and whether each scenario passed.
 *
 * Implemented as a reporter (not a per-scenario fixture/hook) because
 * `spec-loader.ts` generates tests dynamically from markdown — there's
 * no stable place to hang an `afterAll` inside the spec itself without
 * touching the loader. A reporter observes every test regardless of
 * how it was registered, and runs in the same process as the rest of
 * the CLI output, so it needs no cross-process state from the step
 * implementations.
 *
 * `onTestEnd` only tracks pass/fail per scenario (title -> id lookup);
 * `onEnd` launches its own short-lived browser (same
 * executable/headless settings as the suite, via `browserExecutablePath()`)
 * purely to read `browser.version()` / `navigator.userAgent` for the
 * report header — cheaper than plumbing that data out of the actual
 * test run.
 */

import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright";
import { browserExecutablePath, browserLabel, headless } from "../helpers/browser-helper";

const SCENARIO_IDS: Record<string, string> = {
  "Extension loads": "extension-loads",
  "MCP seed path works": "mcp-seed",
  "Content script injects": "content-script-injects",
  "Island reaches ready": "island-ready",
  "Agent views render": "agent-views-render",
};

const RUNTIME_TAG_SUFFIX = " [runtime]";

interface ScenarioResult {
  id: string;
  status: "pass" | "fail" | "skipped";
}

export default class RuntimeConformanceReporter implements Reporter {
  private results: ScenarioResult[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!test.title.endsWith(RUNTIME_TAG_SUFFIX)) return;
    const scenarioTitle = test.title.slice(0, -RUNTIME_TAG_SUFFIX.length);
    const id = SCENARIO_IDS[scenarioTitle];
    if (!id) return; // Not one of ours — some other `[runtime]`-tagged spec.
    const status: ScenarioResult["status"] =
      result.status === "passed" ? "pass" : result.status === "skipped" ? "skipped" : "fail";
    this.results.push({ id, status });
  }

  async onEnd(): Promise<void> {
    if (this.results.length === 0) return;

    let version = "unknown";
    let userAgent = "unknown";
    try {
      const execPath = browserExecutablePath();
      const browser = await chromium.launch({
        ...(execPath ? { executablePath: execPath } : { channel: "chromium" as const }),
        headless: headless(),
      });
      version = browser.version();
      const page = await browser.newPage();
      userAgent = await page.evaluate(() => navigator.userAgent);
      await browser.close();
    } catch {
      // Report still has value without version/userAgent — don't fail
      // the whole write over a probe-browser launch error.
    }

    const report = {
      runtime: browserLabel(),
      version,
      userAgent,
      results: this.results,
    };

    const outDir = path.resolve(process.cwd(), "reports");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "runtime-conformance.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
