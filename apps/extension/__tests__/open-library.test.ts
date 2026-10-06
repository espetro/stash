import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  isOpenLibraryMessage,
  openLibraryPage,
  openLibraryRelay,
  OPEN_LIBRARY_MESSAGE,
} from "../lib/open-library";
import { getPendingImport, PENDING_IMPORT_KEY } from "../lib/pending-import";
import { browser } from "wxt/browser";

describe("open-library", () => {
  let originalLocation: Location | undefined;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    originalLocation = globalThis.location;
  });

  afterEach(() => {
    // NOT vi.unstubAllGlobals() — that would also wipe the `chrome`/
    // `browser` globals fakeBrowser installs via the same mechanism.
    if (originalLocation) vi.stubGlobal("location", originalLocation);
  });

  describe("isOpenLibraryMessage", () => {
    it("accepts the relay message shape and rejects everything else", () => {
      expect(isOpenLibraryMessage({ type: OPEN_LIBRARY_MESSAGE })).toBe(true);
      expect(isOpenLibraryMessage({ type: OPEN_LIBRARY_MESSAGE, hash: "#settings" })).toBe(true);
      expect(isOpenLibraryMessage({ type: "stash:viewer:open" })).toBe(false);
      expect(isOpenLibraryMessage(null)).toBe(false);
      expect(isOpenLibraryMessage(undefined)).toBe(false);
      expect(isOpenLibraryMessage("stash:ext:open-library")).toBe(false);
      expect(isOpenLibraryMessage({ type: 42 })).toBe(false);
    });
  });

  describe("openLibraryPage", () => {
    it("opens a tab directly from an extension-page context", async () => {
      vi.stubGlobal("location", { protocol: "chrome-extension:" });
      const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);
      await openLibraryPage("#settings");
      expect(create).toHaveBeenCalledTimes(1);
      const url = (create.mock.calls[0][0] as { url: string }).url;
      expect(url).toContain("/library.html#settings");
    });

    it("writes the pending-import slot when a handoff arrives in-page", async () => {
      vi.stubGlobal("location", { protocol: "chrome-extension:" });
      vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);
      await openLibraryPage("#pending-import", {
        records: [
          {
            id: "r1",
            title: "Handoff stash",
            note: null,
            tags: [],
            items: [{ url: "https://example.com", title: "Ex" }],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        source: "viewer-local",
      });
      const pending = await getPendingImport();
      expect(pending?.records).toHaveLength(1);
      expect(pending?.source).toBe("viewer-local");
    });

    it("relays through runtime.sendMessage from a content-script context", async () => {
      vi.stubGlobal("location", { protocol: "https:" });
      const send = vi
        .spyOn(browser.runtime, "sendMessage")
        .mockResolvedValue({ ok: true } as never);
      await openLibraryPage("#pending-import", {
        records: [],
        source: "viewer-local",
      });
      expect(send).toHaveBeenCalledWith({
        type: OPEN_LIBRARY_MESSAGE,
        hash: "#pending-import",
        handoff: { records: [], source: "viewer-local" },
      });
    });
  });

  describe("openLibraryRelay (background side)", () => {
    it("writes the pending-import slot and opens the library tab", async () => {
      const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);
      const result = await openLibraryRelay({
        type: OPEN_LIBRARY_MESSAGE,
        hash: "#pending-import",
        handoff: {
          records: [
            {
              id: "r2",
              title: "Relayed",
              note: null,
              tags: [],
              items: [{ url: "https://a.example", title: "A" }],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          source: "viewer-local",
        },
      });
      expect(result).toEqual({ ok: true });
      expect((await getPendingImport())?.records).toHaveLength(1);
      const url = (create.mock.calls[0][0] as { url: string }).url;
      expect(url).toContain("/library.html#pending-import");
    });

    it("ignores a malformed handoff payload but still opens the tab", async () => {
      const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({} as never);
      await openLibraryRelay({
        type: OPEN_LIBRARY_MESSAGE,
        handoff: { records: "nope", source: 7 } as never,
      });
      expect(await browser.storage.local.get(PENDING_IMPORT_KEY)).toEqual({});
      expect(create).toHaveBeenCalledTimes(1);
    });
  });
});
