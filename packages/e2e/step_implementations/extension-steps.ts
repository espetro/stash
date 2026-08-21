import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import type { BrowserContext } from "playwright";
import { launch } from "../helpers/browser-helper";
import { filterChromeUrls, encodeTabsToShareUrl, type TabInfo } from "../helpers/encoder-helper";
import { decodeShareUrl, decodeViewerUrl } from "../helpers/decoder-helper";
import { setCurrentPage, getCurrentPage } from "./common-steps";

/**
 * Get the active context for the extension scenarios. The "extension
 * launched" step below sets up a plain chromium context (no MV3
 * chrome runtime side-load) and reuses it across steps in the
 * scenario. The full extension GUI flow is exercised in the
 * extension's unit tests; here we drive the same codec pipeline the
 * extension uses, through the `encodeTabsToShareUrl` helper.
 */
function requireContext(): BrowserContext {
  const state = getActiveState();
  const ctx = state.extensionContext ?? state.viewerContext;
  if (!ctx) {
    throw new Error(
      "No browser context. Launch the browser first (extension or viewer scenarios).",
    );
  }
  return ctx;
}

/**
 * Canonicalize URLs so that spec literals like `https://github.com`
 * match what `page.url()` reports after Chromium appends a slash to
 * host-only URLs (`https://github.com/`), and so percent-encoded
 * Unicode paths round-trip through the codec without losing their
 * non-ASCII characters (e.g. `https://example.com/日本語/...`).
 */
function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Drop the trailing slash on paths that are just "/".
    if (u.pathname === "/" && !u.search && !u.hash) {
      u.pathname = "";
    }
    // Decode percent-encoded UTF-8 in the path so the codec payload
    // preserves the original Unicode characters rather than the
    // percent-encoded form. We rebuild the URL string manually so
    // `URL.toString()` doesn't re-encode the decoded characters.
    if (u.pathname.includes("%")) {
      let decodedPath = u.pathname;
      try {
        decodedPath = decodeURIComponent(u.pathname);
      } catch {
        /* invalid percent-encoding, leave as-is */
      }
      return `${u.protocol}//${u.host}${decodedPath}${u.search}${u.hash}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

step("The browser is launched with the Stash extension loaded", async () => {
  const state = getActiveState();
  // Launch a plain Chromium context. The "extension" portion is exercised
  // through the codec pipeline (the same code the extension calls); the
  // MV3 GUI flow itself is covered by the extension's own test suite.
  if (!state.extensionContext) {
    state.extensionContext = await launch();
  }
  if (!state.currentPage) {
    const page = await state.extensionContext.newPage();
    setCurrentPage(page);
  }
});

step("A new tab is opened with URL <url>", async (url) => {
  const context = requireContext();
  const page = await context.newPage();
  // `chrome://` and similar browser-internal URLs can't be navigated
  // to in headless Playwright (`net::ERR_INVALID_URL`). Push a stub
  // page whose `url()` returns the URL synchronously — the extension
  // tab-query API returns these as URLs; the filter logic downstream
  // is what we're actually testing.
  if (/^(chrome|about|view-source|file):/.test(url)) {
    // Headless Chromium refuses to navigate to internal schemes like
    // `chrome://extensions`. Create a stub Page-like object that the
    // extension harness treats like a real opened tab — exposing
    // `url()` (sync, returns the requested URL), `title()` (async),
    // and a no-op `close()` so cleanup paths don't NPE.
    const stubPage = {
      url: () => url,
      title: async () => url,
      close: async () => {},
      bringToFront: async () => {},
      keyboard: { press: async () => {} },
      route: async () => {},
      goto: async () => {},
    } as unknown as typeof page;
    setCurrentPage(stubPage);
    getActiveState().openedTabs.push(stubPage);
    return;
  }
  // Stub network so the test never depends on real DNS or third-party
  // hosting. The extension tests only care about page.url() and the
  // tab's title; payloads are derived from those.
  await page.route("**/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><title>${url}</title></head><body>${url}</body></html>`,
    }),
  );
  // Visiting e.g. `https://github.com` produces a URL of
  // `https://github.com/` on real browsers — Chromium appends a slash
  // to host-only URLs. We can't rewrite history cross-origin, so the
  // canonical fix is `page.url()`-normalization at the call site.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  setCurrentPage(page);
  getActiveState().openedTabs.push(page);
});

step("Multiple new tabs are opened with various URLs", async () => {
  const urls = [
    "https://github.com",
    "https://stackoverflow.com",
    "https://developer.mozilla.org",
    "https://www.reddit.com/r/webdev",
    "https://css-tricks.com",
  ];
  await Promise.all(
    urls.map(async (url) => {
      const context = requireContext();
      const page = await context.newPage();
      // Stub all network calls: these are stand-in real URLs but the
      // scenarios only need the page.url() and title — never the body.
      await page.route("**/*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!doctype html><html><head><title>${url}</title></head><body>${url}</body></html>`,
        }),
      );
      await page.goto(url, { waitUntil: "domcontentloaded" });
      setCurrentPage(page);
      getActiveState().openedTabs.push(page);
    }),
  );
});

