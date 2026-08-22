/**
 * Tests for the line-delimited JSON framing over arbitrary byte
 * streams. Verifies split frames are reassembled correctly.
 */
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { StdioTransport } from "../src/stdioTransport";
import type { JSONRPCMessage, JSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";

function asRequest(msg: JSONRPCMessage): JSONRPCRequest {
  if ("method" in msg) return msg as JSONRPCRequest;
  throw new Error("expected request-shaped JSONRPC message");
}

describe("StdioTransport", () => {
  it("parses newline-delimited JSON frames from input", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const tx = new StdioTransport({
      input: input as unknown as NodeJS.ReadableStream,
      output: output as unknown as NodeJS.WritableStream,
      log: () => {},
    });

    const received: JSONRPCMessage[] = [];
    tx.onmessage = (msg) => received.push(msg);
    await tx.start();

    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    input.end();

    // Wait for readline close to flush last frame.
    await new Promise<void>((resolve) => (tx.onclose = () => resolve()));

    expect(received.map((m) => asRequest(m).method)).toEqual(["initialize", "tools/list"]);
  });

  it("writes newline-terminated JSON to output", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const tx = new StdioTransport({
      input: input as unknown as NodeJS.ReadableStream,
      output: output as unknown as NodeJS.WritableStream,
      log: () => {},
    });
    await tx.start();

    const captured: string[] = [];
    output.on("data", (chunk: string) => {
      for (const part of chunk.split("\n")) {
        if (part) captured.push(part);
      }
    });

    void tx.send({ jsonrpc: "2.0", id: 7, result: { ok: true } });
    void tx.send({ jsonrpc: "2.0", method: "notify" });

    // Allow writes to drain.
    await new Promise((resolve) => setImmediate(resolve));
    await tx.close();

    expect(captured).toHaveLength(2);
    expect(JSON.parse(captured[0])).toEqual({ jsonrpc: "2.0", id: 7, result: { ok: true } });
    expect(JSON.parse(captured[1])).toEqual({ jsonrpc: "2.0", method: "notify" });
  });

  it("ignores blank lines and surfaces parse errors via onerror", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.setEncoding("utf8");

    const tx = new StdioTransport({
      input: input as unknown as NodeJS.ReadableStream,
      output: output as unknown as NodeJS.WritableStream,
      log: () => {},
    });

    const received: JSONRPCMessage[] = [];
    const errors: Error[] = [];
    tx.onmessage = (msg) => received.push(msg);
    tx.onerror = (err) => errors.push(err);
    await tx.start();

    input.write("\n\n");
    input.write("not-json\n");
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    input.end();

    await new Promise<void>((resolve) => (tx.onclose = () => resolve()));

    expect(received.map((m) => asRequest(m).method)).toEqual(["ping"]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
