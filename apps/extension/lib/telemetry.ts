import { getSettings } from "./settings.js";

/** Fires an anonymous funnel event to the shortener's /beacon endpoint.
 *  No tab URLs/titles ever leave the device — only the event name.
 *  Opt-out via Settings.telemetryEnabled; never blocks the UI or throws. */
export async function recordEvent(event: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.telemetryEnabled) return;
    await fetch(`${settings.shortenerOrigin}/beacon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, surface: "extension" }),
    });
  } catch {
    // best-effort only
  }
}
