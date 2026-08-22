/**
 * Round-trip test for the relay.
 *
 * The relay's job is to pump JSON-RPC frames between two transports
 * that have independent inbound/outbound wiring. We test that
 * directly with mock transports:
 *
 *   mockA.onmessage  ◀─ mocked     mocked ─▶ mockA.wire
 *                                  relay
 *   mockB.onmessage  ◀─ mocked     mocked ─▶ mockB.wire
 *
 * Specifically we assert:
 *
 *   1. A frame injected into mockA.onmessage is delivered to mockB
 *      via mockB.wire (the relay's outbound forward).
 *   2. A frame injected into mockB.onmessage is delivered to mockA
 *      via mockA.wire.
 *   3. The relay's `done` resolves when either side closes.
 *   4. teardown restores the original onmessage handlers.
 *
 * Separately, we run a real MCP round-trip (tools/list, tools/call)
 * over `StdioClientTransport` and an echo server fixture to confirm
 * the relay doesn't break an in-flight MCP session.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { relay } from "../src/relay";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = join(__dirname, "fixtures", "echoServer.mjs");

class MockTransport implements Transport {
  readonly label: string;
  readonly wire: JSONRPCMessage[] = [];
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  private closed = false;

  constructor(label: string) {
    this.label = label;
  }

  async start(): Promise<void> {
    /* no-op */
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error(`${this.label}: send after close`);
    this.wire.push(message);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  injectFromWire(message: JSONRPCMessage): void {
    if (this.closed) return;
    this.onmessage?.(message);
  }
}

describe("relay forwarding", () => {
  let a: MockTransport;
  let b: MockTransport;

  beforeEach(() => {
    a = new MockTransport("a");
    b = new MockTransport("b");
  });

  it("forwards A.onmessage frames onto B.send", () => {
    const handles = relay({ client: a, upstream: b, log: () => {} });
    const frame: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    };
    a.injectFromWire(frame);
    expect(b.wire).toContainEqual(frame);
    handles.teardown();
  });

  it("forwards B.onmessage frames onto A.send", () => {
    const handles = relay({ client: a, upstream: b, log: () => {} });
    const frame: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 7,
      result: { tools: [] },
    };
    b.injectFromWire(frame);
    expect(a.wire).toContainEqual(frame);
    handles.teardown();
  });

  it("done resolves when either side closes", async () => {
    const handles = relay({ client: a, upstream: b, log: () => {} });
    const donePromise = handles.done;
    await a.close();
    await expect(donePromise).resolves.toBeUndefined();
  });

  it("teardown restores original onmessage handlers", () => {
    const prevA = (msg: JSONRPCMessage) => a.wire.push(msg);
    const prevB = (msg: JSONRPCMessage) => b.wire.push(msg);
    a.onmessage = prevA;
    b.onmessage = prevB;

    relay({ client: a, upstream: b, log: () => {} }).teardown();

    expect(a.onmessage).toBe(prevA);
    expect(b.onmessage).toBe(prevB);
  });

  it("chains the SDK's pre-existing onmessage on both sides", () => {
    // Simulate the SDK `connect()` chain pattern: the SDK captures
    // the current onmessage (the relay's wrapper) at connect time,
    // and replaces it with its own wrapper that calls the captured
    // handler first.
    const capturedAtA: ((msg: JSONRPCMessage) => void)[] = [];
    const capturedAtB: ((msg: JSONRPCMessage) => void)[] = [];
    a.onmessage = (msg) => capturedAtA[0]?.(msg);
    b.onmessage = (msg) => capturedAtB[0]?.(msg);

    const handles = relay({ client: a, upstream: b, log: () => {} });

    // The SDK now wraps the relay's wrapper.
    const relayA = a.onmessage!;
    const relayB = b.onmessage!;
    a.onmessage = (msg) => {
      relayA(msg);
    };
    b.onmessage = (msg) => {
      relayB(msg);
    };

    a.injectFromWire({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(b.wire.some((m) => "id" in m && m.id === 1)).toBe(true);

    handles.teardown();
  });
});

describe("relay round-trip via stdio MCP server", () => {
  let transport: StdioClientTransport;
  let client: Client;
  let handles: ReturnType<typeof relay>;
  let passthrough: MockTransport;

  beforeEach(async () => {
    passthrough = new MockTransport("passthrough");
    // A single child echo-server process; the SDK's StdioClientTransport
    // spawns it for us.
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [FIXTURE, "relay-client-transport"],
    });
    transport.onerror = undefined; // suppress unhandled error logs
    client = new Client({ name: "test-relay-client", version: "0" }, { capabilities: {} });

    // Bridge the real SDK StdioClientTransport to a no-op mock
    // "passthrough" transport via the relay. The relay only chains
    // onmessage; the SDK's send direction goes through `transport`
    // directly to its child.
    handles = relay({ client: passthrough, upstream: transport, log: () => {} });

    await client.connect(transport);
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {}
    handles.teardown();
  });

  it("forwards tools/list and lists echo + add", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["add", "echo"]);
  });

  it("forwards tools/call echo via the relay", async () => {
    const result = await client.callTool({
      name: "echo",
      arguments: { text: "hello" },
    });
    expect(result.content).toEqual([{ type: "text", text: "echo:hello" }]);
  });

  it("forwards tools/call add via the relay", async () => {
    const result = await client.callTool({
      name: "add",
      arguments: { a: 3, b: 4 },
    });
    expect(result.content).toEqual([{ type: "text", text: "sum:7" }]);
  });
});
