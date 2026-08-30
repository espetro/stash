import { describe, it, expect, beforeAll } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createPayload, encodePayloadToUrl } from "@stash/codec";
import { handleMirrorRequest } from "../index";
import { getBrotli } from "../brotli";

const storage = createStorage({ driver: memoryDriver() });

function mirror(url: string, init?: RequestInit): Promise<Response> {
  return handleMirrorRequest(new Request(url, init), { storage });
}

let payloadP: string;

beforeAll(async () => {
  const brotli = await getBrotli();
  const tabs = [
    { url: "https://github.com", title: "GitHub" },
    { url: "https://developer.mozilla.org", title: "MDN" },
  ];
  payloadP = await encodePayloadToUrl(createPayload(tabs, 24, "Mirror Test"), brotli);
});

describe("mirror probe target /llms.txt", () => {
  it("is present, plain text, and cacheable", async () => {
    const res = await mirror("https://mirror.example.com/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Cache-Control")).toContain("max-age");
    expect(await res.text()).toContain("stash mirror");
  });
});

describe("mirror health", () => {
  it("reports the mirror role", async () => {
    const res = await mirror("https://mirror.example.com/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: "mirror" });
  });
});

describe("mirror relay round trip", () => {
  it("POST /api/stash then GET /s/:id?format=json", async () => {
    const created = await mirror("https://mirror.example.com/api/stash", {
      method: "POST",
      body: JSON.stringify({ payload: payloadP, ttl: "7d" }),
    });
    expect(created.status).toBe(201);
    const { id, url } = (await created.json()) as { id: string; url: string };
    expect(url).toBe(`https://mirror.example.com/s/${id}`);

    const fetched = await mirror(`https://mirror.example.com/s/${id}?format=json`);
    expect(fetched.status).toBe(200);
    const body = (await fetched.json()) as { items: Array<[string, string]> };
    expect(body.items.map((i) => i[0])).toContain("https://github.com");
  });

  it("DELETE /api/stash/:id revokes", async () => {
    const created = await mirror("https://mirror.example.com/api/stash", {
      method: "POST",
      body: JSON.stringify({ payload: payloadP, ttl: "1d" }),
    });
    const { id } = (await created.json()) as { id: string };

    const del = await mirror(`https://mirror.example.com/api/stash/${id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const gone = await mirror(`https://mirror.example.com/s/${id}?format=json`);
    expect(gone.status).toBe(404);
  });

  it("discovery card advertises the mirror origin", async () => {
    const res = await mirror("https://mirror.example.com/.well-known/mcp-server-card");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toContain("https://mirror.example.com");
  });
});

describe("mirror decode surface (W1 handlers)", () => {
  it("GET /s?p=..&format=json decodes", async () => {
    const res = await mirror(`https://mirror.example.com/s?p=${payloadP}&format=json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title?: string; items: unknown[] };
    expect(body.title).toBe("Mirror Test");
    expect(body.items).toHaveLength(2);
  });

  it("unknown format is a 400 client error", async () => {
    const res = await mirror(`https://mirror.example.com/s?p=${payloadP}&format=yaml`);
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });
});
