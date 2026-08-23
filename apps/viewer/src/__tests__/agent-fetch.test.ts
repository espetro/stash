import { describe, it, expect, beforeAll, vi } from "vitest";
import { onRequest as sHandler } from "../../functions/s";
import { loadPayloadFixtures } from "@stash/shared/fixtures";
import payloadsJson from "@stash/shared/fixtures/payloads.json";
import * as decodeModule from "../../functions/_shared/decode";

const fixtures = loadPayloadFixtures(payloadsJson);

/** Payload string (everything after #p= / #q=) for a named fixture. */
function payloadOf(name: string): string {
  const fixture = fixtures.find((f) => f.name === name);
  if (!fixture) throw new Error(`missing fixture: ${name}`);
  return fixture.fragment.slice(3);
}

let payloadP: string;
let qrPayload: string;
let taggedFixture: (typeof fixtures)[number];

beforeAll(() => {
  payloadP = payloadOf("three-tabs");
  qrPayload = payloadOf("qr-single-tab");
  taggedFixture = fixtures.find((f) => f.name === "tagged-stash")!;
});

function makeContext(path: string, headers: Record<string, string> = {}) {
  const url = new URL("https://stash.illo.fyi" + path);
  const request = new Request(url, { headers });
  return {
    request,
    next: async () => new Response("<html>SPA shell</html>", { status: 200 }),
  };
}

describe("agent-equivalent fetch (no JS execution)", () => {
  it("GET /s?p=...&format=json returns decoded JSON", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}&format=json`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toMatchObject({ url: "https://github.com", title: "GitHub" });
  });

  it("GET /s?p=...&format=md returns markdown list", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}&format=md`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("[GitHub](https://github.com)");
  });

  it("GET /s?p=...&format=txt returns plain URL list", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}&format=txt`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toContain("https://github.com");
  });

  it("GET /s?p=...&format=markdown aliases to md", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}&format=markdown`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("GET /s?p= with unknown format returns 400 JSON", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}&format=yaml`));
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toMatch(/format/i);
  });

  it("explicit format overrides the Accept header", async () => {
    const res = await sHandler(
      makeContext(`/s?p=${payloadP}&format=json`, { Accept: "text/markdown" }),
    );
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("GET /s?p= with Accept: application/json renders JSON", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}`, { Accept: "application/json" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.items).toHaveLength(3);
  });

  it("GET /s?p= with Accept: text/markdown renders markdown", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}`, { Accept: "text/markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(await res.text()).toContain("[GitHub](https://github.com)");
  });

  it("browser Accept (text/html first) falls through to SPA", async () => {
    const res = await sHandler(
      makeContext(`/s?p=${payloadP}`, {
        Accept: "text/html,application/xhtml+xml,image/webp,*/*;q=0.8",
      }),
    );
    expect(await res.text()).toContain("SPA shell");
  });

  it("GET /s?p= with Accept: text/plain renders plain URL list", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}`, { Accept: "text/plain" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text.split("\n")).toEqual([
      "https://github.com",
      "https://stackoverflow.com",
      "https://developer.mozilla.org",
    ]);
  });

  it("OPTIONS /s returns 204 with CORS headers", async () => {
    const request = new Request("https://stash.illo.fyi/s?p=x", { method: "OPTIONS" });
    const res = await sHandler({ request, next: async () => new Response("SPA") });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("GET /s without p falls through to SPA (fragment never reaches server)", async () => {
    const res = await sHandler(makeContext("/s/"));
    expect(await res.text()).toContain("SPA shell");
  });

  it("malformed payload returns 400 with helpful error", async () => {
    const res = await sHandler(makeContext("/s?p=Xnotvalid&format=json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/payload/i);
  });

  it("#q= (base32) fixture decodes through /s?p=&format=json", async () => {
    const res = await sHandler(makeContext(`/s?p=${qrPayload}&format=json`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ url: "https://github.com", title: "GitHub" });
  });

  it("v6 metadata (tags, note, title) survives the JSON surface", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadOf("tagged-stash")}&format=json`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe(taggedFixture.title);
    expect(body.tags).toEqual(taggedFixture.tags);
    expect(body.note).toBe(taggedFixture.note);
  });

  it("non-decode server error returns 500 JSON when a format was negotiated", async () => {
    const spy = vi
      .spyOn(decodeModule, "decodePayload")
      .mockRejectedValue(new Error("brotli init exploded"));
    try {
      const res = await sHandler(makeContext(`/s?p=${payloadP}&format=json`));
      expect(res.status).toBe(500);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      const body = await res.json();
      expect(body.error).toMatch(/brotli init exploded/);
    } finally {
      spy.mockRestore();
    }
  });
});