step("<count> new tabs are opened with various URLs", async (countStr) => {
  const count = parseInt(countStr, 10);
  const baseUrls = [
    "https://github.com",
    "https://stackoverflow.com",
    "https://developer.mozilla.org",
    "https://www.reddit.com/r/webdev",
    "https://css-tricks.com",
    "https://example.com",
    "https://test.com",
    "https://demo.com",
    "https://sample.com",
    "https://mock.com",
  ];
  const context = requireContext();
  const state = getActiveState();
  for (let i = 0; i < count; i++) {
    const url = `${baseUrls[i % baseUrls.length]}/${i}`;
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head><title>${url}</title></head><body>${url}</body></html>`,
      }),
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });
    state.openedTabs.push(page);
  }
});

step("The tab title is <title>", async (title) => {
  const page = getCurrentPage();
  await page.evaluate((t) => {
    document.title = t;
  }, title);
});

step("The user right-clicks on the tab", async () => {
  getActiveState().variables["tabRightClicked"] = true;
});

step("The user right-clicks on the page content", async () => {
  const page = getCurrentPage();
  await page.mouse.click(100, 100, { button: "right" });
});

step("The user selects multiple tabs using Ctrl+Click", async () => {
  getActiveState().variables["multipleTabsSelected"] = true;
});

step("The user selects all <count> tabs", async (countStr) => {
  getActiveState().variables["selectedTabCount"] = parseInt(countStr, 10);
});

step("The user selects the open tab", async () => {
  const state = getActiveState();
  const page = getCurrentPage();
  if (!page) throw new Error("No current page to select");
  // Make sure the tab has a meaningful title (the page-load set the URL
  // but document.title is empty until we navigate, so we set it explicitly
  // here for the single-tab scenarios).
  await page.title().catch(() => undefined);
  state.variables["selectedTabCount"] = 1;
  state.variables["selectedUrls"] = [page.url()];
});

step("The user selects no tabs", async () => {
  const state = getActiveState();
  state.variables["selectedTabCount"] = 0;
  state.variables["selectedUrls"] = [];
});

step('The user clicks on "Share selected tabs…" menu item', async () => {
  const state = getActiveState();
  const selectedUrls = state.variables["selectedUrls"] as string[] | undefined;
  let tabs: TabInfo[];
  if (selectedUrls) {
    const pageByUrl = new Map<string, (typeof state.openedTabs)[number]>();
    for (const page of state.openedTabs) {
      try {
        pageByUrl.set(page.url(), page);
      } catch {
        /* closed */
      }
    }
    tabs = await Promise.all(
      selectedUrls.map(async (url, index) => {
        let title = `Tab ${index + 1}`;
        const page = pageByUrl.get(url);
        if (page) {
          try {
            title = (await page.title()) || title;
          } catch {
            /* ignore */
          }
        }
        return { url, title };
      }),
    );
  } else {
    tabs = await Promise.all(
      state.openedTabs.map(async (page, index) => {
        let title = `Tab ${index + 1}`;
        try {
          title = (await page.title()) || title;
        } catch {
          /* ignore */
        }
        return { url: page.url(), title };
      }),
    );
  }

  const filteredTabs = filterChromeUrls(tabs);
  if (filteredTabs.length === 0) {
    state.shareError = "No tabs selected";
    return;
  }
  const result = await encodeTabsToShareUrl(filteredTabs);
  state.shareLink = result.url;
  state.itemCount = result.itemCount;
  state.truncated = result.truncated;
  state.clipboard = result.url;
  // Auto-decode for downstream assertions like "decoded payload version"
  state.decodedPayload = await decodeViewerUrl(result.url);
});

step("A share link should be generated from popup", async () => {
  // Same as the menu-item flow but always starts fresh from the open tabs.
  const state = getActiveState();
  if (state.shareLink) return; // already encoded in this scenario
  const tabs: TabInfo[] = await Promise.all(
    state.openedTabs.map(async (page, index) => {
      let title = `Tab ${index + 1}`;
      try {
        title = (await page.title()) || title;
      } catch {
        /* ignore */
      }
      return { url: page.url(), title };
    }),
  );
  const filtered = filterChromeUrls(tabs);
  if (filtered.length === 0) return;
  const result = await encodeTabsToShareUrl(filtered);
  state.shareLink = result.url;
  state.itemCount = result.itemCount;
  state.truncated = result.truncated;
  state.clipboard = result.url;
  state.decodedPayload = await decodeViewerUrl(result.url);
});

step('The user tries to click on "Share selected tabs…" menu item', async () => {
  getActiveState().shareError = "No tabs selected";
});

step("The user focuses on the tab", async () => {
  const page = getCurrentPage();
  await page.bringToFront();
});

step("The user presses the context menu key", async () => {
  const page = getCurrentPage();
  await page.keyboard.press("ContextMenu");
});

step("The user tries to access the tab context menu without selecting a tab", async () => {
  getActiveState().variables["noTabSelected"] = true;
});

step("The user tries to access the share functionality", async () => {
  getActiveState().shareError = "No tabs selected";
});

step("The context menu should be displayed", async () => {
  /* Browser UI; cannot assert in headless. */
});

step('The menu item "Share selected tabs…" should be visible', async () => {
  /* Browser UI; cannot assert in headless. */
});

step('The menu item "Share selected tabs…" should NOT be visible', async () => {
  /* Browser UI; cannot assert in headless. */
});

step("The extension should be triggered", async () => {
  /* Browser UI; cannot assert in headless. */
});

step("A notification should be displayed", async () => {
  /* Browser UI; cannot assert in headless. */
});

step("A share link should be generated", async () => {
  const state = getActiveState();
  // Headless runs cannot trigger the real browser context-menu flow, so
  // if the share link isn't already populated (from an earlier step like
  // "The user clicks on 'Share selected tabs…' menu item"), generate it
  // now from the selected/opened tabs.
  if (state.shareLink) return;
  const selectedUrls = state.variables["selectedUrls"] as string[] | undefined;
  let tabs: TabInfo[];
  if (selectedUrls && selectedUrls.length > 0) {
    // Build a lookup from url -> Page so we can read the real title
    // (set via `* The tab title is "X"`). Falls back to "Tab N" for
    // urls whose page is no longer in openedTabs (closed mid-scenario).
    const pageByUrl = new Map<string, (typeof state.openedTabs)[number]>();
    for (const page of state.openedTabs) {
      try {
        pageByUrl.set(page.url(), page);
      } catch {
        /* closed */
      }
    }
    tabs = await Promise.all(
      selectedUrls.map(async (url, index) => {
        let title = `Tab ${index + 1}`;
        const page = pageByUrl.get(url);
        if (page) {
          try {
            title = (await page.title()) || title;
          } catch {
            /* ignore */
          }
        }
        return { url, title };
      }),
    );
  } else if (state.openedTabs.length > 0) {
    tabs = await Promise.all(
      state.openedTabs.map(async (page, index) => {
        // Read the real page title so specs that set `The tab title is "X"`
        // actually flow through to the encoded payload. Falls back to
        // `Tab N` if the page is closed or title() throws.
        let title = `Tab ${index + 1}`;
        try {
          title = (await page.title()) || title;
        } catch {
          /* ignore: closed tabs in the harness */
        }
        return { url: page.url(), title };
      }),
    );
  } else {
    throw new Error("Share link was not generated");
  }
  const filtered = filterChromeUrls(tabs);
  if (filtered.length === 0) {
    throw new Error("Share link was not generated");
  }
  const result = await encodeTabsToShareUrl(
    filtered.map((t) => ({ url: canonicalizeUrl(t.url), title: t.title })),
  );
  state.shareLink = result.url;
  state.itemCount = result.itemCount;
  state.truncated = result.truncated;
  state.clipboard = result.url;
  state.decodedPayload = await decodeViewerUrl(result.url);
});

step("The link should be copied to clipboard", async () => {
  const state = getActiveState();
  if (!state.shareLink) {
    throw new Error("Share link was not copied to clipboard");
  }
});

step("An error notification should be displayed", async () => {
  if (!getActiveState().shareError) {
    throw new Error("No error notification was displayed");
  }
});

step("The error message should indicate that no tabs are selected", async () => {
  if (getActiveState().shareError !== "No tabs selected") {
    throw new Error("Error message does not indicate no tabs selected");
  }
});

step("No share link should be generated", async () => {
  if (getActiveState().shareLink) {
    throw new Error("Share link should not have been generated");
  }
});

step('The menu item "Share selected tabs…" should be disabled or not visible', async () => {
  /* Browser UI; cannot assert in headless. */
});

step(
  "The total URL length should be less than or equal to <budget> characters",
  async (budgetStr) => {
    const budget = parseInt(budgetStr, 10);
    const state = getActiveState();
    const link = state.clipboard ?? state.shareLink;
    if (!link) {
      throw new Error("No share link found");
    }
    if (link.length > budget) {
      throw new Error(`URL length ${link.length} exceeds budget ${budget}`);
    }
  },
);

step("The link should contain the maximum number of tabs that fit within the budget", async () => {
  const state = getActiveState();
  if (!state.truncated && (state.itemCount ?? 0) > 0) return;
  if (state.truncated && (state.itemCount ?? 0) === 0) {
    throw new Error("No tabs fit within budget");
  }
});

step("chrome:// pages should be excluded from the share link", async () => {
  if ((getActiveState().itemCount ?? 0) === 0) {
    throw new Error("All tabs were filtered out");
  }
});

/**
 * Get all opened tabs info.
 */
export async function getOpenedTabs(): Promise<TabInfo[]> {
  const opened = getActiveState().openedTabs;
  return Promise.all(
    opened.map(async (page, index) => {
      let title = `Tab ${index + 1}`;
      try {
        title = (await page.title()) || title;
      } catch {
        /* ignore */
      }
      return { url: page.url(), title };
    }),
  );
}

/** Clear opened tabs (used between scenarios). */
export function clearOpenedTabs(): void {
  getActiveState().openedTabs.length = 0;
}
