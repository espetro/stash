import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import {
  ALLOWED_EXTENSION_IDS,
  ALLOWED_ORIGINS,
  isSenderAllowed,
  startMcpServerOverPort,
} from "../lib/mcp/background-server";
import type { RuntimePort } from "../global";

// ---------------------------------------------------------------------------
// Unit tests for the allowlist predicate itself — these are cheap and don't
// require a fake-browser event.
// ---------------------------------------------------------------------------

describe("isSenderAllowed", () => {
  const port = (sender: RuntimePort["sender"]): RuntimePort =>
    ({ name: "mcp", sender } as RuntimePort);

  it("rejects a port with no sender at all", () => {
    expect(isSenderAllowed(port(undefined))).toBe(false);
  });

  it("accepts the allowlisted extension id", () => {
    expect(isSenderAllowed(port({ id: ALLOWED_EXTENSION_IDS[0] }))).toBe(true);
  });

  it("accepts the extension's own id (self connect from popup/options)", () => {
    expect(isSenderAllowed(port({ id: fakeBrowser.runtime.id }))).toBe(true);
  });

  it("rejects a foreign extension id spoofing a chrome-extension url", () => {
    expect(
      isSenderAllowed(
        port({ id: "some-other-extension", url: `chrome-extension://${fakeBrowser.runtime.id}/options/index.html` }),
      ),
    ).toBe(false);
  });

  it("rejects an extension id not on the allowlist", () => {
    expect(isSenderAllowed(port({ id: "some-other-extension" }))).toBe(false);
  });

  it.each([
    "http://localhost",
    "http://localhost:1234",
    "http://127.0.0.1",
    "http://127.0.0.1:8080",
    "https://stash.illo.fyi",
  ])("accepts the web origin %s", (origin) => {
    expect(isSenderAllowed(port({ url: origin }))).toBe(true);
  });

  it.each([
    "https://evil.com",
    "http://localhost.evil.com",
    "https://stash.illo.fyi.evil.com",
    "not-a-url",
  ])("rejects the web origin %s", (origin) => {
    expect(isSenderAllowed(port({ url: origin }))).toBe(false);
  });

  it("prefers an extension id over a web url when both are set", () => {
    expect(
      isSenderAllowed(port({ id: "some-other-extension", url: "https://stash.illo.fyi" })),
    ).toBe(false);
  });
});

