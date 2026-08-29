import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "./frames";
import { NativeTransport, type NativePort } from "./native-transport";

interface Harness {
  transport: NativeTransport;
  ports: FakePort[];
  frames: Frame[];
  statuses: string[];
  connect: () => NativePort;
}

class FakePort implements NativePort {
  messageListeners = new Set<(m: unknown) => void>();
  disconnectListeners = new Set<() => void>();
  sent: string[] = [];
  disconnected = false;

  postMessage(message: unknown): void {
    this.sent.push(message as string);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  onMessage = {
    addListener: (fn: (m: unknown) => void) => this.messageListeners.add(fn),
    removeListener: (fn: (m: unknown) => void) => this.messageListeners.delete(fn),
  };
  onDisconnect = {
    addListener: (fn: () => void) => this.disconnectListeners.add(fn),
    removeListener: (fn: () => void) => this.disconnectListeners.delete(fn),
  };
  emit(frame: Frame): void {
    for (const fn of this.messageListeners) fn(encodeFrame(frame));
  }
  kill(): void {
    for (const fn of this.disconnectListeners) fn();
  }
}

function makeHarness(opts?: { delay?: number }): Harness {
  const ports: FakePort[] = [];
  const frames: Frame[] = [];
  const statuses: string[] = [];
  const connect = () => {
    const port = new FakePort();
    ports.push(port);
    return port;
  };
  const transport = new NativeTransport({
    hostName: "io.illo.stash",
    connect,
    reconnectDelayMs: opts?.delay ?? 0,
    mintCorrelationId: () => "ext-test0001",
    onFrame: (f) => frames.push(f),
    onStatus: (s) => statuses.push(s),
  });
  return { transport, ports, frames, statuses, connect };
}

describe("NativeTransport", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects and marks status connected", () => {
    const h = makeHarness();
    h.transport.connect();
    expect(h.transport.getStatus()).toBe("connected");
    expect(h.ports).toHaveLength(1);
  });

  it("connect is idempotent (no duplicate ports)", () => {
    const h = makeHarness();
    h.transport.connect();
    h.transport.connect();
    h.transport.connect();
    expect(h.ports).toHaveLength(1);
  });

  it("sends newline-delimited frames", () => {
    const h = makeHarness();
    h.transport.connect();
    h.transport.send({
      type: "hello",
      correlationId: "ext-test0001",
      payload: {
        protocolVersion: "1.0.0",
        supportedRange: ">=1.0.0 <2.0.0",
        extension: { name: "Stash", version: "0.9.0" },
      },
    });
    expect(h.ports[0].sent[0]).toMatch(/\n$/);
    expect(JSON.parse(h.ports[0].sent[0]).type).toBe("hello");
  });

  it("emits parsed frames from port messages", () => {
    const h = makeHarness();
    h.transport.connect();
    h.ports[0].emit({
      type: "opResult",
      correlationId: "daemon-r1",
      payload: { result: { ok: true } },
    });
    expect(h.frames).toHaveLength(1);
    expect(h.frames[0].correlationId).toBe("daemon-r1");
  });

  it("reconnects on disconnect with a fresh port", () => {
    const h = makeHarness();
    h.transport.connect();
    h.ports[0].kill();
    expect(h.transport.getStatus()).toBe("disconnected");
    vi.runAllTimers();
    expect(h.ports).toHaveLength(2);
    expect(h.transport.getStatus()).toBe("connected");
  });

  it("double onDisconnect does not schedule duplicate reconnects", () => {
    const h = makeHarness({ delay: 100 });
    h.transport.connect();
    h.ports[0].kill();
    h.ports[0].kill(); // double fire
    h.transport.connect(); // racing call
    vi.runAllTimers();
    vi.runAllTimers();
    expect(h.ports).toHaveLength(2); // exactly one reconnect
  });

  it("dispose stops reconnects", () => {
    const h = makeHarness();
    h.transport.connect();
    h.transport.dispose();
    vi.runAllTimers();
    expect(h.ports).toHaveLength(1);
    expect(h.transport.getStatus()).toBe("disconnected");
  });

  it("holds no per-flight state: frames survive port swap via correlation ids", () => {
    const h = makeHarness();
    h.transport.connect();
    const f = h.transport.minted("op", { tool: "stash_list", args: {} });
    h.transport.send(f);
    h.ports[0].kill();
    vi.runAllTimers();
    h.ports[1].emit({
      type: "opResult",
      correlationId: f.correlationId,
      payload: { result: [] },
    });
    expect(h.frames[0].correlationId).toBe("ext-test0001");
  });

  it("minted() mints ext-origin correlation ids", () => {
    const h = makeHarness();
    expect(h.transport.minted("op", {}).correlationId).toMatch(/^ext-/);
  });
});
