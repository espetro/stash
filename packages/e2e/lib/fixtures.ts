/**
 * Test fixtures for the E2E suite.
 *
 * Provides a `state` fixture that gives each scenario a fresh
 * `ScenarioState`. The extension-loaded browser context is created on
 * demand by the "browser is launched with the Stash extension loaded"
 * step (see extension-steps.ts) and stashed on the state object so
 * subsequent steps in the same scenario can reuse it.
 *
 * Reusing one context per scenario is the wall-clock / memory win
 * called out in the plan: scenarios that previously launched a fresh
 * `launchPersistentContext` per step now share a single one. The
 * context's life cycle ends when the scenario's last step finishes.
 */

import { test as base } from "@playwright/test";
import { createScenarioState, setActiveState, clearActiveState } from "./scenario-state";
import type { ScenarioState } from "./scenario-state";

interface TestFixtures {
  state: ScenarioState;
}

export const test = base.extend<TestFixtures>({
  state: async ({}, use) => {
    const state = createScenarioState();
    setActiveState(state);
    try {
      await use(state);
    } finally {
      // Close any contexts the scenario left open before discarding
      // the state. The encoder doesn't open one; only extension-steps
      // and viewer-steps do.
      if (state.extensionContext) {
        await state.extensionContext.close().catch(() => undefined);
      }
      if (state.viewerContext) {
        await state.viewerContext.close().catch(() => undefined);
      }
      clearActiveState();
    }
  },
});
