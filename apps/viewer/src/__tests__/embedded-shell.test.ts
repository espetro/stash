import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * F12/W1: the daemon-embedded viewer shell must make zero network
 * requests. The hosted build may load PostHog and Google Fonts, but the
 * ViewerLayout gates both behind VITE_EMBEDDED_VIEWER; this test pins the
 * gate so a refactor cannot silently reintroduce shell-level egress for
 * the loopback build.
 */
describe("embedded viewer shell (F12)", () => {
  const layout = readFileSync(resolve(__dirname, "../layouts/ViewerLayout.astro"), "utf-8");

  it("gates PostHog behind VITE_EMBEDDED_VIEWER", () => {
    expect(layout).toMatch(/!embedded && posthogKey && posthogHost/);
  });

  it("gates Google Fonts behind VITE_EMBEDDED_VIEWER", () => {
    expect(layout).toMatch(/!embedded && <link rel="preconnect"/);
  });

  it("falls back to system fonts when embedded", () => {
    expect(layout).toMatch(/system-ui/);
  });
});
