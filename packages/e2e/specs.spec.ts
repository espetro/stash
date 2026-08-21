/**
 * Top-level entry for the Playwright + markdown-loader E2E suite.
 *
 * Loads every step implementation (register-steps.ts) so the registry
 * is populated, then `loadSpecs()` walks `specs/` and registers each
 * scenario as a `test(...)` via the per-scenario fixtures.
 *
 * Adding a new spec: drop a `.spec` markdown file into `specs/`. Adding
 * a new step: `import { step } from "../lib/step-registry"` in any
 * file under `step_implementations/`, register the handler, then add
 * the new file to `register-steps.ts`.
 */

import "./register-steps.ts";
import { loadSpecs } from "./lib/spec-loader.ts";
import * as path from "node:path";

loadSpecs(path.resolve(process.cwd(), "specs"));
