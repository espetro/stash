import { describe, it, expect, beforeAll } from "vitest";
import { createStorage, type Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import worker from "../index";
import { createPayload, encodePayloadToUrl } from "@stash/codec";
import brotliWasm from "brotli-wasm";

let env: { TEST_STORAGE: Storage };
let payloadP: string;

beforeAll(async () => {
  const m = (brotliWasm as any).default ?? brotliWasm;
  const brotli = {
    compress: (d: Uint8Array, o: any) => m.compress(d, o),
    decompress: (d: Uint8Array) => m.decompress(d),
  };
  env = { TEST_STORAGE: createStorage({ driver: memoryDriver() }) };
  const tabs = [
    { url: "https://github.com", title: "GitHub" },
    { url: "https://developer.mozilla.org", title: "MDN" },
  ];
  payloadP = await encodePayloadToUrl(createPayload(tabs, 24, "Agent Test"), brotli);
});

function req(path: string, init: RequestInit = {}): Request {
  return new Request("https://short.example.com" + path, init);
}

describe("POST /api/stash", () => {
  it("creates a short stash and returns id + url", async () => {
    const res = await worker.fetch(
      req("/api/stash", {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "7d" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.id).toMatch(/^[A-Z2-7]{6}$/);
    expect(body.url).toMatch(/^https:\/\/short\.example\.com\/s\/[A-Z2-7]{6}$/);
    expect(body.itemCount).toBe(2);
  });

  it("rejects invalid payload with 400", async () => {
    const res = await worker.fetch(
      req("/api/stash", {
        method: "POST",
        body: JSON.stringify({ payload: "Xgarbage", ttl: "7d" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects bad ttl", async () => {
    const res = await worker.fetch(
      req("/api/stash", {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "never" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/ttl/);
  });

  it("rejects oversize payload with 413", async () => {
    const res = await worker.fetch(
      req("/api/stash", {
        method: "POST",
        body: JSON.stringify({ payload: "C" + "A".repeat(9000) }),
      }),
      env,
    );
    expect(res.status).toBe(413);
  });
});

describe("GET /s/:id", () => {
  async function makeStash(): Promise<string> {
    const res = await worker.fetch(
      req("/api/stash", {
        method: "POST",
        body: JSON.stringify({ payload: payloadP, ttl: "30d" }),
      }),
      env,
    );
    return ((await res.json()) as any).id;
  }

  it("returns JSON via .json suffix", async () => {
    const id = await makeStash();
    const res = await worker.fetch(req(`/s/${id}.json`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body: any = await res.json();
    expect(body.title).toBe("Agent Test");
    expect(body.items).toHaveLength(2);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("returns markdown via .md suffix", async () => {
    const id = await makeStash();
    const res = await worker.fetch(req(`/s/${id}.md`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("# Agent Test");
    expect(text).toContain("[GitHub](https://github.com)");
  });

  it("negotiates via Accept header", async () => {
    const id = await makeStash();
    const res = await worker.fetch(
      req(`/s/${id}`, { headers: { Accept: "application/json" } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("redirects to viewer SPA without suffix", async () => {
    const id = await makeStash();
    const res = await worker.fetch(req(`/s/${id}`), env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/\/s#p=/);
  });

  it("404s unknown id", async () => {
    const res = await worker.fetch(req("/s/AAAAAA.json"), env);
    expect(res.status).toBe(404);
  });

  it("405s non-GET/POST methods on known routes", async () => {
    const res = await worker.fetch(req("/api/stash", { method: "DELETE" }), env);
    expect([404, 405]).toContain(res.status);
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await worker.fetch(req("/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
