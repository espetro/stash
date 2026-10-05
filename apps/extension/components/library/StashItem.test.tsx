import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StashItem } from "./StashItem";
import type { StashRecord } from "../../lib/stash-store";

const stash: StashRecord = {
  id: "saved",
  title: "Saved links",
  tags: [],
  items: [{ url: "https://example.com", title: "Example" }],
  shares: [],
  createdAt: 1,
  updatedAt: 1,
  kept: true,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("StashItem", () => {
  it("does not repeat the expiration prefix in the Recent badge", () => {
    render(
      <StashItem
        stash={{
          ...stash,
          kept: false,
          shares: [
            {
              url: "https://stash.example/s/#p=payload",
              itemCount: 1,
              truncated: false,
              createdAt: Date.now(),
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
            },
          ],
        }}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onKeep={vi.fn()}
        onShare={vi.fn()}
      />,
    );

    expect(screen.getByText("Recent · clears in 1 day")).toBeTruthy();
  });

  it("shows Copied! with a checkmark for two seconds after sharing succeeds", async () => {
    vi.useFakeTimers();
    const onShare = vi.fn().mockResolvedValue(true);
    render(
      <StashItem
        stash={stash}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onKeep={vi.fn()}
        onShare={onShare}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await Promise.resolve();
    });

    expect(onShare).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });
});
