import { step } from "../lib/step-registry";
import { encodeTabsToShareUrl, isUrlWithinBudget, type TabInfo } from "../helpers/encoder-helper";
import { decodeShareUrl } from "../helpers/decoder-helper";

const HUNDRED_LONG_TABS: TabInfo[] = Array.from({ length: 100 }, (_, i) => ({
  url: `https://example-${String(i).padStart(4, "0")}.stash.illo.fyi/path/${i}/?ref=stash&extra=${"x".repeat(40)}`,
  title: `Example tab number ${i} demonstrating budget overflow on purpose and more`,
}));

step("An encoder run with 5 stubbed long-URL tabs finishes under 8 seconds", async () => {
  const tabs: TabInfo[] = Array.from({ length: 5 }, (_, i) => ({
    url: `https://example-${String(i).padStart(4, "0")}.stash.illo.fyi/path/${i}/?ref=stash&extra=${"x".repeat(40)}`,
    title: `Example tab ${i} demonstrating budget overflow on purpose`,
  }));
  const start = Date.now();
  const result = await encodeTabsToShareUrl(tabs);
  const elapsed = Date.now() - start;
  if (elapsed >= 8000) {
    throw new Error(`Encoder run took ${elapsed}ms, expected < 8000ms`);
  }
  if (!result.url.includes("#p=")) {
    throw new Error(`Encoded URL missing #p= fragment: ${result.url.slice(0, 80)}`);
  }
});

step("The encoded URL is at most 8000 characters", async () => {
  const tabs: TabInfo[] = Array.from({ length: 5 }, (_, i) => ({
    url: `https://example-${String(i).padStart(4, "0")}.stash.illo.fyi/path/${i}/?ref=stash&extra=${"x".repeat(40)}`,
    title: `Example tab ${i} demonstrating budget overflow on purpose`,
  }));
  const result = await encodeTabsToShareUrl(tabs);
  if (!isUrlWithinBudget(result.url)) {
    throw new Error(`Encoded URL is ${result.url.length} chars, exceeds 8000 budget`);
  }
});

step("The codec roundtrip for 100 long-URL tabs stays under the budget", async () => {
  const result = await encodeTabsToShareUrl(HUNDRED_LONG_TABS);
  if (result.url.length > 8000) {
    throw new Error(`Encoded URL for 100 tabs is ${result.url.length} chars, exceeds 8000 budget`);
  }
  if (result.itemCount !== 100) {
    throw new Error(`Expected 100 items in encoded payload, got ${result.itemCount}`);
  }
  const fragment = result.url.slice(result.url.indexOf("#"));
  const decoded = await decodeShareUrl(fragment);
  if (decoded.items.length !== 100) {
    throw new Error(`Roundtrip mismatch: encoded 100, decoded ${decoded.items.length}`);
  }
});
