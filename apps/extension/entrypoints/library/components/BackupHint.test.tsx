import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { browser } from "wxt/browser";
import { BackupHint } from "./BackupHint";
import { SYNC_STATUS_KEY } from "../../../lib/sync/protocol";

describe("BackupHint", () => {
  it("renders the never-paired backup hint when sync state is disconnected", async () => {
    render(<BackupHint onExport={vi.fn()} />);
    expect(await screen.findByText(/Not backed up/)).toBeTruthy();
  });

  it("fires onExport from the export link", async () => {
    const onExport = vi.fn();
    render(<BackupHint onExport={onExport} />);
    (await screen.findByRole("button", { name: "export a copy" })).click();
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("still renders when the handshake fails offline without pairing", async () => {
    await browser.storage.local.set({
      [SYNC_STATUS_KEY]: { state: "offline" },
    });
    render(<BackupHint onExport={vi.fn()} />);
    expect(await screen.findByText(/Not backed up/)).toBeTruthy();
  });

  it("renders nothing once the profile has paired", async () => {
    await browser.storage.local.set({
      [SYNC_STATUS_KEY]: { state: "paired", daemonName: "dev", daemonId: "daemon-abc12345" },
    });
    const { container } = render(<BackupHint onExport={vi.fn()} />);
    // The hook's async storage read flips NEVER_PAIRED → paired shortly
    // after mount; the hint must unmount once that lands.
    await vi.waitFor(() => {
      expect(container.querySelector(".backup-hint")).toBeNull();
    });
  });
});
