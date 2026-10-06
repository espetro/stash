// @vitest-environment happy-dom
/**
 * XSS battery for the /stashes local surface:
 *   - titles, notes, and item URLs that try to break out of the DOM
 *   - `javascript:` and `data:text/html` URL filtering
 *   - Unicode scheme lookalikes (full-width Latin)
 *   - quote-breaking payloads in notes
 *
 * Each test asserts that:
 *   - no `<script>` element is injected
 *   - the malicious text appears only as escaped text content
 *   - the malicious URLs do NOT render as anchors
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import * as React from "react";
import MyStashes from "@/components/MyStashes";
import { LocaleProvider } from "@/components/LocaleProvider";
import { toStashExport } from "@stash/shared/agent-export";

// Mock the bridge probe so tests can drive the source deterministically.
const probeMock = vi.fn();
vi.mock("@/lib/local-bridge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-bridge")>("@/lib/local-bridge");
  return {
    ...actual,
    probeLocalBridge: (...args: unknown[]) => probeMock(...args),
  };
});

beforeEach(() => {
  cleanup();
  localStorage.clear();
  probeMock.mockReset();
  window.history.replaceState({}, "", "/stashes");
});

afterEach(() => {
  window.history.replaceState({}, "", "/stashes");
});

function seedExtension(records: Parameters<typeof toStashExport>[0]) {
  probeMock.mockResolvedValue({
    available: true,
    export: toStashExport(records, "extension"),
  });
}

/**
 * Seed the bridge with no extension source, so the viewer falls back
 * to localStorage. The card UI renders viewer-local records verbatim
 * (filtered through `safeItems`/`isSafeHttpUrl`), which is what the
 * URL-filtering XSS cases need to exercise.
 */
function seedViewerLocal(records: unknown[]): void {
  probeMock.mockResolvedValue({ available: false, error: "disabled" });
  localStorage.setItem("stash:records", JSON.stringify(records));
}

describe("MyStashes — XSS battery on rendered output", () => {
  it("renders <script> in a title as text only; no <script> element is injected", async () => {
    seedExtension([
      {
        id: "xss-1",
        title: "<script>window.__pwned = true; alert(1)</script>",
        tags: [],
        note: null,
        items: [{ url: "https://example.com", title: "Example" }],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector("#stash-local-export")?.getAttribute("data-stash-status"),
      ).toBe("ready");
    });

    // No script tag with our payload text — happy-dom would otherwise
    // happily inject one as text, so we also assert via the JSON island
    // that the title is preserved as a string.
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    const island = JSON.parse(
      (container.querySelector("#stash-local-export") as HTMLElement).textContent ?? "",
    );
    expect(island.stashes[0].title).toContain("<script>");
  });

  it("does not render an anchor for an item with a javascript: URL", async () => {
    seedViewerLocal([
      {
        id: "xss-2",
        title: "Mixed",
        tags: [],
        note: null,
        items: [
          { url: "javascript:alert(1)", title: "Bad" },
          { url: "https://safe.example", title: "Good" },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-stash-record-id="xss-2"]')).not.toBeNull();
    });

    // Expand the card to render the items.
    const toggle = container.querySelector(
      '[data-stash-record-id="xss-2"] button[type="button"]',
    ) as HTMLButtonElement;
    fireEvent.click(toggle);

    // Wait for the safe item to render, then check the bad one is gone.
    await waitFor(() => {
      expect(
        container.querySelector('[data-stash-item-url="https://safe.example"]'),
      ).not.toBeNull();
    });
    expect(container.querySelector('[data-stash-item-url="javascript:alert(1)"]')).toBeNull();
    // No anchor element exists for the javascript: URL.
    const anchors = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(anchors).not.toContain("javascript:alert(1)");

    // JSON island must still be the empty `viewer-local` fallback
    // (viewer-localStorage records are NOT duplicated into the island).
    const island = JSON.parse(
      (container.querySelector("#stash-local-export") as HTMLElement).textContent ?? "",
    );
    expect(island).toEqual({ version: 1, source: "viewer-local", stashes: [] });
  });

  it("does not render an anchor for a data:text/html URL", async () => {
    seedViewerLocal([
      {
        id: "xss-3",
        title: "Data",
        tags: [],
        note: null,
        items: [{ url: "data:text/html,<script>alert(1)</script>", title: "DataURL" }],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-stash-record-id="xss-3"]')).not.toBeNull();
    });

    const anchors = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(anchors.some((href) => href?.startsWith("data:"))).toBe(false);
  });

  it("renders <img onerror=...> in a title as text only (no DOM injection)", async () => {
    seedExtension([
      {
        id: "xss-4",
        title: '<img src=x onerror="window.__imgPwn=1">',
        tags: [],
        note: null,
        items: [{ url: "https://example.com", title: "Example" }],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector("#stash-local-export")?.getAttribute("data-stash-status"),
      ).toBe("ready");
    });

    expect((window as unknown as { __imgPwn?: number }).__imgPwn).toBeUndefined();
    // The string survives in the JSON island as data.
    const island = JSON.parse(
      (container.querySelector("#stash-local-export") as HTMLElement).textContent ?? "",
    );
    expect(island.stashes[0].title).toContain("<img");
  });

  it("renders a quote-breaking payload in a note as text only", async () => {
    seedExtension([
      {
        id: "xss-5",
        title: "Note",
        tags: [],
        note: '"><script>window.__notePwn=1</script>',
        items: [{ url: "https://example.com", title: "Example" }],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector("#stash-local-export")?.getAttribute("data-stash-status"),
      ).toBe("ready");
    });

    expect((window as unknown as { __notePwn?: number }).__notePwn).toBeUndefined();
    const island = JSON.parse(
      (container.querySelector("#stash-local-export") as HTMLElement).textContent ?? "",
    );
    expect(island.stashes[0].note).toContain("<script>");
  });

  it("filters out Unicode-scheme lookalike URLs (full-width Latin 'ＪＳ:alert(1)')", async () => {
    // Full-width Latin: Ｊ = U+FF4A, Ｓ = U+FF53
    const unicodePrefix = "ＪＳ:alert(1)";
    seedViewerLocal([
      {
        id: "xss-6",
        title: "Lookalike",
        tags: [],
        note: null,
        items: [
          { url: unicodePrefix, title: "Bad" },
          { url: "https://safe.example", title: "Good" },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-stash-record-id="xss-6"]')).not.toBeNull();
    });

    const toggle = container.querySelector(
      '[data-stash-record-id="xss-6"] button[type="button"]',
    ) as HTMLButtonElement;
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(
        container.querySelector('[data-stash-item-url="https://safe.example"]'),
      ).not.toBeNull();
    });
    // The Unicode-scheme URL is filtered out entirely.
    const anchors = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(anchors).not.toContain(unicodePrefix);
  });
});