describe("ALLOWED_* constants", () => {
  it("ALLOWED_EXTENSION_IDS mirrors the externally_connectable manifest", () => {
    // Tripwire: if the manifest widens, update this list (and vice-versa).
    expect(ALLOWED_EXTENSION_IDS).toContain("mhipkdochajohklmmjinmicahanmldbj");
    expect(ALLOWED_EXTENSION_IDS).not.toContain("*");
  });

  it("ALLOWED_ORIGINS covers production + localhost relay origins", () => {
    expect(ALLOWED_ORIGINS).toEqual([
      "https://stash.illo.fyi",
      "http://localhost",
      "http://127.0.0.1",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Integration: stub `browser.runtime.onConnect` (the polyfill fake-browser
// doesn't implement it), wire `defineBackground`'s listener via a small
// fixture, and assert the gating behaviour end-to-end.
// ---------------------------------------------------------------------------

type OnConnectListener = (port: RuntimePort) => void;

function installListener(
  listener: OnConnectListener,
): { trigger: (port: RuntimePort) => void; onConnect: unknown } {
  const onConnect = {
    addListener: vi.fn((cb: OnConnectListener) => {
      onConnect.lastListener = cb;
    }),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(() => false),
  } as {
    addListener: (cb: OnConnectListener) => void;
    removeListener: () => void;
    hasListener: () => void;
    hasListeners: () => boolean;
    lastListener?: OnConnectListener;
  };
  // Cast through unknown — fake-browser types omit `onConnect` entirely.
  (fakeBrowser.runtime as unknown as { onConnect: typeof onConnect }).onConnect = onConnect;

  onConnect.addListener(listener);

  return {
    onConnect,
    trigger: (port) => {
      if (!onConnect.lastListener) throw new Error("no onConnect listener registered");
      onConnect.lastListener(port);
    },
  };
}

function makePort(overrides: Partial<RuntimePort> = {}): RuntimePort {
  // Minimal stand-in for a `chrome.runtime.Port`. We only need to know
  // whether `onMessage.addListener` and `disconnect()` were called.
  const onMessageListeners: Array<(m: unknown) => void> = [];
  const onDisconnectListeners: Array<() => void> = [];
  const port: RuntimePort = {
    name: "mcp",
    postMessage: vi.fn(),
    disconnect: vi.fn(() => {
      onDisconnectListeners.forEach((cb) => cb());
    }),
    onMessage: {
      addListener: vi.fn((cb: (m: unknown) => void) => {
        onMessageListeners.push(cb);
      }),
      removeListener: vi.fn((cb: (m: unknown) => void) => {
        const i = onMessageListeners.indexOf(cb);
        if (i >= 0) onMessageListeners.splice(i, 1);
      }),
    },
    onDisconnect: {
      addListener: vi.fn((cb: () => void) => {
        onDisconnectListeners.push(cb);
      }),
      removeListener: vi.fn((cb: () => void) => {
        const i = onDisconnectListeners.indexOf(cb);
        if (i >= 0) onDisconnectListeners.splice(i, 1);
      }),
    },
    ...overrides,
  };
  return port;
}

// A minimal re-implementation of the background.ts onConnect handler. We
// don't import `defineBackground` because it's wired through WXT's module
// resolution and adds noise. Instead, we exercise the same predicate +
// transport glue that the real listener does.
function installBackgroundListener(): { trigger: (port: RuntimePort) => void } {
  // Replicates the body of the listener in `entrypoints/background.ts`.
  const listener = (port: RuntimePort) => {
    if (port.name !== "mcp") return;
    if (!isSenderAllowed(port)) {
      console.warn("[mcp] rejecting connection from untrusted sender");
      try {
        port.disconnect();
      } catch {
        // already disconnected
      }
      return;
    }
    startMcpServerOverPort(port);
  };
  return installListener(listener);
}

describe("background MCP listener sender allowlist", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeBrowser.reset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("accepts the allowlisted MCP-B extension id and wires the transport", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ sender: { id: ALLOWED_EXTENSION_IDS[0] } });

    trigger(port);

    expect(port.disconnect).not.toHaveBeenCalled();
    // `ChromePortTransport.start()` registers an onMessage listener;
    // if the handler ran, this assertion passes.
    expect(port.onMessage.addListener).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("rejects a different extension id and disconnects the port", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ sender: { id: "some-other-extension" } });

    trigger(port);

    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("accepts a localhost web sender", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ sender: { url: "http://localhost:1234" } });

    trigger(port);

    expect(port.disconnect).not.toHaveBeenCalled();
    expect(port.onMessage.addListener).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts a 127.0.0.1 web sender", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ sender: { url: "http://127.0.0.1:8080" } });

    trigger(port);

    expect(port.disconnect).not.toHaveBeenCalled();
    expect(port.onMessage.addListener).toHaveBeenCalled();
  });

  it("accepts a stash.illo.fyi web sender", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ sender: { url: "https://stash.illo.fyi/page" } });

    trigger(port);

    expect(port.disconnect).not.toHaveBeenCalled();
    expect(port.onMessage.addListener).toHaveBeenCalled();
  });

  it("rejects an evil web origin", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ sender: { url: "https://evil.com" } });

    trigger(port);

    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("rejects a port with no sender", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort(); // sender undefined

    trigger(port);

    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("accepts a same-extension sender (self connect from options page)", () => {
    const { trigger } = installBackgroundListener();
    const ownId = fakeBrowser.runtime.id;
    const port = makePort({
      sender: { id: ownId, url: `chrome-extension://${ownId}/options/index.html` },
    });

    trigger(port);

    expect(port.disconnect).not.toHaveBeenCalled();
    expect(port.onMessage.addListener).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("rejects a foreign extension id spoofing a chrome-extension url", () => {
    const { trigger } = installBackgroundListener();
    const ownId = fakeBrowser.runtime.id;
    const port = makePort({
      sender: { id: "some-other-extension", url: `chrome-extension://${ownId}/options/index.html` },
    });

    trigger(port);

    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("ignores ports with the wrong name", () => {
    const { trigger } = installBackgroundListener();
    const port = makePort({ name: "not-mcp", sender: { id: ALLOWED_EXTENSION_IDS[0] } });

    trigger(port);

    expect(port.disconnect).not.toHaveBeenCalled();
    expect(port.onMessage.addListener).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
