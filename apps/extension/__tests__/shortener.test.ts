import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webcrypto } from "node:crypto";

// happy-dom may lack WebCrypto; use node's implementation explicitly.
if (!globalThis.crypto?.subtle) {
  (globalThis as any).crypto = webcrypto;
}

const { generateShareKey, encryptForRelay } = await vi.importActual<
  typeof import("@stash/shared/crypto")
>("@stash/shared/crypto");

// Mock the barrel to avoid brotli-wasm side effects; crypto is real.
vi.mock("@stash/shared", () => ({
  generateShareKey,
  encryptForRelay,
  getDomain: (url: string) => url,
  getFaviconUrl: (url: string) => url,
}));

const { createShortLink, shortenShareUrl } = await import("../lib/shortener");

const ORIGIN = "https://s.example.com";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

async function fetchBody(): Promise<string> {
  return vi.mocked(fetch).mock.calls[0]![1]!.body as string;
}

describe("createShortLink (zero-trust relay)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch(201, { id: "ABC234", url: `${ORIGIN}/s/ABC234` }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads ciphertext and returns a fragment-keyed share URL", async () => {
    const result = await createShortLink({
      payload: "Csomeencodedpayload",
      ttlDays: 7,
      shortenerOrigin: ORIGIN,
    });
    expect(result).toHaveProperty("url");
    const url = (result as { url: string }).url;
    const key = url.slice(url.indexOf("#") + 1);
    expect(url.startsWith(`${ORIGIN}/s/ABC234#`)).toBe(true);
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const body = JSON.parse(await fetchBody());
    expect(body.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.ciphertext).not.toContain("someencodedpayload");
    expect(body.ttl).toBe("7d");
    // The request body must not contain the key
    expect(body.ciphertext.endsWith(key)).toBe(false);
  });

  it("never sends the plaintext payload in the request body", async () => {
    await createShortLink({ payload: "CSECRETCONTENT", ttlDays: 7, shortenerOrigin: ORIGIN });
    expect(await fetchBody()).not.toContain("SECRETCONTENT");
  });

  it("falls back on non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetch(429, { error: "Too many requests" }));
    const result = await createShortLink({
      payload: "Csomepayload",
      ttlDays: 7,
      shortenerOrigin: ORIGIN,
    });
    expect(result).toEqual({ fallback: true });
  });

  it("falls back on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await createShortLink({
      payload: "Csomepayload",
      ttlDays: 7,
      shortenerOrigin: ORIGIN,
    });
    expect(result).toEqual({ fallback: true });
  });
});

describe("shortenShareUrl (zero-trust relay)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shortens a #p= link into /s/<id>#<key>", async () => {
    vi.stubGlobal("fetch", mockFetch(201, { id: "XYZ789", url: `${ORIGIN}/s/XYZ789` }));
    const result = await shortenShareUrl("https://viewer.example/s#p=Cpayloaddata", ORIGIN);
    expect(result).toHaveProperty("url");
    expect((result as { url: string }).url).toMatch(
      new RegExp(`^${ORIGIN.replace(".", "\\.")}/s/XYZ789#[A-Za-z0-9_-]{22}$`),
    );
    const body = JSON.parse(await fetchBody());
    expect(body.ciphertext).not.toContain("payloaddata");
  });

  it("falls back for non-payload URLs", async () => {
    const result = await shortenShareUrl("https://viewer.example/s", ORIGIN);
    expect(result).toEqual({ fallback: true });
  });
});
