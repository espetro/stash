/**
 * Stdio line-delimited JSON-RPC transport for MCP.
 *
 * Reads newline-terminated JSON-RPC messages from `process.stdin` and
 * writes them to `process.stdout`. This matches the framing expected
 * by stdio MCP clients (Claude Desktop, Cursor) when they spawn a
 * child process.
 *
 * Only available in Node.js — the relay never runs in a browser.
 */
import { createInterface, type Interface } from "node:readline";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export interface StdioTransportOptions {
  /** Override the readable stream (defaults to `process.stdin`). */
  input?: NodeJS.ReadableStream;
  /** Override the writable stream (defaults to `process.stdout`). */
  output?: NodeJS.WritableStream;
  /** Optional logger, used in tests. Default: `console.error`. */
  log?: (line: string) => void;
}

export class StdioTransport implements Transport {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  private readonly log: (line: string) => void;
  private rl: Interface | null = null;
  private closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: StdioTransportOptions = {}) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.log = options.log ?? ((line) => process.stderr.write(`${line}\n`));
  }

  async start(): Promise<void> {
    if (this.rl) return;
    this.rl = createInterface({ input: this.input, crlfDelay: Infinity });
    this.rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: JSONRPCMessage;
      try {
        parsed = JSON.parse(trimmed) as JSONRPCMessage;
      } catch (err) {
        this.log(
          `[stash-mcp-relay] failed to parse incoming line as JSON: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        this.onerror?.(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.onmessage?.(parsed);
    });
    const onEnd = () => {
      void this.handlePeerClose("input EOF");
    };
    const onClose = () => {
      void this.handlePeerClose("input closed");
    };
    if (typeof this.input.once === "function") {
      this.input.once("end", onEnd);
      this.input.once("close", onClose);
    } else {
      // Some test streams implement `on()` rather than `once()`; treat
      // them as one-shot by detaching after first emission.
      this.input.on("end", onEnd);
      this.input.on("close", onClose);
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error("StdioTransport is closed");
    const line = `${JSON.stringify(message)}\n`;
    return new Promise<void>((resolve, reject) => {
      const writable = this.output as NodeJS.WritableStream & {
        write: (chunk: string, cb?: (err?: Error | null) => void) => boolean;
      };
      const ok = writable.write(line, (err) => {
        if (err) reject(err);
        else resolve();
      });
      if (!ok) {
        // Backpressure: wait for drain before resolving so we don't lose ordering.
        const drainListener = () => {
          if (typeof this.output.off === "function") this.output.off("drain", drainListener);
          resolve();
        };
        if (typeof this.output.once === "function") this.output.once("drain", drainListener);
        else this.output.on("drain", drainListener);
      }
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.rl?.close();
    this.rl = null;
    // Don't actually destroy stdout — Claude Desktop manages the parent process.
    this.onclose?.();
  }

  private async handlePeerClose(reason: string): Promise<void> {
    if (this.closed) return;
    this.log(`[stash-mcp-relay] peer closed: ${reason}`);
    await this.close();
  }
}
