/**
 * Daemon MCP harness for e2e scenarios (plan W2).
 *
 * Spawns the built stash-daemon binary in `serve` mode with a temp
 * `--config-dir`, then speaks JSON-RPC 2.0 over the child's stdio
 * (newline-delimited), mirroring helpers/mcp-seed.ts's McpRpc surface
 * so assertions are copyable between extension and daemon specs.
 *
 * Prerequisite: the daemon binary must exist. Build it with
 *   go build -o /tmp/stash-daemon ./daemon/cmd/stash-daemon
 * and point STASH_DAEMON_BIN at it (defaults to /tmp/stash-daemon).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { EXTENSION_SEED, type SeedStashSpec } from "./mcp-seed";

export const DEFAULT_DAEMON_BIN = "/tmp/stash-daemon";

/** The frozen 8-tool registry (shared with the extension surface). */
export const EXPECTED_TOOLS = [
  "stash_snapshot_tabs",
  "stash_list",
  "stash_get",
  "stash_create",
  "stash_update",
  "stash_delete",
  "stash_search",
  "stash_decode",
];

/** Resolve the daemon binary path, failing with a build hint. */
export function daemonBinaryPath(): string {
  const bin = process.env.STASH_DAEMON_BIN || DEFAULT_DAEMON_BIN;
  if (!fs.existsSync(bin)) {
    throw new Error(
      `stash-daemon binary not found at ${bin}. Build it first: ` +
        `go build -o ${bin} ./daemon/cmd/stash-daemon (from the repo root).`,
    );
  }
  return bin;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/** Headless MCP client over the daemon's stdio transport. */
export interface DaemonRpc {
  /** Send `initialize` and await the server's capabilities result. */
  initialize(): Promise<Record<string, unknown>>;
  /** `tools/list` — returns the tool names. */
  listTools(): Promise<string[]>;
  /** `tools/call` — returns the parsed `content[0].text` JSON payload. */
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  /**
   * Like callTool but resolves with the error payload (CallError JSON)
   * instead of rejecting, for asserting error codes.
   */
  callToolRaw(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    isError?: boolean;
    error?: { code: string; message: string };
    [k: string]: unknown;
  }>;
  /** Terminate the daemon and clean the temp config dir. */
  stop(): Promise<void>;
}

export async function connectDaemonRpc(binaryPath?: string): Promise<DaemonRpc> {
  const bin = binaryPath ?? daemonBinaryPath();
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-daemon-e2e-"));
  const child: ChildProcess = spawn(bin, ["serve", "--config-dir", configDir], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, Pending>();
  let buffer = "";
  let nextId = 0;
  let stderrTail = "";

  child.stdout!.setEncoding("utf-8");
  child.stdout!.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg: { id?: number; error?: { message: string }; result?: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = pending.get(msg.id as number);
      if (!entry) continue;
      pending.delete(msg.id as number);
      clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(new Error(msg.error.message));
      } else {
        entry.resolve(msg.result);
      }
    }
  });
  child.stderr!.on("data", (chunk: Buffer) => {
    // The daemon logs JSON lines to stderr; keep a tail for diagnostics.
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  const exited = new Promise<never>((_resolve, reject) => {
    child.on("exit", (code) => {
      const err = new Error(`stash-daemon exited (code ${code}). stderr tail: ${stderrTail}`);
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
      reject(err);
    });
  });
  // Swallow unhandled rejection if the daemon dies after the scenario ends.
  exited.catch(() => undefined);

  function call<T>(method: string, params: unknown): Promise<T> {
    const id = ++nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out`));
      }, 15_000);
      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  const rpc: DaemonRpc = {
    async initialize() {
      return call("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "stash-e2e-daemon", version: "0.0.1" },
      });
    },
    async listTools() {
      const result = await call<{ tools?: { name: string }[] }>("tools/list", {});
      return (result.tools ?? []).map((t) => t.name);
    },
    async callTool(name, args = {}) {
      const result = await call<{ content?: { text?: string }[] }>("tools/call", {
        name,
        arguments: args,
      });
      const text = result.content?.[0]?.text;
      if (text === undefined) return result;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
    async callToolRaw(name, args = {}) {
      const result = await call<{ content?: { text?: string }[]; isError?: boolean }>(
        "tools/call",
        {
          name,
          arguments: args,
        },
      );
      const text = result.content?.[0]?.text;
      const parsed: Record<string, unknown> =
        typeof text === "string"
          ? (() => {
              try {
                return JSON.parse(text);
              } catch {
                return { raw: text };
              }
            })()
          : (result as Record<string, unknown>);
      if (result.isError) parsed.isError = true;
      return parsed;
    },
    async stop() {
      for (const [, p] of pending) clearTimeout(p.timer);
      pending.clear();
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
      });
      fs.rmSync(configDir, { recursive: true, force: true });
    },
  };

  await rpc.initialize();
  return rpc;
}

/** Seed the daemon library via `stash_create`, one call per spec entry. */
export async function seedDaemonLibrary(
  rpc: DaemonRpc,
  spec: SeedStashSpec[] = EXTENSION_SEED,
): Promise<{ id: string; title?: string; items?: unknown[] }[]> {
  const created: { id: string; title?: string; items?: unknown[] }[] = [];
  for (const entry of spec) {
    created.push(
      (await rpc.callTool("stash_create", {
        title: entry.title,
        tags: entry.tags,
        note: entry.note,
        items: entry.items,
      })) as { id: string },
    );
  }
  return created;
}
