/**
 * Agent-flow steps (plan W4): the fetch-only agent stand-in over the
 * viewer's alternate representations, and the headless MCP client
 * against the extension's runtime port.
 */

import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import { request, type APIRequestContext } from "playwright";
import type { BrowserContext } from "playwright";
import { launchWithExtension } from "../helpers/browser-helper";
import {
  connectMcpPort,
  seedExtensionLibrary,
  EXTENSION_SEED,
  type McpRpc,
} from "../helpers/mcp-seed";
import {
  generateViewerUrlFromFixture,
  encodeFixturePayload,
  VIEWER_ORIGIN,
} from "../helpers/encoder-helper";
import { agentFetchServer } from "../helpers/agent-fetch-server";

/** The 8 tools the extension MCP server exposes (lib/mcp/server.ts). */
const EXPECTED_TOOLS = [
  "stash_snapshot_tabs",
  "stash_list",
  "stash_get",
  "stash_create",
  "stash_update",
  "stash_delete",
  "stash_search",
  "stash_decode",
];

let _api: APIRequestContext | null = null;

/** Shared APIRequestContext (the fetch-only agent stand-in). */
async function api(): Promise<APIRequestContext> {
  if (!_api) _api = await request.newContext();
  return _api;
}

function setAgent<T>(key: "rpc" | "jsonBody" | "mdBody" | "txtBody", value: T): void {
  getActiveState().variables[key] = value;
}

function getAgent<T>(key: string): T {
  const value = getActiveState().variables[key];
  if (value === undefined) {
    throw new Error(`No "${key}" in scenario state; fetch or connect first.`);
  }
  return value as T;
}

/**
 * The JSON alternate href SSR emits carries an empty `p=`; the client
 * hook rewrites it once the fragment is decoded. The agent stand-in
 * does the same rewrite: take the href, inject the encoded payload.
 */
function rewriteHrefWithPayload(href: string, payload: string): string {
  return href.replace(/([?&]p=)[^&]*/, (_m, p: string) => `${p}${payload}`);
}

step("The agent is given a fixture share URL <fixture>", async (fixture) => {
  const state = getActiveState();
  state.shareLink = await generateViewerUrlFromFixture(fixture);
  state.variables.payload = await encodeFixturePayload(fixture);
});

step("The agent reads the alternate link of type <type> from the page HTML", async (type) => {
  const state = getActiveState();
  if (!state.shareLink) throw new Error("No share URL; run the fixture step first.");
  // Fetch-only stand-in: read the served HTML for /s (the fragment
  // never reaches the server, so any page variant serves the same
  // SSR head with the empty-p= alternate hrefs).
  const url = new URL(state.shareLink);
  const response = await (await api()).get(`${url.origin}/s`);
  const html = await response.text();
  const match = new RegExp(
    `<link rel="alternate" type="${type.replace("/", "\\/")}" href="([^"]+)"`,
  ).exec(html);
  if (!match) {
    throw new Error(`No <link rel="alternate" type="${type}"> in served HTML.`);
  }
  state.variables.alternateHref = match[1];
});

step("The agent fetches the alternate link and receives JSON items", async () => {
  const state = getActiveState();
  const href = rewriteHrefWithPayload(
    state.variables.alternateHref as string,
    state.variables.payload as string,
  );
  // astro preview does not run Pages Functions, so the agent surface
  // is served by the local stand-in that reuses the real handler.
  const base = await agentFetchServer();
  // The SSR href may be entity-encoded (&amp;) and carries the preview
  // origin; decode it and point it at the local agent server.
  const url = href.replace(/&amp;/g, "&").replace(VIEWER_ORIGIN, base);
  const response = await (await api()).get(url);
  if (!response.ok()) {
    throw new Error(`Alternate link fetch failed: ${response.status()}`);
  }
  setAgent("jsonBody", await response.json());
});

