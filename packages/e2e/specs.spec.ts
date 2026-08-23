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

// Playwright's default registerHooks() loader chain does not run
// module.register() hooks registered later in-process (our wasm loader
// in helpers/agent-fetch-server.ts), so the viewer's vendored .wasm
// import is parsed as JS and explodes. Forcing Playwright onto its
// async loader chain keeps both coexisting. See README "Agent flow".
process.env.PLAYWRIGHT_FORCE_ASYNC_LOADER ??= "1";

loadSpecs(path.resolve(process.cwd(), "specs"));
