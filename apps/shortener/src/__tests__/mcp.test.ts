import { describe, it, expect } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createPayload, encodePayloadToUrl } from "@stash/codec";
import { getBrotli } from "../brotli";
import worker from "../index";
import type { Env } from "../store";

const mockEnv: Env = {
  TEST_STORAGE: createStorage({ driver: memoryDriver() }),
};

const ORIGIN = "https://short.example.com";
const ACCEPT = "application/json, text/event-stream";

async function rpc(method: string, params?: unknown, id: number | string = 1): Promise<any> {
  const res = await worker.fetch(
    new Request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: ACCEPT,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
    mockEnv,
    // minimal ctx stub: SDK may call waitUntil
    { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
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
    const brotli = await getBrotli();
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

describe("GET /.well-known/mcp-server-card", () => {
  it("returns discovery card", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/.well-known/mcp-server-card`), mockEnv, {
      waitUntil() {},
      passThroughOnException() {},
    } as unknown as ExecutionContext);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const card: any = await res.json();
    expect(card.url).toBe(`${ORIGIN}/mcp`);
    expect(card.transport).toBe("streamable-http");
    expect(card.tools.map((t: any) => t.name)).toEqual([
      "stash_create",
      "stash_get",
      "stash_decode",
    ]);
  });
});
