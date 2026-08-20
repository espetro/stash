import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "../lib/mcp/server";
import { addToHistory, historyItem } from "../lib/history";

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

// Brotli works in happy-dom via the @stash/shared wasm module
async function makeClient(): Promise<Client> {
  const server = buildMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

describe("MCP server tools", () => {
  it("exposes stash_list, stash_create, stash_decode", async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["stash_create", "stash_decode", "stash_list"]);
    await client.close();
  });

  it("stash_create produces a share URL and records history", async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: "stash_create",
      arguments: { urls: ["https://example.com", "https://example.org"] },
    });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(payload.url).toMatch(/^https?:\/\/.+\/s\/#/);
    expect(payload.itemCount).toBe(2);
    expect(payload.truncated).toBe(false);

    const history = await historyItem.get();
    expect(history?.length).toBeGreaterThan(0);
    expect(history![history!.length - 1].url).toBe(payload.url);
    await client.close();
  });

  it("stash_create → stash_decode roundtrip", async () => {
    const client = await makeClient();
    const created = await client.callTool({
      name: "stash_create",
      arguments: { urls: ["https://example.com", "https://example.org"], title: "My Stash" },
    });
    const url = JSON.parse((created.content as Array<{ text: string }>)[0].text).url;
    const p = new URL(url).hash.match(/p=([^&]+)/)![1];

    const decoded = await client.callTool({ name: "stash_decode", arguments: { payload: p } });
    const result = JSON.parse((decoded.content as Array<{ text: string }>)[0].text);
    expect(result.title).toBe("My Stash");
    expect(result.items.length).toBe(2);
    await client.close();
  });

  it("stash_list returns stored history entries", async () => {
    await addToHistory({
      id: "test1",
      url: "https://stash.illo.fyi/s/#p=abc",
      itemCount: 1,
      truncated: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000,
    });
    const client = await makeClient();
    const result = await client.callTool({ name: "stash_list", arguments: {} });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(payload.stashes.some((s: { id: string }) => s.id === "test1")).toBe(true);
    await client.close();
  });
});
