import { describe, it, expect, beforeAll } from "vitest";
import { createStorage, type Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createPayload, encodePayloadToUrl, decodeEncodedPayload } from "@stash/codec";
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

let payloadP: string;

beforeAll(async () => {
  const brotli = await getBrotliFunctions();
  const tabs = [
    { url: "https://github.com", title: "GitHub" },
    { url: "https://developer.mozilla.org", title: "MDN" },
  ];
  payloadP = await encodePayloadToUrl(createPayload(tabs, 24, "Agent Test"), brotli);
});

async function makeStash(ttl = "30d"): Promise<string> {
  const res = await fetchServer(`${ORIGIN}/api/stash`, {
    method: "POST",
    body: JSON.stringify({ payload: payloadP, ttl }),
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
    expect(body.itemCount).toBe(2);
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
  it("returns JSON via .json suffix", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body: any = await res.json();
    expect(body.title).toBe("Agent Test");
    expect(body.items).toHaveLength(2);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("returns markdown via .md suffix", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("# Agent Test");
    expect(text).toContain("[GitHub](https://github.com)");
  });

  it("negotiates via Accept header", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}`, {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("redirects to viewer SPA without suffix", async () => {
    const id = await makeStash();
    const res = await fetchServer(`${ORIGIN}/s/${id}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/\/s#p=/);
  });

  it("404s unknown id", async () => {
    const res = await fetchServer(`${ORIGIN}/s/AAAAAA.json`);
    expect(res.status).toBe(404);
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
    expect(decoded.title).toBe("Agent Test");
    expect(decoded.items).toHaveLength(2);
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

  it("fails open when limit() throws", async () => {
    rebuildServer({
      limit: async () => {
        throw new Error("boom");
      },
    });
    const res = await postStash();
    expect(res.status).toBe(201);
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
    const res = await limitedServer.handle(new Request(`${ORIGIN}/s/${id}.json`));
    expect(res.status).toBe(200);
    expect(limiter.getCalls()).toBe(0);
    const health = await limitedServer.handle(new Request(`${ORIGIN}/health`));
    expect(health.status).toBe(200);
  });
});
