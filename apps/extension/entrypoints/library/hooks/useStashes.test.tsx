import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { materializeStashes } from "../../../lib/stash-store";
import { useStashes } from "./useStashes";

describe("useStashes", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("loads stashes on mount", async () => {
    const { result } = renderHook(() => useStashes());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stashes).toEqual([]);
  });

  it("prunes expired Recent stashes during the initial load", async () => {
    const expired = {
      id: "expired",
      tags: [],
      items: [],
      shares: [
        {
          url: "https://stash.illo.fyi/#p=expired",
          itemCount: 1,
          truncated: false,
          createdAt: 1,
          expiresAt: Date.now() - 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
      kept: false,
    };
    const kept = {
      id: "kept",
      tags: [],
      items: [],
      shares: [
        {
          url: "https://stash.illo.fyi/#p=kept",
          itemCount: 1,
          truncated: false,
          createdAt: 1,
          expiresAt: Date.now() - 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
      kept: true,
    };
    await materializeStashes(() => [expired, kept]);

    const { result } = renderHook(() => useStashes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.stashes.map((stash) => stash.id)).toEqual(["kept"]);
  });

  it("create adds a stash to state", async () => {
    const { result } = renderHook(() => useStashes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.create({
        title: "Reading list",
        items: [{ url: "https://example.com", title: "Ex" }],
      });
    });

    expect(result.current.stashes).toHaveLength(1);
    expect(result.current.stashes[0].title).toBe("Reading list");
  });

  it("update patches a stash in state", async () => {
    const { result } = renderHook(() => useStashes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let id = "";
    await act(async () => {
      const record = await result.current.create({
        items: [{ url: "https://example.com", title: "Ex" }],
      });
      id = record!.id;
    });

    await act(async () => {
      await result.current.update(id, { title: "Renamed", tags: ["a"] });
    });

    expect(result.current.stashes[0].title).toBe("Renamed");
    expect(result.current.stashes[0].tags).toEqual(["a"]);
  });

  it("remove deletes a stash from state", async () => {
    const { result } = renderHook(() => useStashes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let id = "";
    await act(async () => {
      const record = await result.current.create({
        items: [{ url: "https://example.com", title: "Ex" }],
      });
      id = record!.id;
    });

    await act(async () => {
      await result.current.remove(id);
    });

    expect(result.current.stashes).toHaveLength(0);
  });

  it("search filters stashes via the store", async () => {
    const { result } = renderHook(() => useStashes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.create({
        title: "Cooking",
        items: [{ url: "https://example.com", title: "Ex" }],
      });
      await result.current.create({
        title: "Travel",
        items: [{ url: "https://example.org", title: "Ex2" }],
      });
    });

    const matches = await result.current.search("cooking");
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe("Cooking");
  });
});
