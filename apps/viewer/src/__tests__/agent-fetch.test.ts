import { describe, it, expect, beforeAll } from "vitest";
import { onRequest as sHandler } from "../../functions/s";
import { createPayload } from "@stash/codec";
import { encodePayloadToUrl } from "@stash/codec";

let payloadP: string;

beforeAll(async () => {
  const brotliWasm = (await import("brotli-wasm")) as any;
  const brotli = {
    compress: (d: Uint8Array, o: any) => brotliWasm.compress(d, o),
    decompress: (d: Uint8Array) => brotliWasm.decompress(d),
  };
  const tabs = [
    { url: "https://github.com", title: "GitHub" },
    { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
  ];
  const p = createPayload(tabs, 24, "Agent Test");
  payloadP = await encodePayloadToUrl(p, brotli);
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
    expect(body.title).toBe("Agent Test");
    expect(body.items).toHaveLength(2);
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

  it("GET /s?p= with Accept: application/json renders JSON", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}`, { Accept: "application/json" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.items).toHaveLength(2);
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
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9",
      }),
    );
    expect(await res.text()).toContain("SPA shell");
  });

  it("GET /s?p= with Accept: text/plain renders plain URL list", async () => {
    const res = await sHandler(makeContext(`/s?p=${payloadP}`, { Accept: "text/plain" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("https://github.com\nhttps://developer.mozilla.org");
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
});
