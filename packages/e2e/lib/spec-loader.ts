/**
 * Spec loader: parses `.spec`/`.md` files into Playwright test suites.
 *
 * Spec format:
 *   # Title                    -> test.describe("Title", ...)
 *   ## Scenario: ...           -> test("...", async ({}, info) => ...)
 *   * Step text <a> "b"        -> calls into the step registry
 *
 * Tags: a single line `tags: smoke, regression` directly under a
 * `## Scenario:` heading. If absent, the test is untagged.
 *
 * The loader is intentionally tiny: no programmatic `require('typescript')`,
 * no Gauge compatibility layer, just a markdown parser + a regex matcher
 * + Playwright `test.describe`/`test` calls.
 */

import { test } from "./fixtures";
import type { ScenarioState } from "./scenario-state";
import * as fs from "node:fs";
import * as path from "node:path";
import { matchStep, listSteps } from "./step-registry";

interface ParsedSpec {
  file: string;
  title: string;
  scenarios: ParsedScenario[];
}

interface ParsedScenario {
  title: string;
  steps: string[];
  tags: string[];
  line: number;
}

const HEADING_RE = /^(#{1,3})\s+(.*?)\s*$/;
const STEP_RE = /^\*\s+(.+?)\s*$/;
const TAGS_LINE_RE = /^(?:tags|Tags):\s*(.+?)\s*$/;

/**
 * Parse a single spec file into a title + list of scenarios.
 */
export function parseSpec(file: string, source: string): ParsedSpec {
  const lines = source.split(/\r?\n/);
  let title = path.basename(file, path.extname(file));
  const scenarios: ParsedScenario[] = [];
  let current: ParsedScenario | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1) {
        title = text;
        continue;
      }
      // level 2 -> new scenario, level 3 -> scenario sub-heading ignored
      if (level === 2) {
        if (current) scenarios.push(current);
        const scenarioTitle = text.replace(/^Scenario:\s*/i, "").trim();
        current = {
          title: scenarioTitle,
          steps: [],
          tags: [],
          line: i + 1,
        };
        continue;
      }
    }

    if (!current) continue;

    const stepMatch = STEP_RE.exec(line);
    if (stepMatch) {
      current.steps.push(stepMatch[1]);
      continue;
    }

    const tagsMatch = TAGS_LINE_RE.exec(line);
    if (tagsMatch) {
      current.tags = tagsMatch[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  if (current) scenarios.push(current);
  return { file, title, scenarios };
}

/**
 * Load and register every spec file under the given directory.
 * Returns the number of (describe, test) calls actually made.
 */
export function loadSpecs(dir: string): number {
  if (!fs.existsSync(dir)) {
    throw new Error(`specs directory not found: ${dir}`);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".spec") || f.endsWith(".md"))
    .sort();

  let registered = 0;
  for (const file of files) {
    const full = path.join(dir, file);
    const source = fs.readFileSync(full, "utf-8");
    const parsed = parseSpec(full, source);
    if (parsed.scenarios.length === 0) continue;
    registerSpec(parsed);
    registered += parsed.scenarios.length;
  }
  return registered;
}

function registerSpec(parsed: ParsedSpec): void {
  test.describe(parsed.title, () => {
    for (const scenario of parsed.scenarios) {
      const testName =
        scenario.tags.length > 0
          ? `${scenario.title} [${scenario.tags.join(", ")}]`
          : scenario.title;
      // Pull `state` from the fixtures so the per-scenario state container
      // is installed before any step handler runs. The step registry reads
      // it via the module-level `getActiveState()` accessor.
      test(testName, async ({ state }: { state: ScenarioState }) => {
        void state;
        await runScenario(parsed, scenario);
      });
    }
  });
}

async function runScenario(parsed: ParsedSpec, scenario: ParsedScenario): Promise<void> {
  for (let i = 0; i < scenario.steps.length; i++) {
    const stepText = scenario.steps[i];
    const line = scenario.line + 1 + i; // approximate step line
    const match = matchStep(stepText);
    if (!match) {
      throw new Error(
        `No step matching: '${stepText}'\n  in ${parsed.file}:${line}\n  registered steps:\n    ${listSteps().join("\n    ")}`,
      );
    }
    try {
      await match.entry.handler(...match.params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Step failed: '${stepText}'\n  in ${parsed.file}:${line}\n  cause: ${msg}`);
    }
  }
}

/**
 * Convenience: load specs from a directory relative to the e2e package.
 */
export function loadSpecsFromDefault(): number {
  return loadSpecs(path.resolve(process.cwd(), "specs"));
}
