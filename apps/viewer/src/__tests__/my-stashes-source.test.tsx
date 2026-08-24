// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import * as React from "react";
import MyStashes from "@/components/MyStashes";
import { LocaleProvider } from "@/components/LocaleProvider";

// Mock the bridge probe so tests can deterministically choose what the
// extension source returns (or whether the bridge is unavailable).
const probeMock = vi.fn();
vi.mock("@/lib/local-bridge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-bridge")>("@/lib/local-bridge");
  return {
    ...actual,
    probeLocalBridge: (...args: unknown[]) => probeMock(...args),
  };
});

// Helper: stub the postMessage listener that AppHeader or other modules
// might attach at import-time. happy-dom provides window.postMessage
// natively but no listeners exist unless something registers them.
function makeExportStash(args: {
  id?: string;
  title?: string | null;
  tags?: string[];
  note?: string | null;
}) {
  return {
    id: args.id ?? "ext-1",
    title: args.title ?? "Extension stash",
    tags: args.tags ?? ["ext"],
    note: args.note ?? "from extension",
    items: [
      { url: "https://example.com", title: "Example" },
      { url: "https://github.com", title: "GitHub" },
    ],
    createdAt: 1,
    updatedAt: 2,
  };
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  probeMock.mockReset();
});

describe("MyStashes — extension source", () => {
  it("renders the extension chip, hides edit/delete buttons, and never calls localStorage.setItem when the bridge returns source: 'extension'", async () => {
    probeMock.mockResolvedValue({
      available: true,
      export: {
        version: 1,
        source: "extension",
        stashes: [makeExportStash({ id: "ext-1", title: "From extension" })],
      },
    });

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    // Wait for the source chip to flip to extension.
    await waitFor(() => {
      const chip = screen.getByTestId("stash-source-chip");
      expect(chip.textContent).toContain("This browser's extension library");
    });

    // Edit / delete buttons must NOT be rendered.
    expect(screen.queryByLabelText("Edit")).toBeNull();
    expect(screen.queryByLabelText("Delete")).toBeNull();
    // The shared button area (New stash / Export / Import) must NOT render.
    expect(screen.queryByText("New Stash")).toBeNull();
    expect(screen.queryByLabelText("Export")).toBeNull();
    expect(screen.queryByLabelText("Import")).toBeNull();

    // Read-only hint must be visible.
    expect(screen.getByText(/Read-only mirror of the extension library/)).toBeTruthy();

    // Extension records must NEVER reach localStorage.
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});

describe("MyStashes — viewer-local fallback", () => {
  it("falls back to viewer localStorage when the bridge is unavailable, and renders the viewer-local chip with edit/delete buttons", async () => {
    // Bridge unavailable.
    probeMock.mockResolvedValue({ available: false, error: "timeout" });

    // Seed a viewer-local stash in localStorage via the same key the
    // store uses.
    const localRecord = {
      id: "local-1",
      title: "Local stash",
      tags: ["home"],
      note: "kept in viewer",
      items: [{ url: "https://example.org", title: "Example" }],
      createdAt: 10,
      updatedAt: 20,
    };
    localStorage.setItem("stash:records", JSON.stringify([localRecord]));

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <LocaleProvider>
        <MyStashes />
      </LocaleProvider>,
    );

    // Wait for the source chip to settle on the viewer-local label.
    await waitFor(() => {
      const chip = screen.getByTestId("stash-source-chip");
      expect(chip.textContent).toContain("Saved in this browser.");
    });

    // Edit / delete buttons are rendered for the local record.
    expect(screen.getByLabelText("Edit")).toBeTruthy();
    expect(screen.getByLabelText("Delete")).toBeTruthy();

    // The shared button area is rendered.
    expect(screen.getByText("New Stash")).toBeTruthy();
    expect(screen.getByLabelText("Export")).toBeTruthy();
    expect(screen.getByLabelText("Import")).toBeTruthy();

    // Local records are reachable through the viewer fallback path; the
    // store itself writes nothing during render. (useStashLibrary
    // updates localStorage only on mutations, not on read.)
    void setItemSpy; // silence unused-var lint; assertion below is the read-only check
    // No write should have happened during the render path:
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
