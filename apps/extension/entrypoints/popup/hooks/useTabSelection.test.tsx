import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { useTabSelection } from "./useTabSelection";
import type { Tabs } from "webextension-polyfill";

type QueryInfo = Parameters<typeof fakeBrowser.tabs.query>[number];

function createMockTab(
  id: number,
  index: number,
  url: string,
  title: string,
  highlighted = false,
): Tabs.Tab {
  return {
    id,
    index,
    url,
    title,
    highlighted,
    active: highlighted,
    pinned: false,
    incognito: false,
  } as Tabs.Tab;
}

describe("useTabSelection", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.tabs, "highlight").mockResolvedValue(undefined as any);
  });

  it("loads tabs on mount without calling tabs.highlight", async () => {
    const querySpy = vi
      .spyOn(fakeBrowser.tabs, "query")
      .mockImplementation((queryInfo: QueryInfo) => {
        if (queryInfo.highlighted) {
          return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
        }
        return Promise.resolve([
          createMockTab(1, 0, "https://example.com", "Example", true),
          createMockTab(2, 1, "https://github.com", "GitHub", false),
        ]);
      });

    renderHook(() => useTabSelection());

    await waitFor(() => {
      expect(querySpy).toHaveBeenCalledWith({ currentWindow: true });
    });

    expect(fakeBrowser.tabs.highlight).not.toHaveBeenCalled();
  });

  it("toggleTab updates local state but NEVER calls browser.tabs.highlight", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((queryInfo: QueryInfo) => {
      if (queryInfo.highlighted) {
        return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
      }
      return Promise.resolve([
        createMockTab(1, 0, "https://example.com", "Example", true),
        createMockTab(2, 1, "https://github.com", "GitHub", false),
        createMockTab(3, 2, "https://google.com", "Google", false),
      ]);
    });

    const { result } = renderHook(() => useTabSelection());

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(3);
    });

    // Tab 2 should not be selected initially (only tab 1 is highlighted)
    expect(result.current.tabs.find((t) => t.id === 2)?.isSelected).toBe(false);

    // Toggle tab 2 (currently not selected)
    await act(async () => {
      await result.current.toggleTab(2);
    });

    expect(result.current.tabs.find((t) => t.id === 2)?.isSelected).toBe(true);
    expect(fakeBrowser.tabs.highlight).not.toHaveBeenCalled();

    // Toggle tab 2 again (currently selected)
    await act(async () => {
      await result.current.toggleTab(2);
    });

    expect(result.current.tabs.find((t) => t.id === 2)?.isSelected).toBe(false);
    expect(fakeBrowser.tabs.highlight).not.toHaveBeenCalled();
  });

  it("selectAll updates local state but NEVER calls browser.tabs.highlight", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((queryInfo: QueryInfo) => {
      if (queryInfo.highlighted) {
        return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
      }
      return Promise.resolve([
        createMockTab(1, 0, "https://example.com", "Example", true),
        createMockTab(2, 1, "https://github.com", "GitHub", false),
        createMockTab(3, 2, "https://google.com", "Google", false),
      ]);
    });

    const { result } = renderHook(() => useTabSelection());

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(3);
    });

    await act(async () => {
      await result.current.selectAll();
    });

    expect(result.current.tabs.every((t) => t.isSelected)).toBe(true);
    expect(fakeBrowser.tabs.highlight).not.toHaveBeenCalled();
  });

  it("selectAll with maxCount updates local state but NEVER calls browser.tabs.highlight", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((queryInfo: QueryInfo) => {
      if (queryInfo.highlighted) {
        return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
      }
      return Promise.resolve([
        createMockTab(1, 0, "https://example.com", "Example", true),
        createMockTab(2, 1, "https://github.com", "GitHub", false),
        createMockTab(3, 2, "https://google.com", "Google", false),
      ]);
    });

    const { result } = renderHook(() => useTabSelection());

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(3);
    });

    await act(async () => {
      await result.current.selectAll(2);
    });

    expect(result.current.tabs.filter((t) => t.isSelected)).toHaveLength(2);
    expect(fakeBrowser.tabs.highlight).not.toHaveBeenCalled();
  });

  it("deselectAll updates local state but NEVER calls browser.tabs.highlight", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((queryInfo: QueryInfo) => {
      if (queryInfo.highlighted) {
        return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
      }
      return Promise.resolve([
        createMockTab(1, 0, "https://example.com", "Example", true),
        createMockTab(2, 1, "https://github.com", "GitHub", false),
        createMockTab(3, 2, "https://google.com", "Google", false),
      ]);
    });

    const { result } = renderHook(() => useTabSelection());

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(3);
    });

    // First select all
    await act(async () => {
      await result.current.selectAll();
    });

    expect(result.current.selectedCount).toBe(3);

    // Then deselect all
    await act(async () => {
      await result.current.deselectAll();
    });

    expect(result.current.tabs.every((t) => !t.isSelected)).toBe(true);
    expect(result.current.selectedCount).toBe(0);
    expect(fakeBrowser.tabs.highlight).not.toHaveBeenCalled();
  });

  it("does not register a tabs.onHighlighted listener", async () => {
    vi.spyOn(fakeBrowser.tabs, "query").mockImplementation((queryInfo: QueryInfo) => {
      if (queryInfo.highlighted) {
        return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
      }
      return Promise.resolve([createMockTab(1, 0, "https://example.com", "Example", true)]);
    });

    const addListenerSpy = vi.spyOn(fakeBrowser.tabs.onHighlighted, "addListener");

    renderHook(() => useTabSelection());

    await waitFor(() => {
      expect(fakeBrowser.tabs.query).toHaveBeenCalled();
    });

    // The hook should not add any onHighlighted listener
    expect(addListenerSpy).not.toHaveBeenCalled();
  });
});
