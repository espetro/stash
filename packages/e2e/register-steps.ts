/**
 * Step registration entry point. Imports every step-implementation file
 * so the registry is populated. Safe to import from both the Playwright
 * entry (`specs.spec.ts`) and the dry-run validator (`lib/dry-run.ts`)
 * because it has no Playwright test fixtures.
 */

import "./step_implementations/common-steps.ts";
import "./step_implementations/codec-steps.ts";
import "./step_implementations/extension-steps.ts";
import "./step_implementations/viewer-steps.ts";
import "./step_implementations/clipboard-steps.ts";
import "./step_implementations/popup-steps.ts";
import "./step_implementations/settings-steps.ts";
import "./step_implementations/agent-flow-steps.ts";
