/**
 * Generic JSON-RPC frame relay for MCP transports.
 *
 * Pumps every JSON-RPC frame arriving on `client.onmessage` through
 * `upstream.send`, and vice-versa. Each side keeps its own
 * `send`/`onmessage` wired as the SDK (`Server` / `Client`) or host
 * process installed them — the relay never touches them.
 *
 *    client transport.onmessage ──▶ upstream.send
 *    upstream transport.onmessage ──▶ client.send
 *
 * Used by the CLI to bridge `StdioTransport` (Claude Desktop / Cursor)
 * and `ExtensionTransport` (the stash extension's local endpoint), and
 * by the round-trip test to bridge a real `McpServer` and `Client`.
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export interface RelayOptions {
  /** Transport on the MCP client (parent) side. */
  client: Transport;
  /** Transport on the MCP server (extension) side. */
  upstream: Transport;
  /** Optional line logger. */
  log?: (line: string) => void;
}

export interface RelayHandles {
  /** Resolves when either underlying transport closes or errors. */
  done: Promise<void>;
  /** Detach the relay; idempotent. */
  teardown: () => void;
}

/**
 * Bridge two transports, returning a `done` promise plus a
 * `teardown` that detaches the frame pump.
 */
export function relay({ client, upstream, log }: RelayOptions): RelayHandles {
  const writeLog = log ?? (() => {});

  // Snapshot whatever the SDK / host already installed so we can
  // forward transparently without replacing the handler.
  const prevClientOnMsg = client.onmessage;
  const prevUpstreamOnMsg = upstream.onmessage;
  const prevClientOnClose = client.onclose;
  const prevUpstreamOnClose = upstream.onclose;
  const prevClientOnErr = client.onerror;
  const prevUpstreamOnErr = upstream.onerror;

  client.onmessage = (msg: JSONRPCMessage) => {
    prevClientOnMsg?.(msg);
    void upstream.send(msg).catch((err) => {
      writeLog(`[stash-mcp-relay] upstream.send failed: ${stringify(err)}`);
    });
  };
  upstream.onmessage = (msg: JSONRPCMessage) => {
    prevUpstreamOnMsg?.(msg);
    void client.send(msg).catch((err) => {
      writeLog(`[stash-mcp-relay] client.send failed: ${stringify(err)}`);
    });
  };

  let resolveDone: () => void = () => {};
  let settled = false;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const finish = (reason: string) => {
    if (settled) return;
    settled = true;
    writeLog(`[stash-mcp-relay] relay finished: ${reason}`);
    teardown();
    resolveDone();
  };

  client.onclose = () => {
    prevClientOnClose?.();
    finish("client onclose");
  };
  upstream.onclose = () => {
    prevUpstreamOnClose?.();
    finish("upstream onclose");
  };
  client.onerror = (err: Error) => {
    prevClientOnErr?.(err);
    writeLog(`[stash-mcp-relay] client transport error: ${err.message}`);
    finish(`client error: ${err.message}`);
  };
  upstream.onerror = (err: Error) => {
    prevUpstreamOnErr?.(err);
    writeLog(`[stash-mcp-relay] upstream transport error: ${err.message}`);
    finish(`upstream error: ${err.message}`);
  };

  function teardown() {
    if (settled) return;
    // Restore the originals so the caller can reuse the transports
    // after the relay goes away.
    client.onmessage = prevClientOnMsg;
    upstream.onmessage = prevUpstreamOnMsg;
    client.onclose = prevClientOnClose;
    upstream.onclose = prevUpstreamOnClose;
    client.onerror = prevClientOnErr;
    upstream.onerror = prevUpstreamOnErr;
  }

  writeLog("[stash-mcp-relay] relay attached; forwarding JSON-RPC frames");

  return { done, teardown };
}

function stringify(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
