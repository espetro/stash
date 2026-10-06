import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QrDialog } from "./QrDialog";

beforeAll(() => {
  // jsdom has no <dialog>.showModal — stub the bits the component calls.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

describe("QrDialog", () => {
  it("opens a dialog rendering a QR image and the share URL", () => {
    render(<QrDialog url="https://stash.example/s/#p=abc" onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Share QR code" });
    expect(dialog).toBeTruthy();
    // lean-qr renders the matrix as an SVG-backed image.
    const img = dialog.querySelector(".qr-code");
    expect(img).toBeTruthy();
    expect(screen.getByText("https://stash.example/s/#p=abc")).toBeTruthy();
  });

  it("calls onClose from the Close button", () => {
    const onClose = vi.fn();
    render(<QrDialog url="https://x.test" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
