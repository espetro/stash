import { describe, it, expect, beforeAll } from "vitest";
import { createStorage, type Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { decodeEncodedPayload } from "@stash/codec";
import { loadPayloadFixtures, type PayloadFixture } from "@stash/shared/fixtures";
import fixturesJson from "@stash/shared/fixtures/payloads.json";
import { getTestBrotli as getBrotliFunctions } from "./brotli";
import { createStashServer } from "../src/index";

// One shared storage instance across tests: existing tests rely on
// read-after-write flows against shared state.
const storage: Storage = createStorage({ driver: memoryDriver() });
const server = createStashServer({
  storage,
  origin: "https://short.example.com",
  getBrotli: getBrotliFunctions,
});

const ORIGIN = "https://short.example.com";

function fetchServer(url: string, init?: RequestInit): Promise<Response> {
  return server.handle(new Request(url, init));
}

const fixtures: PayloadFixture[] = loadPayloadFixtures(fixturesJson);

function fixture(name: string): PayloadFixture {
  const f = fixtures.find((x) => x.name === name);
  if (!f) throw new Error(`missing fixture: ${name}`);
  return f;
}

/** Extract the encoded payload from a `#p=` or `#q=` fixture fragment. */
function fixturePayload(name: string): string {
  return fixture(name).fragment.replace(/^#[pq]=/, "");
}

const payloadP = fixturePayload("three-tabs");

async function makeStash(ttl = "30d", payload: string = payloadP): Promise<string> {
  const res = await fetchServer(`${ORIGIN}/api/stash`, {
    method: "POST",
    body: JSON.stringify({ payload, ttl }),
  });
  const body: any = await res.json();
  return body.id;
}

describe("POST /api/stash", () => {
  it("creates a short stash and returns id + url", async () => {
    const res = await fetchServer(`${ORIGIN}/api/stash`, {
      method: "POST",
      body: JSON.stringify({ payload: payloadP, ttl: "7d" }),
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.id).toMatch(/^[A-Z2-7]{6}$/);
    expect(body.url).toMatch(/^https:\/\/short\.example\.com\/s\/[A-Z2-7]{6}$/);
    expect(body.itemCount).toBe(3);
  });

  it("rejects invalid payload with 400", async () => {
    const res = await fetchServer(`${ORIGIN}/api/stash`, {
      method: "POST",
      body: JSON.stringify({ payload: "Xgarbage", ttl: "7d" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects bad ttl", async () => {
    const res = await fetchServer(`${ORIGIN}/api/stash`, {
      method: "POST",
      body: JSON.stringify({ payload: payloadP, ttl: "never" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/ttl/);
  });

  it("rejects oversize payload with 413", async () => {
    const res = await fetchServer(`${ORIGIN}/api/stash`, {
      method: "POST",
      body: JSON.stringify({ payload: "C" + "A".repeat(9000) }),
    });
    expect(res.status).toBe(413);
  });
});

describe("GET /s/:id", () => {
  it("returns JSON via ?format=json", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body: any = await res.json();
    expect(body.items).toHaveLength(3);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("returns markdown via ?format=md", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("[GitHub](https://github.com)");
  });

  it("returns plain URL list via ?format=txt", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text.split("\n")).toEqual([
      "https://github.com",
      "https://stackoverflow.com",
      "https://developer.mozilla.org",
    ]);
  });

  it("accepts format aliases (markdown, plain, text)", async () => {
    const id = await makeStash();
    for (const [alias, type] of [
      ["markdown", "text/markdown"],
      ["plain", "text/plain"],
      ["text", "text/plain"],
    ] as const) {
      const res = await fetchServer(`${ORIGIN}/s/${id}?format=${alias}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain(type);
    }
  });

  it("301-redirects the legacy .json suffix to ?format=json", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}.json`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/s/${id}?format=json`);
  });

  it("301-redirects the legacy .md and .txt suffixes", async () => {
    const id = await makeStash();
    for (const suffix of ["md", "txt"] as const) {
      const res = await fetchServer(`${ORIGIN}/s/${id}.${suffix}`, { redirect: "manual" });
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe(`${ORIGIN}/s/${id}?format=${suffix}`);
    }
  });

  it("?format= overrides the Accept header", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=md`, {
      headers: { Accept: "application/json" },
    });
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("rejects an unknown format value with 400 JSON", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=yaml`);
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(((await res.json()) as any).error).toMatch(/Unknown format/);
  });

  it("negotiates text/plain via Accept header", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}`, {
      headers: { Accept: "text/plain" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toContain("https://github.com");
  });

  it("negotiates via Accept header", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}`, {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("two different Accepts against the same id do not cross-contaminate", async () => {
    const id = await makeStash();
    const asJson = await fetchServer(`${ORIGIN}/s/${id}`, {
      headers: { Accept: "application/json" },
    });
    expect(asJson.headers.get("Content-Type")).toContain("application/json");
    const asMd = await fetchServer(`${ORIGIN}/s/${id}`, {
      headers: { Accept: "text/markdown" },
    });
    expect(asMd.headers.get("Content-Type")).toContain("text/markdown");
    const asTxt = await fetchServer(`${ORIGIN}/s/${id}`, {
      headers: { Accept: "text/plain" },
    });
    expect(asTxt.headers.get("Content-Type")).toContain("text/plain");
  });

  it("redirects to viewer SPA without a negotiated format", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/\/s#p=/);
  });

  it("404s unknown id", async () => {
    const res = await fetchServer(`${ORIGIN}/s/AAAAAA?format=json`);
    expect(res.status).toBe(404);
  });

  it("decodes a #q= (base32 QR) fixture via ?format=json", async () => {
    const id = await makeStash("7d", fixturePayload("qr-single-tab"));
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=json`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0][0]).toBe("https://github.com");
    expect(body.items[0][1]).toBe("GitHub");
  });

  it("v6 metadata (title/tags/note) survives the roundtrip", async () => {
    const spec = fixture("tagged-stash");
    const id = await makeStash("7d", fixturePayload("tagged-stash"));
    const res = await fetchServer(`${ORIGIN}/s/${id}?format=json`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.title).toBe(spec.title);
    expect(body.tags).toEqual(spec.tags);
    expect(body.note).toBe(spec.note);
    expect(body.items).toHaveLength(spec.itemCount);
  });
});

describe("maxTtl", () => {
  const cappedServer = createStashServer({
    storage: createStorage({ driver: memoryDriver() }),
    origin: ORIGIN,
    getBrotli: getBrotliFunctions,
    maxTtl: "7d",
  });

  it("rejects ttl above the configured max", async () => {
    const res = await cappedServer.handle(
      new Request(`${ORIGIN}/api/stash`, {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "30d" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/ttl/);
  });

  it("allows ttl at or below the configured max", async () => {
    const res = await cappedServer.handle(
      new Request(`${ORIGIN}/api/stash`, {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "7d" }),
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/stash/:id", () => {
  it("revokes a stash before TTL expiry (204, then 404 on read)", async () => {
    const id = await makeStash();
    const del = await fetchServer(`${ORIGIN}/api/stash/${id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const get = await fetchServer(`${ORIGIN}/s/${id}?format=json`);
    expect(get.status).toBe(404);
  });

  it("404s on unknown id", async () => {
    const res = await fetchServer(`${ORIGIN}/api/stash/AAAAAA`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed id with 404 (no route match)", async () => {
    const res = await fetchServer(`${ORIGIN}/api/stash/TOOLONG1`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("deleting an already-deleted stash returns 404", async () => {
    const id = await makeStash();
    await fetchServer(`${ORIGIN}/api/stash/${id}`, { method: "DELETE" });
    const again = await fetchServer(`${ORIGIN}/api/stash/${id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
  });

  it("accepts a lowercase id", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/api/stash/${id.toLowerCase()}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });
});

describe("defaultTtl (relay config default)", () => {
  it("POST /api/stash falls back to the configured defaultTtl", async () => {
    const srv = createStashServer({
      storage: createStorage({ driver: memoryDriver() }),
      origin: ORIGIN,
      getBrotli: getBrotliFunctions,
      defaultTtl: "1d",
      maxTtl: "1d",
    });
    const res = await srv.handle(
      new Request(`${ORIGIN}/api/stash`, {
        method: "POST",
        body: JSON.stringify({ payload: payloadP }),
      }),
    );
    expect(res.status).toBe(201);
    // default 1d is within maxTtl 1d; an explicit 7d would have been rejected
    const body: any = await res.json();
    const get = await srv.handle(new Request(`${ORIGIN}/s/${body.id}?format=json`));
    expect(get.status).toBe(200);
  });

  it("an explicit ttl above maxTtl is still rejected even with a larger default", async () => {
    const capped = createStashServer({
      storage: createStorage({ driver: memoryDriver() }),
      origin: ORIGIN,
      getBrotli: getBrotliFunctions,
      defaultTtl: "7d",
      maxTtl: "7d",
    });
    const res = await capped.handle(
      new Request(`${ORIGIN}/api/stash`, {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "30d" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("the MCP ttlDays default comes from config", async () => {
    const srv = createStashServer({
      storage: createStorage({ driver: memoryDriver() }),
      origin: ORIGIN,
      getBrotli: getBrotliFunctions,
      defaultTtl: "1d",
    });
    const res = await srv.handle(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    const body: any = await res.json();
    const create = body.result.tools.find((t: any) => t.name === "stash_create");
    const schema = JSON.stringify(create.inputSchema);
    expect(schema).toContain('"default":1');
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await fetchServer(`${ORIGIN}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("roundtrip through real storage", () => {
  it("stored payload decodes back identically", async () => {
    const id = await makeStash("1d");
    const raw = await storage.getItem(id);
    expect(raw).not.toBeNull();
    const entry = raw as { p: string };
    const brotli = await getBrotliFunctions();
    const decoded = await decodeEncodedPayload(entry.p, brotli);
    expect(decoded.items).toHaveLength(3);
    expect(decoded.items.map(([url]) => url)).toContain("https://github.com");
  });
});

describe("rate limiting", () => {
  let limitedServer: ReturnType<typeof createStashServer>;
  let storage2: Storage;

  function fakeLimiter(shouldSucceed = true) {
    let calls = 0;
    return {
      limit: async () => {
        calls++;
        return { success: shouldSucceed };
      },
      getCalls: () => calls,
    };
  }

  beforeAll(() => {
    storage2 = createStorage({ driver: memoryDriver() });
  });

  function rebuildServer(limiter: unknown) {
    limitedServer = createStashServer({
      storage: storage2,
      origin: ORIGIN,
      getBrotli: getBrotliFunctions,
      rateLimiter: {
        stash: limiter as never,
        mcp: limiter as never,
      },
    });
    return limitedServer;
  }

  function postStash(srv = limitedServer) {
    return srv.handle(
      new Request(`${ORIGIN}/api/stash`, {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "7d" }),
      }),
    );
  }

  it("returns 429 with Retry-After when the limiter denies POST /api/stash", async () => {
    rebuildServer(fakeLimiter(false));
    const res = await postStash();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  it("passes when the limiter allows", async () => {
    rebuildServer(fakeLimiter(true));
    const res = await postStash();
    expect(res.status).toBe(201);
  });

  it("fails closed for POST /api/stash when limit() throws", async () => {
    rebuildServer({
      limit: async () => {
        throw new Error("boom");
      },
    });
    const res = await postStash();
    expect(res.status).toBe(429);
  });

  it("fails closed for POST /mcp when limit() throws", async () => {
    rebuildServer({
      limit: async () => {
        throw new Error("boom");
      },
    });
    const res = await limitedServer.handle(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it("fails closed for POST /mcp when the binding returns success: false", async () => {
    rebuildServer(fakeLimiter(false));
    const res = await limitedServer.handle(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it("DELETE /api/stash/:id returns 429 when the limiter denies", async () => {
    rebuildServer(fakeLimiter(false));
    const res = await limitedServer.handle(
      new Request(`${ORIGIN}/api/stash/AAAAAA`, { method: "DELETE" }),
    );
    expect(res.status).toBe(429);
  });

  it("DELETE /api/stash/:id fails closed when limit() throws", async () => {
    rebuildServer({
      limit: async () => {
        throw new Error("boom");
      },
    });
    const res = await limitedServer.handle(
      new Request(`${ORIGIN}/api/stash/AAAAAA`, { method: "DELETE" }),
    );
    expect(res.status).toBe(429);
  });

  it("fails open when the binding is absent", async () => {
    const srv = createStashServer({
      storage: storage2,
      origin: ORIGIN,
      getBrotli: getBrotliFunctions,
    });
    const res = await postStash(srv);
    expect(res.status).toBe(201);
  });

  it("returns 429 JSON-RPC error when the limiter denies POST /mcp", async () => {
    rebuildServer(fakeLimiter(false));
    const res = await limitedServer.handle(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: expect.any(String) },
    });
  });

  it("does not rate-limit GET /mcp", async () => {
    const limiter = fakeLimiter(false);
    rebuildServer(limiter);
    const res = await limitedServer.handle(new Request(`${ORIGIN}/mcp`));
    expect(res.status).not.toBe(429);
    expect(limiter.getCalls()).toBe(0);
  });

  it("GET /s/:id and GET /health are exempt", async () => {
    const allow = rebuildServer(fakeLimiter(true));
    const created = await postStash(allow);
    const { id } = (await created.json()) as { id: string };

    const limiter = fakeLimiter(false);
    rebuildServer(limiter);
    const res = await limitedServer.handle(new Request(`${ORIGIN}/s/${id}?format=json`));
    expect(res.status).toBe(200);
    expect(limiter.getCalls()).toBe(0);
    const health = await limitedServer.handle(new Request(`${ORIGIN}/health`));
    expect(health.status).toBe(200);
  });
});
