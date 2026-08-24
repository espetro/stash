import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

import bridge from "../entrypoints/stashes-bridge.content";
import { createStash } from "../lib/stash-store";
import * as settingsModule from "../lib/settings";
import { LOCAL_LIBRARY_VIEWER_ORIGINS } from "../lib/settings";

const ALLOWED = LOCAL_LIBRARY_VIEWER_ORIGINS[0]; // https://stash.illo.fyi
const REQUEST_TYPE = "stash:viewer:request";
const RESPONSE_TYPE = "stash:viewer:response";

/** Run the bridge's `main()` and give its async gate one tick to settle. */
async function startBridge(): Promise<void> {
  // The content-script receives a `ContentScriptContext` from WXT; we don't
  // exercise its abilities here, so an empty cast is fine.
  const detach = await bridge.main({} as unknown as ContentScriptContext);
  if (typeof detach === "function") {
    // Stash the teardown for afterEach via a side-channel.
    bridgeDetach = detach;
  }
  // Flush microtasks queued by the `await enabled` path.
  await new Promise((r) => setTimeout(r, 0));
}

let bridgeDetach: (() => void) | undefined;

interface PostedMessage {
  type: string;
  version: number;
  requestId: string;
  status: string;
  payload?: unknown;
  error?: string;
}

/**
 * Capture `window.postMessage` calls so we can assert the bridge's reply
 * shape without relying on the real DOM round-trip.
 */
function spyPostMessage() {
  const calls: Array<{ message: unknown; targetOrigin: string }> = [];
  const spy = vi.spyOn(window, "postMessage").mockImplementation(((
    message: unknown,
    targetOrigin: string,
  ) => {
    calls.push({ message, targetOrigin });
  }) as unknown as typeof window.postMessage);
  return { calls, spy };
}

function dispatchMessage(data: unknown, overrides: Partial<MessageEventInit> = {}): void {
  const event = new MessageEvent("message", {
    data,
    origin: ALLOWED,
    source: window as unknown as MessageEvent["source"],
    ...overrides,
  });
  Object.defineProperty(event, "source", { value: overrides.source ?? window });
  Object.defineProperty(event, "origin", { value: overrides.origin ?? ALLOWED });
  Object.defineProperty(event, "data", { value: data });
  window.dispatchEvent(event);
}

