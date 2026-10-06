// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BRIDGE_REQUEST_TYPE,
  BRIDGE_RESPONSE_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  probeLocalBridge,
} from "@/lib/local-bridge";
import type { StashExport } from "@stash/shared/agent-export";

function makeExport(overrides: Partial<StashExport> = {}): StashExport {
  return {
    version: 1,
    source: "extension",
    stashes: [],
    ...overrides,
  };
}

function fireMessage(data: unknown, source: Window | MessageEventSource | null = window): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: "https://stash.illo.fyi",
      source,
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("probeLocalBridge — wire format", () => {
  it("posts a versioned request with a unique requestId and target '*'", async () => {
    const postSpy = vi.spyOn(window, "postMessage");

    // Reply with a matching success message so the promise resolves
    // instead of timing out.
    const probePromise = probeLocalBridge({ timeoutMs: 100 }).catch(() => undefined);
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as
        | { type: string; version: number; requestId: string }
        | undefined;
      if (!request) return;
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "ok",
        payload: makeExport(),
      });
    });

    await probePromise;

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [message, target] = postSpy.mock.calls[0]!;
    expect(message).toMatchObject({
      type: BRIDGE_REQUEST_TYPE,
      version: BRIDGE_PROTOCOL_VERSION,
    });
    expect(typeof (message as { requestId: string }).requestId).toBe("string");
    expect((message as { requestId: string }).requestId.length).toBeGreaterThan(0);
    expect(target).toBe("*");
  });
});

describe("probeLocalBridge — response handling", () => {
  it("returns { available: true, export } when the bridge replies ok with a valid StashExport", async () => {
    const postSpy = vi.spyOn(window, "postMessage");
    const validExport = makeExport({
      stashes: [
        {
          id: "abc",
          title: "hello",
          tags: ["x"],
          note: null,
          items: [{ url: "https://example.com", title: "Example" }],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });

    const probePromise = probeLocalBridge({ timeoutMs: 50 });
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as { requestId: string };
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "ok",
        payload: validExport,
      });
    });

    const result = await probePromise;
    expect(result.available).toBe(true);
    expect(result.export).toEqual(validExport);
    expect(result.error).toBeUndefined();
  });

  it("returns { available: false, error: 'invalid_payload' } when status is ok but payload fails isStashExport", async () => {
    const postSpy = vi.spyOn(window, "postMessage");

    const probePromise = probeLocalBridge({ timeoutMs: 50 });
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as { requestId: string };
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "ok",
        payload: { version: 1, source: "extension", stashes: [{ id: 1 }] },
      });
    });

    const result = await probePromise;
    expect(result.available).toBe(false);
    expect(result.error).toBe("invalid_payload");
  });

  it("returns { available: false, error } when the bridge replies with status 'error'", async () => {
    const postSpy = vi.spyOn(window, "postMessage");

    const probePromise = probeLocalBridge({ timeoutMs: 50 });
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as { requestId: string };
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "error",
        error: "replay",
      });
    });

    const result = await probePromise;
    expect(result.available).toBe(false);
    expect(result.error).toBe("replay");
  });
});

describe("probeLocalBridge — timeout", () => {
  it("returns { available: false, error: 'timeout' } when no response arrives within the timeout", async () => {
    const result = await probeLocalBridge({ timeoutMs: 5 });
    // Wait long enough that the timeout fires.
    await new Promise((r) => setTimeout(r, 25));
    expect(result.available).toBe(false);
    expect(result.error).toBe("timeout");
  });
});

describe("probeLocalBridge — message filtering", () => {
  it("ignores messages with a mismatched requestId and does not resolve", async () => {
    const postSpy = vi.spyOn(window, "postMessage");

    const probePromise = probeLocalBridge({ timeoutMs: 25 });
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as { requestId: string };
      // Reply with the wrong requestId first — should be ignored.
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: `${request.requestId}-mismatch`,
        status: "ok",
        payload: makeExport(),
      });
      // Then the matching one — should resolve.
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "ok",
        payload: makeExport(),
      });
    });

    const result = await probePromise;
    expect(result.available).toBe(true);
    expect(result.export).toEqual(makeExport());
  });

  it("ignores messages with a foreign source (not window)", async () => {
    const postSpy = vi.spyOn(window, "postMessage");

    const probePromise = probeLocalBridge({ timeoutMs: 25 });
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as { requestId: string };
      // Pass null as the source — the probe must filter it because
      // event.source !== window.
      fireMessage(
        {
          type: BRIDGE_RESPONSE_TYPE,
          version: BRIDGE_PROTOCOL_VERSION,
          requestId: request.requestId,
          status: "ok",
          payload: makeExport(),
        },
        null,
      );
    });

    // The foreign-source reply should be ignored, so we should hit timeout.
    const result = await probePromise;
    expect(result.available).toBe(false);
    expect(result.error).toBe("timeout");
  });
});

describe("probeLocalBridge — listener cleanup", () => {
  it("detaches its message listener after resolving (later messages are ignored)", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const postSpy = vi.spyOn(window, "postMessage");

    const probePromise = probeLocalBridge({ timeoutMs: 50 });
    queueMicrotask(() => {
      const request = postSpy.mock.calls[0]?.[0] as { requestId: string };
      fireMessage({
        type: BRIDGE_RESPONSE_TYPE,
        version: BRIDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        status: "ok",
        payload: makeExport(),
      });
    });

    const result = await probePromise;
    expect(result.available).toBe(true);

    // addEventListener must have registered exactly one 'message' listener.
    const messageAddCalls = addSpy.mock.calls.filter(([type]) => type === "message");
    expect(messageAddCalls).toHaveLength(1);

    // removeEventListener must have been called with the same listener fn.
    const messageRemoveCalls = removeSpy.mock.calls.filter(([type]) => type === "message");
    expect(messageRemoveCalls.length).toBeGreaterThanOrEqual(1);
    const addedFn = messageAddCalls[0]![1] as EventListener;
    const removedFn = messageRemoveCalls[0]![1] as EventListener;
    expect(removedFn).toBe(addedFn);

    // Posting another response later must not trigger anything (no listener).
    let fired = false;
    addSpy.mockImplementation((type) => {
      if (type === "message") {
        // Wrap so we can detect if a fresh listener gets installed — it shouldn't.
        fired = true;
      }
      return undefined;
    });
    fireMessage({
      type: BRIDGE_RESPONSE_TYPE,
      version: BRIDGE_PROTOCOL_VERSION,
      requestId: "anything",
      status: "ok",
      payload: makeExport(),
    });
    expect(fired).toBe(false);
  });

  it("detaches its listener on timeout as well", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const result = await probeLocalBridge({ timeoutMs: 5 });
    await new Promise((r) => setTimeout(r, 25));
    expect(result.available).toBe(false);

    const messageAddCalls = addSpy.mock.calls.filter(([type]) => type === "message");
    const messageRemoveCalls = removeSpy.mock.calls.filter(([type]) => type === "message");
    expect(messageAddCalls).toHaveLength(1);
    expect(messageRemoveCalls.length).toBeGreaterThanOrEqual(1);
  });
});
