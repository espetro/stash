/**
 * Dry-run validator: parse every spec, match every step against the
 * registry, fail fast on the first unmatched step.
 *
 * This is the agent-facing equivalent of the old `gauge validate`. It
 * runs in well under a second — no browser launch, no dev server — so
 * step/spec drift surfaces locally instead of after a three-minute CI
 * cycle. Wire it as `validate:steps` in `package.json` and as part of
 * `pnpm validate`.
 *
 * Spec file discovery mirrors `loadSpecs` (the `.spec` and `.md` files
 * under `specs/`). Step registrations are loaded by importing
 * `specs.spec.ts`'s side-effects chain; if anything new registers a
 * step under a different path, update the import here too.
 */

import { findAmbiguousSteps, listSteps, matchStep } from "./step-registry.ts";
import { parseSpec } from "./spec-loader.ts";
import * as fs from "node:fs";
import * as path from "node:path";

interface StepFailure {
  file: string;
  line: number;
  text: string;
}

interface DryRunResult {
  specs: number;
  scenarios: number;
  steps: number;
  failures: StepFailure[];
  ambiguities: { key: string; texts: string[] }[];
}

export function validateSpecs(specsDir: string): DryRunResult {
  if (!fs.existsSync(specsDir)) {
    throw new Error(`specs directory not found: ${specsDir}`);
  }
  const files = fs
    .readdirSync(specsDir)
    .filter((f) => f.endsWith(".spec") || f.endsWith(".md"))
    .sort();

  const failures: StepFailure[] = [];
  let scenarios = 0;
  let steps = 0;

  for (const file of files) {
    const full = path.join(specsDir, file);
    const source = fs.readFileSync(full, "utf-8");
    const parsed = parseSpec(full, source);
    for (const scenario of parsed.scenarios) {
      scenarios++;
      for (let i = 0; i < scenario.steps.length; i++) {
        steps++;
        const text = scenario.steps[i];
        const line = scenario.line + 1 + i;
        const match = matchStep(text);
        if (!match) {
          failures.push({ file, line, text });
        }
      }
    }
  }

  // Two entries with identical compiled regex resolve arbitrarily at
  // runtime — that's a real ambiguity worth flagging at lint time.
  const ambMap = findAmbiguousSteps();
  const ambiguities = [...ambMap.entries()].map(([key, list]) => ({
    key,
    texts: [...new Set(list.map((e) => e.text))].sort(),
  }));

  return { specs: files.length, scenarios, steps, failures, ambiguities };
}

function formatReport(result: DryRunResult): string {
  const lines: string[] = [];
  lines.push(
    `validate:steps — ${result.specs} spec(s), ${result.scenarios} scenario(s), ${result.steps} step(s)`,
  );
  if (result.ambiguities.length === 0) {
    lines.push("  ambiguities: none");
  } else {
    lines.push(`  ambiguities: ${result.ambiguities.length}`);
    for (const a of result.ambiguities) {
      lines.push(`    ${a.texts.join("  vs.  ")}`);
    }
  }
  if (result.failures.length === 0) {
    lines.push("  unresolved steps: none");
  } else {
    lines.push(`  unresolved steps: ${result.failures.length}`);
    for (const f of result.failures) {
      lines.push(`    ${f.file}:${f.line}  '${f.text}'`);
    }
  }
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Side-effect import to populate the step registry (no Playwright fixtures).
  await import("../register-steps.ts");
  const specsDir = path.resolve(process.cwd(), "specs");
  const result = validateSpecs(specsDir);
  process.stdout.write(`${formatReport(result)}\n`);
  if (result.failures.length > 0 || result.ambiguities.length > 0) {
    process.exitCode = 1;
  } else {
    process.stdout.write(`\n${listSteps().length} unique step text(s) registered.\n`);
  }
}
