import { describe, it, expect, beforeAll } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createPayload, encodePayloadToUrl, decodeEncodedPayload } from "@stash/codec";
import { getBrotli } from "../brotli";
import worker from "../index";
import type { Env } from "../store";

// One shared storage instance across tests: existing tests rely on
// read-after-write flows against shared state.
const mockEnv: Env = {
  TEST_STORAGE: createStorage({ driver: memoryDriver() }),
};

function fetchWorker(url: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(url, init), mockEnv, {
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext);
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

async function makeStash(ttl = "30d"): Promise<string> {
  const res = await fetchWorker("https://short.example.com/api/stash", {
    method: "POST",
    body: JSON.stringify({ payload: payloadP, ttl }),
  });
  const body: any = await res.json();
  return body.id;
}

describe("POST /api/stash", () => {
  it("creates a short stash and returns id + url", async () => {
    const res = await fetchWorker("https://short.example.com/api/stash", {
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
    const res = await fetchWorker("https://short.example.com/api/stash", {
      method: "POST",
      body: JSON.stringify({ payload: "Xgarbage", ttl: "7d" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects bad ttl", async () => {
    const res = await fetchWorker("https://short.example.com/api/stash", {
      method: "POST",
      body: JSON.stringify({ payload: payloadP, ttl: "never" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/ttl/);
  });

  it("rejects oversize payload with 413", async () => {
    const res = await fetchWorker("https://short.example.com/api/stash", {
      method: "POST",
      body: JSON.stringify({ payload: "C" + "A".repeat(9000) }),
    });
    expect(res.status).toBe(413);
  });
});

describe("GET /s/:id", () => {
  it("returns JSON via .json suffix", async () => {
    const id = await makeStash();
    const res = await fetchWorker(`https://short.example.com/s/${id}.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body: any = await res.json();
    expect(body.title).toBe("Agent Test");
    expect(body.items).toHaveLength(2);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("returns markdown via .md suffix", async () => {
    const id = await makeStash();
    const res = await fetchWorker(`https://short.example.com/s/${id}.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("# Agent Test");
    expect(text).toContain("[GitHub](https://github.com)");
  });

  it("negotiates via Accept header", async () => {
    const id = await makeStash();
    const res = await fetchWorker(`https://short.example.com/s/${id}`, {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("redirects to viewer SPA without suffix", async () => {
    const id = await makeStash();
    const res = await fetchWorker(`https://short.example.com/s/${id}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/\/s#p=/);
  });

  it("404s unknown id", async () => {
    const res = await fetchWorker("https://short.example.com/s/AAAAAA.json");
    expect(res.status).toBe(404);
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await fetchWorker("https://short.example.com/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("roundtrip through real storage", () => {
  it("stored payload decodes back identically", async () => {
    const id = await makeStash("1d");
    const raw = await mockEnv.TEST_STORAGE!.getItem(id);
    expect(raw).not.toBeNull();
    const entry = raw as { p: string };
    const brotli = await getBrotli();
    const decoded = await decodeEncodedPayload(entry.p, brotli);
    expect(decoded.title).toBe("Agent Test");
    expect(decoded.items).toHaveLength(2);
  });
});
