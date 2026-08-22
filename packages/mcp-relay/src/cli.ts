#!/usr/bin/env node
/**
 * `stash-mcp-relay` — CLI that bridges a stdio MCP client (Claude
 * Desktop, Cursor, etc.) to the stash browser extension's local MCP
 * server.
 *
 * ## Runtime model
 *
 * The parent MCP client (Claude Desktop, Cursor, …) spawns this
 * process and exchanges newline-delimited JSON-RPC with it on
 * stdin/stdout. On the other end we dial the stash extension's
 * local MCP endpoint, currently configured via `STASH_RELAY_PORT`.
 * This process is just a transport bridge — the parent is the MCP
 * client and the extension is the MCP server.
 *
 * ## Usage as a binary
 *
 * Configure your MCP client to spawn this binary with `STASH_RELAY_PORT`
 * set to the loopback port the extension has opened. Example Claude
 * Desktop snippet:
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "stash": {
 *       "command": "npx",
 *       "args": ["-y", "@stash/mcp-relay"],
 *       "env": { "STASH_RELAY_PORT": "4317" }
 *     }
 *   }
 * }
 * ```
 *
 * ## Status (PR5)
 *
 * The extension-side endpoint that listens on `STASH_RELAY_PORT` is
 * **not yet wired up** — that work lands in PR6. Until then, this
 * CLI will exit with a clear error if `STASH_RELAY_PORT` isn't set,
 * rather than hanging silently.
 */
import { StdioTransport } from "./stdioTransport.js";
import {
  extensionTransportFromEnv,
  ExtensionTransport,
  NeverConnectsTransport,
} from "./extensionTransport.js";
import { relay } from "./relay.js";

export interface CliOptions {
  env?: NodeJS.ProcessEnv;
  /** Allow tests to inject a custom upstream transport. */
  upstreamFactory?: (env: NodeJS.ProcessEnv) => ExtensionTransport | NeverConnectsTransport;
  /** Allow tests to capture and silence log output. */
  log?: (line: string) => void;
}

export async function main(opts: CliOptions = {}): Promise<void> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((line) => process.stderr.write(`${line}\n`));
  const factory = opts.upstreamFactory ?? extensionTransportFromEnv;
  const stdio = new StdioTransport({ log });
  const upstream = factory(env);

  await Promise.all([stdio.start(), upstream.start()]);
  const handle = relay({ client: stdio, upstream, log });
  try {
    await handle.done;
  } finally {
    handle.teardown();
  }
}

/** Run the CLI when invoked directly (not when imported for tests). */
const isDirect = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isDirect) {
  main().catch((err) => {
    process.stderr.write(`[stash-mcp-relay] fatal: ${stringify(err)}\n`);
    process.exit(1);
  });
}

function stringify(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
