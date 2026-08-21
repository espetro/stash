import { describe, it, expect, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { handleBridgeRequest, isBridgeRequest } from "../lib/server/bridge";

// happy-dom's URL returns a null origin for chrome-extension:// URLs, so
// derive the origin by trimming the trailing slash off getURL("").
const ORIGIN = fakeBrowser.runtime.getURL("").replace(/\/$/, "");

// Identity "brotli": symmetric so codec paths roundtrip without wasm.
vi.mock("@stash/shared", () => ({
  getBrotliFunctions: async () => ({
    compress: (data: Uint8Array) => data,
    decompress: (data: Uint8Array) => data,
  }),
  getDomain: (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  },
  getFaviconUrl: (url: string) => `https://www.google.com/s2/favicons?domain=${url}&sz=32`,
}));

describe("isBridgeRequest", () => {
  it("accepts a valid request", () => {
    expect(
      isBridgeRequest({ type: "stash-bridge-request", id: 1, method: "GET", url: `${ORIGIN}/health` }),
    ).toBe(true);
  });

  it("rejects non-objects, wrong type, missing fields", () => {
    expect(isBridgeRequest(null)).toBe(false);
    expect(isBridgeRequest("nope")).toBe(false);
    expect(isBridgeRequest({ type: "stash-bridge-response", id: 1, method: "GET", url: "x" })).toBe(false);
    expect(isBridgeRequest({ type: "stash-bridge-request", method: "GET", url: "x" })).toBe(false);
    expect(isBridgeRequest({ type: "stash-bridge-request", id: "1", method: "GET", url: "x" })).toBe(false);
    expect(isBridgeRequest({ type: "stash-bridge-request", id: 1, method: 5, url: "x" })).toBe(false);
  });
});

describe("handleBridgeRequest", () => {
  it("GET /health -> 200 {ok:true}", async () => {
    const res = await handleBridgeRequest({ type: "stash-bridge-request", id: 42, method: "GET", url: `${ORIGIN}/health` });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body!)).toEqual({ ok: true });
  });

  it("GET unknown path -> 404", async () => {
    const res = await handleBridgeRequest({ type: "stash-bridge-request", id: 7, method: "GET", url: `${ORIGIN}/nope` });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body!).error).toBe("Not found");
  });

  it("POST /api/stash with invalid payload prefix -> 400", async () => {
    const res = await handleBridgeRequest({
      type: "stash-bridge-request",
      id: 9,
      method: "POST",
      url: `${ORIGIN}/api/stash`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "Xinvalid" }),
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body!).error).toMatch(/Unknown payload prefix/);
  });

  it("POST /api/stash missing payload -> 400", async () => {
    const res = await handleBridgeRequest({
      type: "stash-bridge-request",
      id: 10,
      method: "POST",
      url: `${ORIGIN}/api/stash`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: "7d" }),
    });
    expect(res.status).toBe(400);
  });

  it("echoes type and id in the response shape", async () => {
    const res = await handleBridgeRequest({ type: "stash-bridge-request", id: 123, method: "GET", url: `${ORIGIN}/health` });
    expect(res.type).toBe("stash-bridge-response");
    expect(res.id).toBe(123);
    expect(typeof res.headers).toBe("object");
    expect(typeof res.status).toBe("number");
  });
});
