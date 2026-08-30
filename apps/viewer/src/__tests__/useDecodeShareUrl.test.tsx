// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { generateShareKey, encryptForRelay } from "@stash/shared/crypto";
import { useDecodeShareUrl } from "../hooks/useDecodeShareUrl";

if (!globalThis.crypto?.subtle) {
  (globalThis as any).crypto = webcrypto;
}

vi.mock("@stash/shared", () => ({
  getBrotliFunctions: async () => {
    const mod = await import("@stash/codec");
    const brotli = await import("brotli-wasm");
    return brotli as unknown as Awaited<ReturnType<typeof getRealBrotli>>;
  },
}));

async function getRealBrotli() {
  return import("brotli-wasm");
}

vi.mock("@/lib/shortener", () => ({
  getShortenerOrigin: () => "https://s.example.com",
}));

// Real codec decode (decodeEncodedPayload) needs actual brotli; get it
// through the codec package's own test utilities.
vi.mock("@stash/codec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stash/codec")>();
  return actual;
});

function setWindowUrl(url: string) {
  const u = new URL(url);
  window.history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`);
}

async function makeRelayEntry(): Promise<{ id: string; key: string; ciphertext: string }> {
  const { decodeEncodedPayload, encodePayloadToUrl, createPayload } = await import("@stash/codec");
  const brotli = await import("brotli-wasm");
  const payload = await encodePayloadToUrl(
    createPayload([
      { url: "https://github.com", title: "GitHub" },
      { url: "https://mdn.dev", title: "MDN" },
    ]),
    brotli as never,
  );
  const key = generateShareKey();
  const ciphertext = await encryptForRelay(payload, key);
  void decodeEncodedPayload;
  return { id: "ABC234", key, ciphertext };
}

describe("useDecodeShareUrl — relayed links (zero-trust)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setWindowUrl("http://localhost:4321/s");
  });

  it("fetches the ciphertext, decrypts with the fragment key, and decodes", async () => {
    const { id, key, ciphertext } = await makeRelayEntry();
    setWindowUrl(`http://localhost:4321/s?id=${id}#${key}`);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id, ciphertext, encrypted: true }), { status: 200 }),
        ),
    );

    const { result } = renderHook(() => useDecodeShareUrl());
    await waitFor(() => expect(result.current.type).not.toBe("loading"));
    expect(result.current.type).toBe("content");
    if (result.current.type === "content") {
      expect(result.current.data.items.map(([, t]) => t)).toContain("GitHub");
    }
  });

  it("fails closed with an explicit message when the fragment key is missing", async () => {
    setWindowUrl("http://localhost:4321/s?id=ABC234");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useDecodeShareUrl());
    await waitFor(() => expect(result.current.type).not.toBe("loading"));
    expect(result.current.type).toBe("error");
    if (result.current.type === "error") {
      expect(result.current.message).toMatch(/Link incomplete/);
    }
    // Fail-closed: never round-trips to the server without the key
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a decryption error on tampered ciphertext", async () => {
    const { id, key, ciphertext } = await makeRelayEntry();
    setWindowUrl(`http://localhost:4321/s?id=${id}#${key}`);
    const tampered = ciphertext.slice(0, -1) + (ciphertext.endsWith("A") ? "B" : "A");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id, ciphertext: tampered, encrypted: true }), {
            status: 200,
          }),
        ),
    );

    const { result } = renderHook(() => useDecodeShareUrl());
    await waitFor(() => expect(result.current.type).not.toBe("loading"));
    expect(result.current.type).toBe("error");
    if (result.current.type === "error") {
      expect(result.current.message).toMatch(/Decryption failed/);
    }
  });

  it("shows expiry message when the relay returns 404", async () => {
    const { key } = await makeRelayEntry();
    setWindowUrl(`http://localhost:4321/s?id=ZZZ222#${key}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));

    const { result } = renderHook(() => useDecodeShareUrl());
    await waitFor(() => expect(result.current.type).not.toBe("loading"));
    expect(result.current.type).toBe("error");
    if (result.current.type === "error") {
      expect(result.current.message).toMatch(/expired or was revoked/);
    }
  });
});

describe("useDecodeShareUrl — self-contained links unchanged", () => {
  it("still errors gracefully when there is no data at all", async () => {
    setWindowUrl("http://localhost:4321/s");
    const { result } = renderHook(() => useDecodeShareUrl());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.type).toBe("error");
    if (result.current.type === "error") {
      expect(result.current.message).toMatch(/No share data/);
    }
  });
});
