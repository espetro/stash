import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { listStashes } from "../../../lib/stash-store";
import { getPendingImport, setPendingImport } from "../../../lib/pending-import";
import { PendingImportBanner } from "./PendingImportBanner";

vi.mock("../../../lib/telemetry", () => ({
  recordEvent: vi.fn(),
}));

const viewerRecord = (id: string) => ({
  id,
  title: `From viewer ${id}`,
  tags: [],
  note: null,
  items: [{ url: `https://${id}.example`, title: id }],
  kept: false,
  createdAt: 1,
  updatedAt: 2,
});

describe("PendingImportBanner", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("renders nothing when no pending import exists", async () => {
    const { container } = render(<PendingImportBanner onImported={() => {}} />);
    await waitFor(() => expect(container.querySelector(".pending-import-banner")).toBeNull());
  });

  it("imports the parked records on confirm and clears the slot", async () => {
    await setPendingImport({
      records: [viewerRecord("s-1"), viewerRecord("s-2")],
      source: "viewer-local",
      receivedAt: Date.now(),
    });
    const onImported = vi.fn();
    render(<PendingImportBanner onImported={onImported} />);

    expect(await screen.findByText(/2 stashes from the Stash website/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(async () => {
      expect((await listStashes()).map((s) => s.id).sort()).toEqual(["s-1", "s-2"]);
    });
    expect(await getPendingImport()).toBeNull();
    expect(onImported).toHaveBeenCalled();
  });

  it("clears the slot without importing on dismiss", async () => {
    await setPendingImport({
      records: [viewerRecord("s-3")],
      source: "viewer-local",
      receivedAt: Date.now(),
    });
    render(<PendingImportBanner onImported={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss import" }));

    await waitFor(async () => expect(await getPendingImport()).toBeNull());
    expect(await listStashes()).toHaveLength(0);
  });
});
