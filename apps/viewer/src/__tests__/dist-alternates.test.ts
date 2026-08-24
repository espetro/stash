import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * W3 built-HTML check: the SSR'd /s page must advertise machine-readable
 * alternates. Skipped unless a build exists, so `pnpm run test` passes
 * pre-build while the CI order build -> test:dist catches it.
 */
const distIndex = path.resolve(__dirname, "../../dist/s/index.html");
const hasDist = existsSync(distIndex);

describe.runIf(hasDist)("built /s HTML advertises alternate links", () => {
  const html = readFileSync(distIndex, "utf8").replace(/&amp;/g, "&");

  it("emits a JSON alternate link matching /s?p=...&format=json", () => {
    const hrefs = [
      ...html.matchAll(/<link rel="alternate" type="application\/json" href="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // SSR emits a stable href with an empty p (the client-side hook
      // fills in the payload after decoding the fragment).
      expect(href.replace(/^https?:\/\/[^/]+/, "")).toMatch(/^\/s\?p=.*&format=json$/);
    }
  });

  it("emits a Markdown alternate link matching /s?p=...&format=md", () => {
    const hrefs = [
      ...html.matchAll(/<link rel="alternate" type="text\/markdown" href="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.replace(/^https?:\/\/[^/]+/, "")).toMatch(/^\/s\?p=.*&format=md$/);
    }
  });

  it("resolves alternate hrefs to the configured viewer origin, never localhost", () => {
    const expectedOrigin = process.env.VITE_VIEWER_ORIGIN || "https://stash.illo.fyi";
    const hrefs = [
      ...html.matchAll(
        /<link rel="alternate" type="(?:application\/json|text\/markdown)" href="([^"]+)"/g,
      ),
    ].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toMatch(/localhost|127\.0\.0\.1/);
      expect(href.startsWith(expectedOrigin)).toBe(true);
    }
  });
});

describe.skipIf(hasDist)("built /s HTML alternates (skipped: no dist/)", () => {
  it.skip("dist/s/index.html not present; run `pnpm --filter stash-viewer run build` first", () => {});
});
