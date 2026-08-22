// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import * as React from "react";
import { ShareDrawer } from "../components/ShareDrawer";

const PAYLOAD = "Cj0K_BASE64_BODY";

const data = {
  expiry: 1736524800,
  isExpired: false,
  items: [
    ["https://github.com", "GitHub"] as [string, string, "url"?],
    ["https://developer.mozilla.org", "MDN Web Docs"] as [string, string, "url"?],
  ],
  title: "Test",
};

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  // happy-dom exposes `navigator.clipboard` as a getter-only property;
  // override via defineProperty so the drawer can read it back.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("ShareDrawer — Agent URL copy", () => {
  beforeEach(() => {
    cleanup();
    window.location.hash = `#p=${PAYLOAD}`;
  });

  it("renders the Agent URL button alongside the existing copy actions", () => {
    render(<ShareDrawer open onClose={() => {}} data={data} />);
    expect(screen.getByText(/Share as JSON/)).toBeTruthy();
    expect(screen.getByText(/Share as Markdown/)).toBeTruthy();
    expect(screen.getByTestId("copy-agent-url")).toBeTruthy();
  });

  it("copies `<origin>/s?p=<payload>` when clicked", async () => {
    const writeText = stubClipboard();
    const onClose = vi.fn();

    render(<ShareDrawer open onClose={onClose} data={data} />);
    fireEvent.click(screen.getByTestId("copy-agent-url"));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    // Uses the document origin so the test is portable; production callers
    // see https://stash.illo.fyi/s?p=... since the viewer always runs there.
    expect(copied).toBe(`${window.location.origin}/s?p=${PAYLOAD}`);
    expect(copied).not.toContain("#p=");
    await act(async () => {
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("flips label to 'Copied!' after click", async () => {
    stubClipboard();

    render(<ShareDrawer open onClose={() => {}} data={data} />);
    const button = screen.getByTestId("copy-agent-url");
    expect(button.textContent).toContain("Copy as agent URL");
    fireEvent.click(button);
    // Let the writeText().then() callback complete + state flush before
    // asserting on the rendered label.
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.textContent).toContain("Copied!");
  });
});

