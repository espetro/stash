/**
 * MCP seed harness for extension e2e scenarios (plan W0.4).
 *
 * Speaks JSON-RPC 2.0 over the extension's runtime port named "mcp"
 * from inside the options page, mirroring what MCP-B / the relay do.
 * Extension-internal connects (`sender.id === runtime.id`) are allowed
 * by the background server's allowlist, so no external page is needed.
 *
 * Transport design: `page.exposeFunction` bridges port.onMessage back
 * to Node, where pending requests resolve by id. The page-side
 * `__mcpRequest` helper returns a Promise that exposeFunction settles.
 * This is simpler and more robust than juggling evaluate handles.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { getExtensionId } from "./browser-helper";

export interface SeedStashSpec {
  /** Distinct title so stash_list/stash_search assertions discriminate. */
  title: string;
  tags: string[];
  note: string;
  items: { url: string; title: string }[];
}

const SAMPLE_TABS_PATH = path.join(process.cwd(), "fixtures", "sample-tabs.json");

type SampleTabs = Record<string, { url: string; title: string }[]>;

function loadSampleTabs(): SampleTabs {
  return JSON.parse(fs.readFileSync(SAMPLE_TABS_PATH, "utf-8")) as SampleTabs;
}

/**
 * Canonical extension seed: 3 stashes derived from the shared
 * sample-tabs datasets, with distinct titles/tags/notes so
 * stash_list / stash_search / stash_get assertions have
 * discriminating data. Reused by vitest-level extension tests that
 * prefer direct stash-store calls over the port.
 */
export const EXTENSION_SEED: SeedStashSpec[] = (() => {
  const tabs = loadSampleTabs();
  return [
    {
      title: "Web dev reading list",
      tags: ["research", "webdev"],
      note: "five-tab snapshot from the canonical seed",
      items: tabs["five-tabs"],
    },
    {
      title: "Docs deep dive",
      tags: ["docs", "reference"],
      note: "three-tab snapshot from the canonical seed",
      items: tabs["three-tabs"],
    },
    {
      title: "Quick bookmark",
      tags: ["quick"],
      note: "single-tab snapshot from the canonical seed",
      items: tabs["single-tab"],
    },
  ];
})();

/** Minimal JSON-RPC client over the extension's "mcp" runtime port. */
export interface McpRpc {
  /** Page hosting the port (options page). Close when done. */
  page: Page;
  /** Send `initialize` and await the server's capabilities result. */
  initialize(): Promise<Record<string, unknown>>;
  /** `tools/list` — returns the tool names. */
  listTools(): Promise<string[]>;
  /** `tools/call` — returns the parsed `content[0].text` JSON payload. */
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Open the extension options page and connect a runtime port named
 * "mcp". Requires a context launched via `launchWithExtension()`.
 */
export async function connectMcpPort(context: BrowserContext): Promise<McpRpc> {
  const extensionId = await getExtensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // Node-side pending-response map, keyed by JSON-RPC id.
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  await page.exposeFunction("__mcpRespond", (id: number, msg: unknown) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    const message = msg as { error?: { message: string } };
    if (message && message.error) {
      entry.reject(new Error(message.error.message));
    } else {
      entry.resolve((msg as { result?: unknown }).result ?? msg);
    }
  });

  await page.evaluate(() => {
    let seq = 0;
    const port = chrome.runtime.connect({ name: "mcp" });
    port.onMessage.addListener((msg) => {
      const { id } = msg as { id: number };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mcpRespond(id, msg);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mcpRequest = (method: string, params: unknown) => {
      const id = ++seq;
      port.postMessage({ jsonrpc: "2.0", id, method, params });
      return id;
    };
  });

  async function call<T>(method: string, params: unknown): Promise<T> {
    const id = (await page.evaluate(
      ([m, p]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__mcpRequest(m, p);
      },
      [method, params],
    )) as number;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      // Guard against the port dying silently (extension reload etc).
      setTimeout(() => {
        if (pending.delete(id)) {
          reject(new Error(`MCP request "${method}" timed out`));
        }
      }, 15000);
    });
  }

  return {
    page,
    async initialize() {
      // Match the SDK's LATEST_PROTOCOL_VERSION (client/index.js sends
      // this by default); the server downgrades unknown versions, but
      // the exact value avoids surprises.
      return call("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "stash-e2e", version: "0.0.1" },
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
  };
}

/**
 * Seed the extension's stash library via `stash_create`, one call per
 * spec entry. Returns the created stashes (as returned by the tool).
 */
export async function seedExtensionLibrary(
  rpc: McpRpc,
  spec: SeedStashSpec[] = EXTENSION_SEED,
): Promise<unknown[]> {
  const created: unknown[] = [];
  for (const entry of spec) {
    created.push(
      await rpc.callTool("stash_create", {
        title: entry.title,
        tags: entry.tags,
        note: entry.note,
        items: entry.items,
      }),
    );
  }
  return created;
}
