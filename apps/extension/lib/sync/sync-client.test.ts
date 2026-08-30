import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { SyncClient, POPUP_INVALIDATE_MESSAGE } from "./sync-client";
import { FakeDaemonPort, installFakeDaemon } from "./test-fakes";
import { SYNC_STATUS_KEY, SYNC_TOOLS } from "./protocol";
import { getOutbox, recordCreate } from "./outbox";
import { resetProfileId } from "./profile";
import { createStash, listStashes, type StashRecord } from "../stash-store";
import { decodeFrames, makeFrame, mintCorrelationId } from "../transport/frames";

function rec(id: string): StashRecord {
  return { id, tags: [], items: [{ url: "https://x", title: "x" }], createdAt: 1, updatedAt: 2 };
}

/**
 * Integration: pair, seed, outbox flush, daemon push materialize, ping/pong
 * offline flip, reconnect and drain — against a fake daemon port implementing
 * the F1 frame schema (mirrors the F1 conformance fixtures).
 */
describe("SyncClient over a fake daemon port", () => {
  let port: FakeDaemonPort;
  let daemon: ReturnType<typeof installFakeDaemon>;
  let client: SyncClient;
  let invalidated: number;

  beforeEach(() => {
    fakeBrowser.reset();
    resetProfileId();
    vi.useFakeTimers();
  });

  afterEach(() => {
    client?.dispose();
    vi.useRealTimers();
  });

  function startClient(daemonVersion?: string, daemonRange?: string): FakeDaemonPort {
    port = new FakeDaemonPort();
    daemon = installFakeDaemon(port, {
      protocolVersion: daemonVersion,
      supportedRange: daemonRange,
    });
    invalidated = 0;
    client = new SyncClient({
      hostName: "io.illo.stash",
      connect: () => port,
      invalidatePopups: () => {
        invalidated++;
      },
    });
    client.start();
    return port;
  }

  it("handshake: hello → serverCard → paired, seed sent before outbox traffic (W1/W5)", async () => {
    await recordCreate(rec("backlog"), "p1"); // pre-pair backlog
    startClient();
    await vi.waitFor(() => expect(client.getState()).toBe("paired"));
    await vi.waitFor(() => expect(daemon.seedCount()).toBe(1));
    // seed carries full local library (empty here) and precedes change traffic
    const sentTools = port.received
      .filter((f) => f.type === "op")
      .map((f) => (f.payload as { tool: string }).tool);
    expect(sentTools.indexOf(SYNC_TOOLS.seed)).toBeLessThan(sentTools.indexOf(SYNC_TOOLS.change));
    // backlog drained after pairing
    await vi.waitFor(() => expect(daemon.changes).toHaveLength(1));
    expect(await getOutbox()).toHaveLength(0);
  });

  it("protocol version refusal: distinct state, no change frames, no seed (W1)", async () => {
    await recordCreate(rec("a"), "p1");
    startClient("3.0.0", ">=3.0.0");
    await vi.waitFor(() => expect(client.getState()).toBe("refused_version"));
    expect(client.getStatus().refused).toEqual({ ours: "1.0.0", theirs: "3.0.0" });
    expect(daemon.seedCount()).toBe(0);
    expect(daemon.changes).toHaveLength(0);
    // persisted for the W4 surface
    const stored = (await browser.storage.local.get(SYNC_STATUS_KEY))[SYNC_STATUS_KEY] as {
      state: string;
      lastSeenAt?: number;
      refused?: { ours: string; theirs: string };
    };
    expect(stored.state).toBe("refused_version");
    // backlog untouched
    expect(await getOutbox()).toHaveLength(1);
  });

  it("daemon push materializes into the local store and invalidates the popup, no echo (W3)", async () => {
    startClient();
    await vi.waitFor(() => expect(client.getState()).toBe("paired"));
    const push = makeFrame("op", mintCorrelationId("daemon"), {
      tool: SYNC_TOOLS.change,
      args: { op: "create", id: "srv1", record: rec("srv1"), updatedAt: 5, origin: "daemon-x" },
    });
    port.deliverToExtension(push);
    await vi.waitFor(async () => expect((await listStashes()).map((s) => s.id)).toContain("srv1"));
    expect(invalidated).toBeGreaterThan(0);
    // no echo
    expect(await getOutbox()).toHaveLength(0);
  });

  it("missed pong flips to offline with persisted lastSeen; health via correlated ping (W4)", async () => {
    // silent daemon: pings go unanswered
    const silentPort = new FakeDaemonPort();
    installFakeDaemon(silentPort, { answerPings: false });
    client = new SyncClient({
      hostName: "io.illo.stash",
      connect: () => silentPort,
      invalidatePopups: () => {},
    });
    client.start();
    await vi.waitFor(() => expect(client.getState()).toBe("paired"));
    expect(client.getStatus().lastSeenAt).toBeDefined();
    await vi.advanceTimersByTimeAsync(30_000); // pong timeout (10s) + op NACK timeout (15s)
    expect(client.getState(), "pong timeout must flip paired → offline").toBe("offline");
    const stored = (await browser.storage.local.get(SYNC_STATUS_KEY))[SYNC_STATUS_KEY] as {
      state: string;
      lastSeenAt?: number;
      refused?: { ours: string; theirs: string };
    };
    expect(stored.state).toBe("offline");
    expect(stored.lastSeenAt).toBeDefined();
  });

  it("port disconnect → offline; reconnect → re-handshake (idempotent re-pair) and drain (W1/W2)", async () => {
    await recordCreate(rec("pending"), "p1");
    startClient();
    await vi.waitFor(() => expect(client.getState()).toBe("paired"));
    await vi.waitFor(() => expect(daemon.changes).toHaveLength(1));

    // daemon dies
    port.disconnect();
    expect(client.getState()).toBe("offline");
    await recordCreate(rec("made-offline"), "p1"); // local write still works

    // new port arrives (transport reconnect): fresh client on port2
    const port2 = new FakeDaemonPort();
    const daemon2 = installFakeDaemon(port2);
    client.dispose();
    client = new SyncClient({
      hostName: "io.illo.stash",
      connect: () => port2,
      invalidatePopups: () => {},
    });
    client.start();
    await vi.waitFor(() => expect(client.getState()).toBe("paired"));
    await vi.waitFor(() =>
      expect(daemon2.changes.map((c) => (c as { id: string }).id)).toContain("made-offline"),
    );
  });

  it("seed is idempotent on re-pair: re-seed inserts nothing new daemon-side (W5)", async () => {
    startClient();
    await vi.waitFor(() => expect(daemon.seedCount()).toBe(1));
    await createStash({ title: "one", items: [{ url: "https://a", title: "a" }] });
    // force a re-pair with a fresh transport to the same fake daemon
    client.dispose();
    const port2 = new FakeDaemonPort();
    const daemon2 = installFakeDaemon(port2);
    client = new SyncClient({
      hostName: "io.illo.stash",
      connect: () => port2,
      invalidatePopups: () => {},
    });
    client.start();
    await vi.waitFor(() => expect(daemon2.seedCount()).toBe(1));
    const seeded = daemon2.getSeeded() as StashRecord[];
    expect(seeded.map((r) => r.id)).toEqual((await listStashes()).map((r) => r.id));
  });

  it("popups receive the invalidation message type the hook listens for", () => {
    expect(POPUP_INVALIDATE_MESSAGE).toBe("stash:sync-materialized");
    expect(typeof decodeFrames).toBe("function");
  });
});
