import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { buildMcpServer } from "../lib/mcp/server";
import { MCP_PORT_NAME } from "../lib/mcp/constants";
import { encodeTabsToShareUrl } from "@stash/codec";

// The global setup mocks @stash/shared without getBrotliFunctions; brotli-wasm
// can't be fetched under happy-dom, so substitute an identity "compression"
// (symmetric, so codec encode/decode roundtrips still exercise real paths).
vi.mock("@stash/shared", async () => {
  const identityBrotli = {
    compress: (data: Uint8Array) => data,
    decompress: (data: Uint8Array) => data,
  };
  return {
    getBrotliFunctions: async () => identityBrotli,
    getDomain: (url: string) => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    },
    getFaviconUrl: (url: string) => `https://www.google.com/s2/favicons?domain=${url}&sz=32`,
  };
});

async function makeClient(): Promise<Client> {
  const server = buildMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
}

describe("MCP server tools", () => {
  it("exposes the v2 tool set", async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "stash_snapshot_tabs",
        "stash_list",
        "stash_get",
        "stash_create",
        "stash_update",
        "stash_delete",
        "stash_search",
        "stash_decode",
      ].sort(),
    );
    await client.close();
  });

  it("stash_snapshot_tabs returns the current window's open tabs", async () => {
    fakeBrowser.tabs.query = vi
      .fn()
      .mockResolvedValue([
        { url: "https://example.com", title: "Example" },
        { url: "chrome://extensions", title: "Extensions" },
      ]) as never;

    const client = await makeClient();
    const result = await client.callTool({ name: "stash_snapshot_tabs", arguments: {} });
    const payload = textOf(result);
    expect(payload.items).toEqual([{ url: "https://example.com", title: "Example" }]);
    await client.close();
  });

  it("stash_create persists a stash and stash_list/stash_get/stash_search see it", async () => {
    const client = await makeClient();
    const created = await client.callTool({
      name: "stash_create",
      arguments: {
        title: "My Stash",
        tags: ["research"],
        note: "for later",
        items: [{ url: "https://example.com", title: "Example" }],
      },
    });
    const stash = textOf(created);
    expect(stash.id).toBeTruthy();
    expect(stash.title).toBe("My Stash");
    expect(stash.tags).toEqual(["research"]);

    const listed = textOf(await client.callTool({ name: "stash_list", arguments: {} }));
    expect(listed.stashes.some((s: { id: string }) => s.id === stash.id)).toBe(true);

    const fetched = textOf(await client.callTool({ name: "stash_get", arguments: { id: stash.id } }));
    expect(fetched.items).toEqual(stash.items);

    const searched = textOf(
      await client.callTool({ name: "stash_search", arguments: { query: "research" } }),
    );
    expect(searched.stashes.some((s: { id: string }) => s.id === stash.id)).toBe(true);
    await client.close();
  });

  it("stash_get returns not_found for an unknown id", async () => {
    const client = await makeClient();
    const result = await client.callTool({ name: "stash_get", arguments: { id: "nope" } });
    expect(result.isError).toBe(true);
    expect(textOf(result).error).toBe("not_found");
    await client.close();
  });

  it("stash_update patches an existing stash", async () => {
    const client = await makeClient();
    const created = textOf(
      await client.callTool({
        name: "stash_create",
        arguments: { items: [{ url: "https://example.com", title: "Example" }] },
      }),
    );

    const updated = textOf(
      await client.callTool({
        name: "stash_update",
        arguments: { id: created.id, title: "Renamed" },
      }),
    );
    expect(updated.title).toBe("Renamed");
    await client.close();
  });

  it("stash_delete removes a stash", async () => {
    const client = await makeClient();
    const created = textOf(
      await client.callTool({
        name: "stash_create",
        arguments: { items: [{ url: "https://example.com", title: "Example" }] },
      }),
    );

    const deleted = textOf(
      await client.callTool({ name: "stash_delete", arguments: { id: created.id } }),
    );
    expect(deleted.deleted).toBe(true);

    const listed = textOf(await client.callTool({ name: "stash_list", arguments: {} }));
    expect(listed.stashes).toHaveLength(0);
    await client.close();
  });

  it("stash_decode surfaces title, items, tags and note", async () => {
    const brotli = { compress: (d: Uint8Array) => d, decompress: (d: Uint8Array) => d };
    const encoded = await encodeTabsToShareUrl(
      [{ url: "https://example.com", title: "Example" }],
      brotli,
      24,
      "https://stash.illo.fyi",
      "My Stash",
      ["a"],
      "a note",
    );
    const p = new URL(encoded.url).hash.match(/p=([^&]+)/)![1];

    const client = await makeClient();
    const decoded = textOf(await client.callTool({ name: "stash_decode", arguments: { payload: p } }));
    expect(decoded.title).toBe("My Stash");
    expect(decoded.items.length).toBe(1);
    expect(decoded.tags).toEqual(["a"]);
    expect(decoded.note).toBe("a note");
    await client.close();
  });
});

describe("MCP_PORT_NAME contract", () => {
  it('is "mcp" (matches @mcp-b/transports default)', () => {
    expect(MCP_PORT_NAME).toBe("mcp");
  });

  it("docs no longer reference the old stash-mcp name", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../content/docs/agent-server.md",
    );
    const docs = await readFile(docsPath, "utf-8");
    expect(docs).not.toMatch(/stash-mcp/);
    expect(docs).toMatch(/`mcp`/);
  });
});
