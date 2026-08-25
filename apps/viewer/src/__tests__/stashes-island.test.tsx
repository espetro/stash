// @vitest-environment happy-dom
/**
 * Tests for the deterministic browser-agent contract on /stashes:
 *   - JSON island lifecycle (loading → ready)
 *   - Canonical shape when the bridge is available
 *   - Empty `viewer-local` fallback when the bridge is unavailable
 *   - `?agent=json` and `?agent=markdown` browser-only views
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import * as React from "react";
import MyStashes from "@/components/MyStashes";
import { LocaleProvider } from "@/components/LocaleProvider";

// Mock the bridge probe so tests can deterministically pick the source.
const probeMock = vi.fn();
vi.mock("@/lib/local-bridge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-bridge")>("@/lib/local-bridge");
  return {
    ...actual,
    probeLocalBridge: (...args: unknown[]) => probeMock(...args),
  };
});

function makeExportStash(args: {
  id?: string;
  title?: string | null;
  tags?: string[];
  note?: string | null;
  items?: { url: string; title: string }[];
}) {
  return {
    id: args.id ?? "ext-1",
    title: args.title ?? "Extension stash",
    tags: args.tags ?? ["ext"],
    note: args.note ?? "from extension",
    items: args.items ?? [
      { url: "https://example.com", title: "Example" },
      { url: "https://github.com", title: "GitHub" },
    ],
    createdAt: 1,
    updatedAt: 2,
  };
}

function readIslandJson(): unknown {
  const node = document.getElementById("stash-local-export");
  expect(node).not.toBeNull();
  return JSON.parse((node as HTMLElement).textContent ?? "");
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  probeMock.mockReset();
  // Reset URL between tests so `?agent=...` from a previous case does
  // not leak into the next render.
  window.history.replaceState({}, "", "/stashes");
});

afterEach(() => {
  window.history.replaceState({}, "", "/stashes");
});

describe("MyStashes — JSON island lifecycle", () => {
  it("renders the island with data-stash-status='loading' on first render and 'ready' after the bridge resolves", async () => {
    probeMock.mockResolvedValue({ available: false, error: "timeout" });

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    const island = container.querySelector("#stash-local-export") as HTMLElement | null;
    expect(island).not.toBeNull();
    // First render: bridge probe has not yet resolved → loading.
    expect(island?.getAttribute("data-stash-status")).toBe("loading");

    // After the probe settles, the island flips to ready.
    await waitFor(() => {
      expect(
        container.querySelector("#stash-local-export")?.getAttribute("data-stash-status"),
      ).toBe("ready");
    });
  });

  it("renders the canonical StashExport for the extension source", async () => {
    probeMock.mockResolvedValue({
      available: true,
      export: {
        version: 1,
        source: "extension",
        stashes: [makeExportStash({ id: "ext-1", title: "From extension" })],
      },
    });

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

    const parsed = readIslandJson();
    expect(parsed).toEqual({
      version: 1,
      source: "extension",
      stashes: [
        {
          id: "ext-1",
          title: "From extension",
          tags: ["ext"],
          note: "from extension",
          items: [
            { url: "https://example.com", title: "Example" },
            { url: "https://github.com", title: "GitHub" },
          ],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });
  });

  it("exposes an empty viewer-local island when the bridge is unavailable", async () => {
    probeMock.mockResolvedValue({ available: false, error: "timeout" });

    // Seed viewer-local records. The island MUST NOT duplicate them.
    localStorage.setItem(
      "stash:records",
      JSON.stringify([
        {
          id: "local-1",
          title: "Viewer local",
          tags: ["home"],
          note: "should not leak",
          items: [{ url: "https://example.org", title: "Example" }],
          createdAt: 1,
          updatedAt: 2,
        },
      ]),
    );

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

    expect(readIslandJson()).toEqual({
      version: 1,
      source: "viewer-local",
      stashes: [],
    });
  });

  it("keeps a stable id='stash-local-export' element in the DOM at all times", async () => {
    probeMock.mockResolvedValue({ available: false });

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    expect(container.querySelector("#stash-local-export")).not.toBeNull();
    await waitFor(() => {
      expect(
        container.querySelector("#stash-local-export")?.getAttribute("data-stash-status"),
      ).toBe("ready");
    });
    expect(container.querySelector("#stash-local-export")).not.toBeNull();
  });
});

describe("MyStashes — agent discoverability hint", () => {
  it("renders an sr-only anchor pointing agents at ?agent=json in the normal view", async () => {
    probeMock.mockResolvedValue({ available: false, error: "timeout" });

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    const hint = container.querySelector("[data-agent-hint]");
    expect(hint).not.toBeNull();
    expect(hint?.tagName).toBe("A");
    expect(hint?.getAttribute("href")).toBe("/stashes/?agent=json");
    expect(hint?.className).toContain("sr-only");
  });

  it("does not render the hint in ?agent=json or ?agent=markdown views", async () => {
    probeMock.mockResolvedValue({ available: false, error: "timeout" });
    window.history.replaceState({}, "", "/stashes?agent=json");

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    expect(container.querySelector("[data-agent-hint]")).toBeNull();
  });
});

describe("MyStashes — semantic selectors", () => {
  it("exposes [data-stash-root], [data-stash-list], [data-stash-record-id], [data-stash-title] and [data-stash-item-url]", async () => {
    probeMock.mockResolvedValue({
      available: true,
      export: {
        version: 1,
        source: "extension",
        stashes: [makeExportStash({ id: "ext-7", title: "With items" })],
      },
    });

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

    expect(container.querySelector("[data-stash-root]")).not.toBeNull();
    expect(container.querySelector("[data-stash-list]")).not.toBeNull();
    expect(container.querySelector('[data-stash-record-id="ext-7"]')).not.toBeNull();
    expect(
      container.querySelector('[data-stash-record-id="ext-7"] [data-stash-title]'),
    ).not.toBeNull();
    // Expand the card so its item anchors render.
    const toggle = container.querySelector(
      '[data-stash-record-id="ext-7"] button[type="button"]',
    ) as HTMLButtonElement;
    toggle.click();
    await waitFor(() => {
      expect(container.querySelector('[data-stash-item-url="https://example.com"]')).not.toBeNull();
    });
  });
});

describe("MyStashes — ?agent=json browser-only view", () => {
  it("renders only the <pre id='agent-export'> wrapper and no SharedCard", async () => {
    probeMock.mockResolvedValue({
      available: true,
      export: {
        version: 1,
        source: "extension",
        stashes: [makeExportStash({ id: "ext-1", title: "Agent test" })],
      },
    });

    window.history.replaceState({}, "", "/stashes?agent=json");

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    // The JSON island (#stash-local-export) is intentionally NOT in the
    // agent view — the canonical surface is the <pre id="agent-export">.
    expect(container.querySelector("#stash-local-export")).toBeNull();

    const agent = container.querySelector("#agent-export") as HTMLElement | null;
    expect(agent).not.toBeNull();

    // No SharedCard → no source chip, no card UI.
    expect(container.querySelector("[data-stash-source]")).toBeNull();
    expect(container.querySelector("[data-stash-record-id]")).toBeNull();

    // Wait for the bridge probe to resolve so the agent view reflects
    // the canonical StashExport (the agent opens this URL and waits
    // for the readiness marker to flip).
    await waitFor(() => {
      expect(agent?.getAttribute("data-stash-status")).toBe("ready");
    });
    if (!agent) throw new Error("agent-export element missing");

    const parsed = JSON.parse(agent.textContent ?? "");
    expect(parsed).toEqual({
      version: 1,
      source: "extension",
      stashes: [
        {
          id: "ext-1",
          title: "Agent test",
          tags: ["ext"],
          note: "from extension",
          items: [
            { url: "https://example.com", title: "Example" },
            { url: "https://github.com", title: "GitHub" },
          ],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });
  });
});

describe("MyStashes — ?agent=json / ?agent=markdown payload parity", () => {
  it("returns the same viewer-local records via ?agent=json as ?agent=markdown, unlike the extension-only island", async () => {
    probeMock.mockResolvedValue({ available: false, error: "disabled" });
    localStorage.setItem(
      "stash:records",
      JSON.stringify([
        {
          id: "local-1",
          title: "Viewer local",
          tags: ["home"],
          note: "a note",
          items: [{ url: "https://example.org", title: "Example" }],
          createdAt: 1,
          updatedAt: 2,
        },
      ]),
    );

    window.history.replaceState({}, "", "/stashes?agent=json");
    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    const agent = container.querySelector("#agent-export") as HTMLElement | null;
    await waitFor(() => {
      expect(agent?.getAttribute("data-stash-status")).toBe("ready");
    });
    if (!agent) throw new Error("agent-export element missing");

    const parsed = JSON.parse(agent.textContent ?? "");
    expect(parsed).toEqual({
      version: 1,
      source: "viewer-local",
      stashes: [
        {
          id: "local-1",
          title: "Viewer local",
          tags: ["home"],
          note: "a note",
          items: [{ url: "https://example.org", title: "Example" }],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });
  });
});

describe("MyStashes — ?agent=markdown browser-only view", () => {
  it("renders only the <pre id='agent-export-md'> wrapper with markdown for each record", async () => {
    probeMock.mockResolvedValue({
      available: true,
      export: {
        version: 1,
        source: "extension",
        stashes: [
          makeExportStash({
            id: "ext-1",
            title: "First",
            tags: ["a", "b"],
            note: "memo",
          }),
          makeExportStash({
            id: "ext-2",
            title: "Second",
            tags: [],
            note: null,
            items: [{ url: "https://example.com/x", title: "X" }],
          }),
        ],
      },
    });

    window.history.replaceState({}, "", "/stashes?agent=markdown");

    const { container } = render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    const md = container.querySelector("#agent-export-md") as HTMLElement | null;
    expect(md).not.toBeNull();

    // No card UI, no JSON island.
    expect(container.querySelector("#agent-export")).toBeNull();
    expect(container.querySelector("#stash-local-export")).toBeNull();
    expect(container.querySelector("[data-stash-record-id]")).toBeNull();

    // Wait for the bridge probe to resolve before asserting content.
    await waitFor(() => {
      expect(md?.getAttribute("data-stash-status")).toBe("ready");
    });
    if (!md) throw new Error("agent-export-md element missing");

    const text = md.textContent ?? "";
    expect(text).toContain("# First");
    expect(text).toContain("- [Example](https://example.com)");
    expect(text).toContain("- [GitHub](https://github.com)");
    expect(text).toContain("tags: a, b");
    expect(text).toContain("note: memo");
    expect(text).toContain("# Second");
    expect(text).toContain("- [X](https://example.com/x)");
  });
});
