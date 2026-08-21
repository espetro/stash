/**
 * Per-scenario state container. Steps from the registry exchange data
 * (shareLink, decodedPayload, etc.) through this object instead of the
 * gauge `global.*` convention. A fresh container is built for each
 * scenario so tests don't leak state.
 */

import type { BrowserContext, Page } from "playwright";

export interface ScenarioState {
  /** Extension-loaded context, if the scenario needs the extension. */
  extensionContext?: BrowserContext;
  /** Plain viewer context (no extension), for pure-viewer scenarios. */
  viewerContext?: BrowserContext;
  /** The current page being driven. */
  currentPage?: Page;
  /** Pages opened during the scenario (for extension/share flows). */
  openedTabs: Page[];
  /** Last share link produced by the encoder. */
  shareLink?: string;
  /** Decoded payload from a share URL. */
  decodedPayload?: unknown;
  /** Decoded payload's item count. */
  itemCount?: number;
  /** Whether the encoder truncated to fit the URL budget. */
  truncated?: boolean;
  /** Clipboard mock: read/write happens through this object. */
  clipboard?: string;
  /** Error reported by the extension when no tabs were selected. */
  shareError?: string;
  /** Viewport to apply on the next page creation. */
  viewport?: { width: number; height: number };
  /** Free-form variables for the Get/Store/Variable steps. */
  variables: Record<string, unknown>;
}

export function createScenarioState(): ScenarioState {
  return { openedTabs: [], variables: {} };
}

/**
 * Holder for the active scenario state. Stored as a module-level variable
 * because step handlers don't have a built-in way to receive fixtures —
 * the registry is global by design (mirrors gauge's `step()` API).
 */
let _state: ScenarioState | null = null;

export function setActiveState(state: ScenarioState): void {
  _state = state;
}

export function getActiveState(): ScenarioState {
  if (!_state) {
    throw new Error(
      "No active scenario state. The fixtures layer must initialize one before any step runs.",
    );
  }
  return _state;
}

export function clearActiveState(): void {
  _state = null;
}