describe("stashes-bridge", () => {
  beforeEach(() => {
    bridgeDetach = undefined;
    fakeBrowser.reset();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    // Detach the bridge from previous tests so we don't accumulate handlers.
    bridgeDetach?.();
    bridgeDetach = undefined;
  });

  it("registers no message listener when the setting is disabled", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: false,
    });
    const addSpy = vi.spyOn(window, "addEventListener");

    await startBridge();
    // The content-script bootstrap does not register the message listener.
    expect(addSpy).not.toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("registers a message listener when the setting is enabled", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const addSpy = vi.spyOn(window, "addEventListener");

    await startBridge();
    expect(addSpy).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("ignores messages whose source is not the current window", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const { spy, calls } = spyPostMessage();
    await startBridge();

    const otherWindow = {} as Window;
    const event = new MessageEvent("message", {
      data: { type: REQUEST_TYPE, version: 1, requestId: "x1" },
    });
    Object.defineProperty(event, "source", { value: otherWindow });
    Object.defineProperty(event, "origin", { value: ALLOWED });
    Object.defineProperty(event, "data", {
      value: { type: REQUEST_TYPE, version: 1, requestId: "x1" },
    });
    window.dispatchEvent(event);

    expect(calls).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores messages from origins not in LOCAL_LIBRARY_VIEWER_ORIGINS", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const { calls } = spyPostMessage();
    await startBridge();

    dispatchMessage(
      { type: REQUEST_TYPE, version: 1, requestId: "x2" },
      { origin: "https://evil.example" },
    );
    expect(calls).toHaveLength(0);
  });

  it("ignores malformed payloads (no type)", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const { calls } = spyPostMessage();
    await startBridge();

    dispatchMessage({ foo: "bar" });
    expect(calls).toHaveLength(0);
  });

  it("rejects payloads with a wrong protocol version (reply status=error)", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const { calls } = spyPostMessage();
    await startBridge();

    dispatchMessage({ type: REQUEST_TYPE, version: 2, requestId: "x3" });
    await new Promise((r) => setTimeout(r, 0));

    // The bridge replies with status="error" because the requestId is
    // present — only fully-unrecognised messages (no requestId) are
    // silently dropped.
    expect(calls).toHaveLength(1);
    const reply = calls[0].message as PostedMessage;
    expect(reply.status).toBe("error");
    expect(reply.error).toBe("malformed_request");
    expect(reply.requestId).toBe("x3");
  });

  it("replays the same requestId only once (second reply signals error)", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    await createStash({
      title: "Reading list",
      tags: ["r"],
      items: [{ url: "https://example.com", title: "Example" }],
    });
    const { calls } = spyPostMessage();
    await startBridge();

    const req = { type: REQUEST_TYPE, version: 1, requestId: "replay-1" };
    dispatchMessage(req);

    await new Promise((r) => setTimeout(r, 0));
    dispatchMessage(req);
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toHaveLength(2);
    const first = calls[0].message as PostedMessage;
    const second = calls[1].message as PostedMessage;
    expect(first.status).toBe("ok");
    expect(second.status).toBe("error");
    expect(second.error).toBe("replay");
    expect(second.requestId).toBe("replay-1");
    void first.payload;
  });

  it("replies with status='ok' and a versioned StashExport matching listStashes", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const seeded = await createStash({
      title: "Reading list",
      tags: ["research"],
      note: "for later",
      items: [
        { url: "https://example.com", title: "Example" },
        { url: "https://example.org", title: "Org" },
      ],
    });
    const { calls } = spyPostMessage();
    await startBridge();

    dispatchMessage({ type: REQUEST_TYPE, version: 1, requestId: "ok-1" });
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toHaveLength(1);
    const reply = calls[0].message as PostedMessage;
    expect(calls[0].targetOrigin).toBe(ALLOWED);
    expect(reply.type).toBe(RESPONSE_TYPE);
    expect(reply.version).toBe(1);
    expect(reply.status).toBe("ok");
    expect(reply.requestId).toBe("ok-1");
    expect(reply.error).toBeUndefined();

    const payload = reply.payload as {
      version: number;
      source: string;
      stashes: Array<{ id: string; title: string | null; tags: string[]; note: string | null }>;
    };
    expect(payload.version).toBe(1);
    expect(payload.source).toBe("extension");
    expect(payload.stashes).toHaveLength(1);
    expect(payload.stashes[0].id).toBe(seeded.id);
    expect(payload.stashes[0].title).toBe("Reading list");
    expect(payload.stashes[0].tags).toEqual(["research"]);
    expect(payload.stashes[0].note).toBe("for later");
  });

  it("never invokes a storage setter or localStorage.setItem", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    await createStash({
      items: [{ url: "https://example.com", title: "Example" }],
    });
    const localSetSpy = vi.spyOn(fakeBrowser.storage.local, "set");
    const syncSetSpy = vi.spyOn(fakeBrowser.storage.sync, "set");
    const lsSpy = vi.spyOn(window.localStorage.__proto__, "setItem");
    const { calls } = spyPostMessage();
    await startBridge();

    dispatchMessage({ type: REQUEST_TYPE, version: 1, requestId: "ok-2" });
    await new Promise((r) => setTimeout(r, 0));

    expect(localSetSpy).not.toHaveBeenCalled();
    expect(syncSetSpy).not.toHaveBeenCalled();
    expect(lsSpy).not.toHaveBeenCalled();
    // …but it did reply.
    expect(calls).toHaveLength(1);
  });

  it("tears down via the returned detach function", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      expiryMode: "never",
      viewerOrigin: ALLOWED,
      shortenerOrigin: "https://s.illo.fyi",
      shortenerEnabled: false,
      telemetryEnabled: false,
      localLibraryViewerEnabled: true,
    });
    const removeSpy = vi.spyOn(window, "removeEventListener");
    await startBridge();
    // After `main()` resolves, `detach` is the returned function.
    // It is wired to removeEventListener when invoked.
    expect(bridgeDetach).toBeTypeOf("function");
    bridgeDetach!();
    expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
