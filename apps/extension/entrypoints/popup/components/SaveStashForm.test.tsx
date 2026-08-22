import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SaveStashForm } from "./SaveStashForm";

describe("SaveStashForm", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders title, tags, note inputs with placeholders", () => {
    render(<SaveStashForm itemCount={3} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByPlaceholderText("Stash title")).toBeTruthy();
    expect(screen.getByPlaceholderText("tags, comma, separated")).toBeTruthy();
    expect(screen.getByPlaceholderText("Note")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByText("Save 3 tabs")).toBeTruthy();
  });

  it("submits parsed title, tags and note", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByRole } = render(
      <SaveStashForm itemCount={1} onSave={onSave} onCancel={vi.fn()} />,
    );

    fireEvent.change(getByPlaceholderText("Stash title"), {
      target: { value: "Reading" },
    });
    fireEvent.change(getByPlaceholderText("tags, comma, separated"), {
      target: { value: " work, reading , " },
    });
    fireEvent.change(getByPlaceholderText("Note"), {
      target: { value: "A note" },
    });
    fireEvent.click(getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      title: "Reading",
      tags: ["work", "reading"],
      note: "A note",
    });
  });

  it("shows Saved! then calls onSaved after 1.5s", async () => {
    const onSaved = vi.fn();
    const { getByRole } = render(
      <SaveStashForm
        itemCount={2}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Saved!")).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    const { getByRole } = render(
      <SaveStashForm itemCount={1} onSave={vi.fn()} onCancel={onCancel} />,
    );

    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
