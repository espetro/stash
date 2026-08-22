declare global {
  interface Window {
    posthog?: { capture: (event: string, properties?: Record<string, unknown>) => void };
  }
}

/** Fires a funnel event through PostHog (already cookieless/EU-hosted, wired
 *  in Layout.astro). No-ops if PostHog isn't loaded (no key configured, or
 *  blocked by an ad-blocker). Never includes URLs/titles — event name,
 *  surface, and small non-identifying counts only. */
export function recordEvent(event: string, props?: Record<string, unknown>): void {
  try {
    window.posthog?.capture(event, { surface: "web", ...props });
  } catch {
    // best-effort only
  }
}
