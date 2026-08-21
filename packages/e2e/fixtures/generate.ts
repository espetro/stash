/**
 * Fixture generator.
 *
 * Regenerates `fixtures/payloads.json` and `fixtures/sample-tabs.json`
 * using the current codec pipeline. Wired into Playwright's
 * `globalSetup` so a stale fixture is impossible: each suite run
 * rebuilds them in <1s.
 *
 * Why commit them at all if they're generated? Reviewability — a PR
 * that changes behavior should diff against a representative fixture.
 * Keeping them small and self-contained (no timestamps encoded in the
 * payload itself) makes diffing useful. Re-run this script whenever
 * the codec source changes:
 *
 *   pnpm --filter @stash/e2e exec tsx fixtures/generate.ts
 *
 * **Naming convention**: fixture `name`s match the literals the steps
 * pass to `generateViewerUrlFromFixture("...")` and the registration
 * of which scenario uses them. Renaming without that alignment will
 * surface immediately as "Payload 'X' not found in payloads.json".
 */

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  encodeTabsToShareUrl,
  createPayload,
  encodePayloadToUrl,
  decodeShareUrl,
} from "@stash/codec";

// See encoder-helper.ts for the same trick. brotli-wasm's ESM entry is
// the web bundle (uses fetch()) which crashes under Node; the CJS
// entry is the sync Node build.
const nodeRequire = createRequire(import.meta.url);
const nodeBrotli = nodeRequire("brotli-wasm") as {
  compress: (data: Uint8Array, opts: { quality: number }) => Uint8Array;
  decompress: (data: Uint8Array) => Uint8Array;
};

const brotli = {
  compress: (data: Uint8Array, opts: { quality: number }) =>
    nodeBrotli.compress(data, opts),
  decompress: (data: Uint8Array) => nodeBrotli.decompress(data),
};

type TabInfo = { url: string; title: string };

interface PayloadFixture {
  name: string;
  description: string;
  fragment: string;
  itemCount: number;
  items: TabInfo[];
}

interface SampleTabsFixture {
  [dataset: string]: TabInfo[];
}

const VIEWER_ORIGIN = "http://localhost:4321";

const SINGLE_TAB: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
const THREE_TABS: TabInfo[] = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://stackoverflow.com", title: "Stack Overflow" },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
];
const FIVE_TABS: TabInfo[] = [
  ...THREE_TABS,
  { url: "https://www.reddit.com/r/webdev", title: "Reddit - webdev" },
  { url: "https://css-tricks.com", title: "CSS-Tricks" },
];
const LONG_TITLE_TABS: TabInfo[] = [
  {
    url: "https://example.com/long-url-path",
    title: "This is a very long title that exceeds the thirty character limit and should be truncated",
  },
];
const SPECIAL_CHARS_TABS: TabInfo[] = [
  {
    url: "https://example.com/path?query=value&other=123#section",
    title: "URL with special chars & # ?",
  },
];
const UNICODE_TABS: TabInfo[] = [
  {
    url: "https://example.com/日本語/テスト",
    title: "日本語のページ - Unicode Test",
  },
];
const HUNDRED_TABS: TabInfo[] = Array.from({ length: 100 }, (_, i) => ({
  // Long enough URLs and titles that 100 items, after brotli compression,
  // exceed the 8000-char share URL budget. Forces the codec to truncate.
  url: `https://example-${i.toString().padStart(4, "0")}.stash.illo.fyi/path/${i}/?ref=stash`,
  title: `Example tab number ${i} demonstrating budget overflow on purpose`,
}));
const CHROME_AND_REAL: TabInfo[] = [
  { url: "chrome://extensions", title: "Extensions" },
  { url: "chrome://settings", title: "Settings" },
  { url: "https://github.com", title: "GitHub" },
];

/**
 * Generate one encoded fixture. The optional override allows we
 * fixtures with crafted content (expired, empty, version 0).
 */
async function enc(
  name: string,
  description: string,
  tabs: TabInfo[],
  options: {
    /** Override the encoded fragment directly (e.g. for crafted cases). */
    fragment?: string;
    itemCount?: number;
  } = {},
): Promise<PayloadFixture> {
  const result = await encodeTabsToShareUrl(tabs, brotli, 24, VIEWER_ORIGIN);
  return {
    name,
    description,
    fragment: options.fragment ?? new URL(result.url).hash,
    itemCount: options.itemCount ?? result.itemCount,
    items: tabs,
  };
}

async function generatePayloadFixtures(): Promise<PayloadFixture[]> {
  const out: PayloadFixture[] = [];

  out.push(await enc("single-tab", "One shareable tab URL", SINGLE_TAB));
  out.push(await enc("three-tabs", "Three tab URLs", THREE_TABS));
  out.push(await enc("five-tabs", "Five tab URLs across categories", FIVE_TABS));
  out.push(await enc("long-title", "Long-title tab to verify truncation", LONG_TITLE_TABS));
  out.push(await enc("special-chars", "URL and title with reserved/special characters", SPECIAL_CHARS_TABS));
  out.push(await enc("unicode", "URL path and title in Japanese", UNICODE_TABS));
  out.push(await enc("chrome-mixed", "URLs including chrome:// entries", CHROME_AND_REAL));

  // Empty items — share link with no shared tabs.
  out.push(await enc("empty-items", "No shared tabs", []));

  // Expired payload: create payload manually with negative expiry
  // hours so the timestamp lands in the past.
  {
    const expiredPayload = createPayload(SINGLE_TAB, -1);
    const encoded = await encodePayloadToUrl(expiredPayload, brotli);
    out.push({
      name: "expired",
      description: "An expired share link payload",
      fragment: `#p=${encoded}`,
      itemCount: 1,
      items: SINGLE_TAB,
    });
  }

  // 100 tabs to stress the budget.
  out.push(await enc("hundred-tabs", "100 tabs to force budget truncation", HUNDRED_TABS));

  return out;
}

function generateSampleTabs(): SampleTabsFixture {
  return {
    "five-tabs": [...FIVE_TABS],
    "three-tabs": [...THREE_TABS],
    "single-tab": [...SINGLE_TAB],
  };
}

async function main(): Promise<void> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const payloadsPath = path.resolve(here, "payloads.json");
  const sampleTabsPath = path.resolve(here, "sample-tabs.json");

  const payloads = await generatePayloadFixtures();
  fs.writeFileSync(payloadsPath, JSON.stringify(payloads, null, 2) + "\n");

  const samples = generateSampleTabs();
  fs.writeFileSync(sampleTabsPath, JSON.stringify(samples, null, 2) + "\n");

  // Round-trip the freshly written fixtures through the codec so a
  // stale fixture set can't ship silently. Fails fast on regression.
  // `empty-items` is intentionally skipped — the codec refuses to
  // decode an empty fragment (`Invalid URL fragment format`), so the
  // round-trip is broken by design. The viewer-side test asserts the
  // empty-state UX based on the viewer decoding an empty payload.
  for (const p of payloads) {
    if (p.name === "empty-items") continue;
    if (!p.fragment) continue;
    const decoded = await decodeShareUrl(p.fragment, brotli);
    if (decoded.items.length !== p.itemCount) {
      throw new Error(
        `fixture ${p.name} round-trip mismatch: codec returned ${decoded.items.length} items, fixture says ${p.itemCount}`,
      );
    }
  }

  process.stdout.write(
    `wrote ${payloads.length} payloads to ${payloadsPath}\nwrote ${Object.keys(samples).length} datasets to ${sampleTabsPath}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
