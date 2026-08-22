/**
 * Placeholder transport for connecting to the stash browser extension
 * over a local WebSocket.
 *
 * The extension exposes its MCP server on a runtime port named `mcp`.
 * Node.js cannot reach a `chrome.runtime.connect`-style port directly,
 * so the planned shape is: when the extension runs it opens a local
 * WebSocket (e.g. via a small native-messaging shim or via the
 * background page logging its MCP frames to a loopback WS), and this
 * transport dials that socket. The extension-side wiring is **not**
 * shipped in this PR — see the package README for status.
 *
 * Until that lands, calling `connect()` throws a clear, actionable
 * error so callers (and humans) know exactly what is missing.
 */
import { createConnection } from "node:net";
import type { Duplex } from "node:stream";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export interface ExtensionTransportOptions {
  /** Loopback port the extension's local server is listening on. */
  port: number;
  /** Host to dial — defaults to `127.0.0.1`. */
  host?: string;
  /** Optional override for tests. */
  log?: (line: string) => void;
}

export class ExtensionTransport implements Transport {
  readonly port: number;
  readonly host: string;
  private readonly log: (line: string) => void;
  private socket: Duplex | null = null;
  private readBuffer = "";
  private closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: ExtensionTransportOptions) {
    this.port = options.port;
    this.host = options.host ?? "127.0.0.1";
    this.log = options.log ?? ((line) => process.stderr.write(`${line}\n`));
  }

  async start(): Promise<void> {
    if (this.socket) return;
    await this.openSocket();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.socket) throw new Error("ExtensionTransport not started");
    const line = `${JSON.stringify(message)}\n`;
    return new Promise<void>((resolve, reject) => {
      this.socket!.write(line, (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.onclose?.();
  }

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve) => {
      const sock = createConnection({ port: this.port, host: this.host }, () => {
        this.log(`[stash-mcp-relay] connected to extension at ${this.host}:${this.port}`);
        resolve();
      });
      sock.setEncoding("utf8");
      sock.on("data", (chunk: string | Buffer) => {
        this.readBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        let nl: number;
        while ((nl = this.readBuffer.indexOf("\n")) !== -1) {
          const raw = this.readBuffer.slice(0, nl).trim();
          this.readBuffer = this.readBuffer.slice(nl + 1);
          if (!raw) continue;
          let parsed: JSONRPCMessage;
          try {
            parsed = JSON.parse(raw) as JSONRPCMessage;
          } catch (err) {
            this.log(
              `[stash-mcp-relay] extension->relay parse error: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            this.onerror?.(err instanceof Error ? err : new Error(String(err)));
            continue;
          }
          this.onmessage?.(parsed);
        }
      });
      sock.on("end", () => {
        void this.handleClose("socket end");
      });
      sock.on("close", () => {
        void this.handleClose("socket closed");
      });
      sock.on("error", (err) => {
        this.log(`[stash-mcp-relay] extension socket error: ${err.message}`);
        this.onerror?.(err);
        if (!sock.destroyed) sock.destroy();
      });
      this.socket = sock as Duplex;
    });
  }

  private async handleClose(reason: string): Promise<void> {
    if (this.closed) return;
    this.log(`[stash-mcp-relay] extension socket closed: ${reason}`);
    await this.close();
  }
}

/**
 * Build an `ExtensionTransport` from environment variables.
 *
 * Reads `STASH_RELAY_PORT`; throws a clear error if it isn't set so the
 * spawned CLI fails loudly instead of hanging silently.
 */
export function extensionTransportFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ExtensionTransport | NeverConnectsTransport {
  const raw = env.STASH_RELAY_PORT;
  if (!raw) {
    return new NeverConnectsTransport(
      "STASH_RELAY_PORT is not set. The stash extension must expose a loopback MCP endpoint " +
        "(see packages/mcp-relay/README.md) and advertise the port via the STASH_RELAY_PORT env var.",
    );
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return new NeverConnectsTransport(
      `STASH_RELAY_PORT is not a valid port number: ${JSON.stringify(raw)}`,
    );
  }
  return new ExtensionTransport({ port });
}

/**
 * A transport that fails cleanly on `start()` with a human-readable
 * message. Used to keep the relay runnable in environments where the
 * extension endpoint isn't configured yet, while still surfacing a
 * clear failure mode to callers.
 */
export class NeverConnectsTransport implements Transport {
  readonly reason: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(reason: string) {
    this.reason = reason;
  }

  async start(): Promise<void> {
    this.onerror?.(new Error(this.reason));
    throw new Error(this.reason);
  }

  async send(): Promise<void> {
    throw new Error(this.reason);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}
