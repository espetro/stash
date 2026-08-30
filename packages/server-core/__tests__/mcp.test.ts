import { describe, it, expect } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createPayload, encodePayloadToUrl } from "@stash/codec";
import { getTestBrotli as getBrotliFunctions } from "./brotli";
import { createStashServer } from "../src/index";

const ORIGIN = "https://short.example.com";
const ACCEPT = "application/json, text/event-stream";

const server = createStashServer({
  storage: createStorage({ driver: memoryDriver() }),
  origin: ORIGIN,
  getBrotli: getBrotliFunctions,
});

async function rpc(method: string, params?: unknown, id: number | string = 1): Promise<any> {
  const res = await server.handle(
    new Request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: ACCEPT,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  expect(res.status).toBe(200);
  const body: any = await res.json();
  expect(body.error).toBeUndefined();
  return body.result;
}

describe("MCP /mcp", () => {
  it("handles initialize", async () => {
    const result = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" },
    });
    expect(result.serverInfo.name).toBe("stash-shortener");
  });

  it("lists the three tools", async () => {
    const result = await rpc("tools/list");
    const names = result.tools.map((t: any) => t.name);
    expect(names).toEqual(["stash_create", "stash_get", "stash_decode"]);
  });

  it("stash_create then stash_get roundtrip", async () => {
    const created = await rpc("tools/call", {
      name: "stash_create",
      arguments: {
        title: "MCP Test",
        urls: ["https://github.com", "https://mdn.dev"],
        ttlDays: 7,
      },
    });
    const createdData = JSON.parse(created.content[0].text);
    expect(createdData.id).toMatch(/^[A-Z2-7]{6}$/);
    expect(createdData.url).toBe(`${ORIGIN}/s/${createdData.id}`);

    const got = await rpc("tools/call", { name: "stash_get", arguments: { id: createdData.id } });
    const gotData = JSON.parse(got.content[0].text);
    expect(gotData.title).toBe("MCP Test");
    expect(gotData.items.map((i: any[]) => i[0])).toContain("https://github.com");
  });

  it("stash_decode decodes a codec payload", async () => {
    const brotli = await getBrotliFunctions();
    const payload = await encodePayloadToUrl(
      createPayload(
        [
          { url: "https://example.com", title: "Example" },
          { url: "https://another.com", title: "Another" },
        ],
        24,
        "Decode Test",
      ),
      brotli,
    );
    const result = await rpc("tools/call", { name: "stash_decode", arguments: { payload } });
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe("Decode Test");
    expect(data.items).toHaveLength(2);
  });
});

describe("stash_create maxTtl", () => {
  const cappedServer = createStashServer({
    storage: createStorage({ driver: memoryDriver() }),
    origin: ORIGIN,
    getBrotli: getBrotliFunctions,
    maxTtl: "7d",
  });

  async function rpcOn(
    server: ReturnType<typeof createStashServer>,
    method: string,
    params?: unknown,
  ) {
    const res = await server.handle(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: ACCEPT },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    return body.result;
  }

  it("rejects ttlDays above the configured max", async () => {
    const result = await rpcOn(cappedServer, "tools/call", {
      name: "stash_create",
      arguments: { urls: ["https://example.com"], ttlDays: 30 },
    });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toMatch(/ttl/);
  });

  it("allows ttlDays at the configured max", async () => {
    const result = await rpcOn(cappedServer, "tools/call", {
      name: "stash_create",
      arguments: { urls: ["https://example.com"], ttlDays: 7 },
    });
    expect(result.isError).toBeUndefined();
  });
});

describe("GET /.well-known/mcp-server-card", () => {
  it("returns discovery card", async () => {
    const res = await server.handle(new Request(`${ORIGIN}/.well-known/mcp-server-card`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const card: any = await res.json();
    expect(card.name).toBe("stash");
    expect(card.version).toBe("0.1.0");

    // Agent-facing endpoint inventory (W3).
    expect(card.endpoints).toEqual([
      {
        url: `${ORIGIN}/s/{id}`,
        description: expect.stringContaining("content negotiation"),
      },
      {
        url: `${ORIGIN}/openapi.json`,
        description: expect.stringContaining("OpenAPI"),
      },
      {
        url: `${ORIGIN}/llms.txt`,
        description: expect.stringContaining("LLM"),
      },
    ]);

    // The shortener surface plus the local surfaces: the browser-internal
    // extension port and the daemon stdio entry (desktop MCP clients).
    expect(Array.isArray(card.servers)).toBe(true);
    expect(card.servers).toHaveLength(3);

    const [shortener, extension, daemon] = card.servers;

    expect(shortener.name).toBe("stash-shortener");
    expect(shortener.transport).toBe("streamable-http");
    expect(shortener.url).toBe(`${ORIGIN}/mcp`);
    expect(shortener.tools.map((t: any) => t.name)).toEqual([
      "stash_create",
      "stash_get",
      "stash_decode",
    ]);

    expect(extension.name).toBe("stash-extension");
    expect(extension.transport).toBe("extension-port");
    expect(extension.portName).toBe("mcp");
    expect(extension.url).toBeUndefined();

    expect(daemon.name).toBe("stash-daemon");
    expect(daemon.transport).toBe("stdio");
    expect(daemon.url).toBeUndefined();

    // Legacy flat fields preserved for backwards compat.
    expect(card.url).toBe(`${ORIGIN}/mcp`);
    expect(card.transport).toBe("streamable-http");
    expect(card.tools.map((t: any) => t.name)).toEqual([
      "stash_create",
      "stash_get",
      "stash_decode",
    ]);
  });
});