step(
  "The agent fetches the share URL with Accept <accept> and receives <count> items as text",
  async (accept, countStr) => {
    const state = getActiveState();
    const payload = state.variables.payload as string;
    const base = await agentFetchServer();
    const response = await (
      await api()
    ).get(`${base}/s?p=${payload}`, {
      headers: { Accept: accept },
    });
    if (!response.ok()) {
      throw new Error(`Accept-negotiated fetch failed: ${response.status()}`);
    }
    const text = await response.text();
    const expected = parseInt(countStr, 10);
    const count = (text.match(/https?:\/\//g) ?? []).length;
    if (count < expected) {
      throw new Error(`Expected at least ${expected} URLs in body, found ${count}.`);
    }
    setAgent(accept === "text/plain" ? "txtBody" : "mdBody", text);
  },
);

step("The JSON body should contain <count> items", async (countStr) => {
  const body = getAgent<{ items?: unknown[] }>("jsonBody");
  const expected = parseInt(countStr, 10);
  if (body.items?.length !== expected) {
    throw new Error(`Expected ${expected} items, got ${body.items?.length}.`);
  }
});

step("The JSON body should contain the URL <url> with title <title>", async (url, title) => {
  const body = getAgent<{ items?: { url: string; title: string }[] }>("jsonBody");
  const item = body.items?.find((i) => i.url === url);
  if (!item) throw new Error(`No item with URL ${url} in JSON body.`);
  if (item.title !== title) {
    throw new Error(`Expected title "${title}" for ${url}, got "${item.title}".`);
  }
});

step("The markdown body should contain a link to <url>", async (url) => {
  const body = getAgent<string>("mdBody");
  if (!body.includes(url)) {
    throw new Error(`Markdown body does not reference ${url}.`);
  }
});

/*
 * Extension MCP scenarios
 */

step(
  "The browser is launched with the built Stash extension and the options page is open",
  async () => {
    const state = getActiveState();
    state.extensionContext = (await launchWithExtension()) as BrowserContext;
  },
);

step("The agent connects to the extension MCP port", async () => {
  const rpc = await connectMcpPort(getActiveState().extensionContext!);
  setAgent("rpc", rpc);
  await rpc.initialize();
});

step("The MCP tool list should contain all <count> stash tools", async (countStr) => {
  const rpc = getAgent<McpRpc>("rpc");
  const tools = await rpc.listTools();
  const expected = parseInt(countStr, 10);
  if (tools.length !== expected) {
    throw new Error(`Expected ${expected} tools, got ${tools.length}: ${tools.join(", ")}`);
  }
  for (const name of EXPECTED_TOOLS) {
    if (!tools.includes(name)) {
      throw new Error(`Tool "${name}" missing from tools/list.`);
    }
  }
});

step("The agent calls stash_snapshot_tabs and receives the current window tabs", async () => {
  const rpc = getAgent<McpRpc>("rpc");
  const result = (await rpc.callTool("stash_snapshot_tabs")) as {
    items?: { url: string }[];
  };
  if (!Array.isArray(result.items)) {
    throw new Error("stash_snapshot_tabs returned no items array.");
  }
  // The options page itself is open in the current window, so at
  // least the chrome-extension:// page must be reported... it is
  // filtered to http(s) by the tool, so accept >= 0 but require the
  // call to have succeeded structurally. Assert the response shape
  // only; window tab counts vary by launch mode.
  for (const item of result.items) {
    if (!/^https?:\/\//.test(item.url)) {
      throw new Error(`stash_snapshot_tabs leaked a non-http(s) URL: ${item.url}`);
    }
  }
});

step("The agent seeds the extension library with the canonical seed", async () => {
  const rpc = getAgent<McpRpc>("rpc");
  const created = (await seedExtensionLibrary(rpc)) as {
    id: string;
    title?: string;
    items?: unknown[];
  }[];
  if (created.length !== EXTENSION_SEED.length) {
    throw new Error(`Expected ${EXTENSION_SEED.length} seeded stashes, got ${created.length}.`);
  }
  for (const [i, stash] of created.entries()) {
    if ((stash.items?.length ?? 0) !== EXTENSION_SEED[i].items.length) {
      throw new Error(
        `Seed "${stash.title}" has ${stash.items?.length} items, expected ${EXTENSION_SEED[i].items.length}.`,
      );
    }
  }
  getActiveState().variables.seededIds = created.map((s) => s.id);
});

step("stash_list should return the seeded stashes", async () => {
  const rpc = getAgent<McpRpc>("rpc");
  const result = (await rpc.callTool("stash_list")) as {
    stashes?: { id: string; itemCount: number }[];
  };
  const seeded = getAgent<string[]>("seededIds");
  const listed = result.stashes ?? [];
  for (const id of seeded) {
    if (!listed.some((s) => s.id === id)) {
      throw new Error(`Seeded stash ${id} missing from stash_list.`);
    }
  }
});

step(
  "stash_get should return a seeded stash with <count> items and title <title>",
  async (countStr, title) => {
    const rpc = getAgent<McpRpc>("rpc");
    const seeded = getAgent<string[]>("seededIds");
    const expected = parseInt(countStr, 10);
    let found: { items?: unknown[]; title?: string } | null = null;
    for (const id of seeded) {
      const stash = (await rpc.callTool("stash_get", { id })) as {
        items?: unknown[];
        title?: string;
      };
      if (stash.items?.length === expected) {
        found = stash;
        break;
      }
    }
    if (!found) {
      throw new Error(`No seeded stash with ${expected} items.`);
    }
    if (found.title !== title) {
      throw new Error(`Expected title "${title}", got "${found.title}".`);
    }
  },
);

step("stash_search for <query> should return the matching seeded stash", async (query) => {
  const rpc = getAgent<McpRpc>("rpc");
  const result = (await rpc.callTool("stash_search", { query })) as {
    stashes?: { id: string }[];
  };
  const matches = result.stashes ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 match for "${query}", got ${matches.length}.`);
  }
  const seeded = getAgent<string[]>("seededIds");
  if (!seeded.includes(matches[0].id)) {
    throw new Error(`Search result ${matches[0].id} is not a seeded stash.`);
  }
});
