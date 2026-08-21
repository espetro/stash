import { describe, it, expect, beforeAll } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createPayload, encodePayloadToUrl } from "@stash/codec";
import { getBrotli } from "../brotli";
import worker from "../index";
import type { Env } from "../index";

const mockEnv: Env = {
  TEST_STORAGE: createStorage({ driver: memoryDriver() }),
};

function fetchWorker(url: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(url, init), mockEnv, {
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext);
}

function fakeLimiter(shouldSucceed = true) {
  let calls = 0;
  return {
    limit: async () => {
      calls++;
      return { success: shouldSucceed };
    },
    getCalls: () => calls,
  } as unknown as RateLimit & { getCalls(): number };
}

let payloadP: string;

beforeAll(async () => {
  const brotli = await getBrotli();
  const tabs = [
    { url: "https://github.com", title: "GitHub" },
    { url: "https://developer.mozilla.org", title: "MDN" },
  ];
  payloadP = await encodePayloadToUrl(createPayload(tabs, 24, "Agent Test"), brotli);
});

function postStash() {
  return fetchWorker("https://short.example.com/api/stash", {
    method: "POST",
    body: JSON.stringify({ payload: payloadP, ttl: "7d" }),
  });
}

describe("rate limiting: POST /api/stash", () => {
  it("passes when the limiter allows", async () => {
    mockEnv.RL_STASH = fakeLimiter(true);
    const res = await postStash();
    expect(res.status).toBe(201);
  });

  it("returns 429 with Retry-After when the limiter denies", async () => {
    mockEnv.RL_STASH = fakeLimiter(false);
    const res = await postStash();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  it("fails open when limit() throws", async () => {
    mockEnv.RL_STASH = {
      limit: async () => {
        throw new Error("boom");
      },
    } as unknown as RateLimit;
    const res = await postStash();
    expect(res.status).toBe(201);
  });

  it("fails open when the binding is absent", async () => {
    delete mockEnv.RL_STASH;
    const res = await postStash();
    expect(res.status).toBe(201);
  });
});

describe("rate limiting: POST /mcp", () => {
  it("returns 429 with JSON-RPC error shape when the limiter denies", async () => {
    mockEnv.RL_MCP = fakeLimiter(false);
    const res = await fetchWorker("https://short.example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
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
    mockEnv.RL_MCP = limiter;
    const res = await fetchWorker("https://short.example.com/mcp");
    expect(res.status).not.toBe(429);
    expect(limiter.getCalls()).toBe(0);
  });
});

describe("rate limiting: exempt routes", () => {
  it("GET /s/:id is unaffected when the limiter denies", async () => {
    mockEnv.RL_STASH = fakeLimiter(true);
    const created = await postStash();
    const { id } = (await created.json()) as { id: string };

    const limiter = fakeLimiter(false);
    mockEnv.RL_STASH = limiter;
    const res = await fetchWorker(`https://short.example.com/s/${id}.json`);
    expect(res.status).toBe(200);
    expect(limiter.getCalls()).toBe(0);
  });

  it("GET /health is unaffected when the limiter denies", async () => {
    mockEnv.RL_STASH = fakeLimiter(false);
    const res = await fetchWorker("https://short.example.com/health");
    expect(res.status).toBe(200);
  });
});
