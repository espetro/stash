import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { materializeStashes, listStashes, type StashRecord } from "../../../lib/stash-store";
import { historyItem } from "../../../lib/history";
import { StashesView } from "./StashesView";

const encodeShareMock = vi.hoisted(() => vi.fn());
vi.mock("@stash/codec", () => ({
  encodeTabsToShareUrl: encodeShareMock,
  EXPIRY_HOURS_MAP: { "24h": 24, "7d": 168, "30d": 720, never: 876000 },
}));
vi.mock("@stash/shared", () => ({
  getBrotliFunctions: vi.fn(async () => ({})),
  formatDateTime: vi.fn(() => "today"),
  formatRemainingTime: vi.fn(() => "1 day"),
}));
vi.mock("../../../lib/settings", () => ({
  getSettings: vi.fn(async () => ({
    expiryMode: "24h",
    viewerOrigin: "https://stash.illo.fyi",
  })),
}));
vi.mock("../../../lib/telemetry", () => ({
  recordEvent: vi.fn(),
}));

const testStash = (id: string, title: string, kept: boolean): StashRecord => ({
  id,
  title,
  tags: [],
  items: [{ url: `https://${id}.example`, title }],
  shares: kept
    ? []
    : [
        {
          url: `https://stash.illo.fyi/#p=${id}`,
          itemCount: 1,
          truncated: false,
          createdAt: 100,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        },
      ],
  createdAt: 100,
  updatedAt: 100,
  kept,
});

beforeEach(() => {
  fakeBrowser.reset();
  encodeShareMock.mockResolvedValue({
    url: "https://stash.illo.fyi/#p=shared",
    itemCount: 1,
    truncated: false,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("StashesView", () => {
  it("filters the Library by All, Kept, and Recent", async () => {
    await materializeStashes(() => [
      testStash("saved", "Saved links", true),
      testStash("recent", "Recent links", false),
    ]);
    render(<StashesView />);

    expect(await screen.findByText("Saved links")).toBeTruthy();
    expect(screen.getByText("Recent links")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recent · 1" }));
    expect(screen.queryByText("Saved links")).toBeNull();
    expect(screen.getByText("Recent links")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Kept · 1" }));
    expect(screen.queryByText("Recent links")).toBeNull();
    expect(screen.getByText("Saved links")).toBeTruthy();
  });

  it("shares a row against its existing stash", async () => {
    const stash = testStash("saved", "Saved links", true);
    await materializeStashes(() => [stash]);
    render(<StashesView />);

    fireEvent.click(await screen.findByRole("button", { name: "Share" }));

    await waitFor(async () => {
      expect((await listStashes())[0]?.shares).toHaveLength(1);
    });
    expect(await listStashes()).toHaveLength(1);
    expect(await listStashes()).toMatchObject([
      expect.objectContaining({
        id: stash.id,
        shares: [expect.objectContaining({ url: "https://stash.illo.fyi/#p=shared" })],
      }),
    ]);
    expect(await historyItem.get()).toMatchObject([
      expect.objectContaining({ url: "https://stash.illo.fyi/#p=shared" }),
    ]);
  });
});
