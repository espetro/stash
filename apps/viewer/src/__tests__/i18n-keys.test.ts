import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";
import fr from "@/i18n/messages/fr.json";
import ru from "@/i18n/messages/ru.json";
import { t } from "@/i18n";

/**
 * AppHeader + result-view layout is covered by component tests only lightly
 * (no jsdom RTL harness in the viewer); here we assert the i18n keys that
 * drive the new header/result copy exist in every locale.
 */

const bundles: Record<string, unknown> = { en, es, fr, ru };

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? [key] : flatten(v, key);
  });
}

describe("viewer app i18n keys", () => {
  it.each(["en", "es", "fr", "ru"])("%s has nav keys for AppHeader", (lang) => {
    const keys = flatten(bundles[lang]);
    for (const key of ["nav.newStash", "nav.myStashes", "nav.back"]) {
      expect(keys, `${lang} missing ${key}`).toContain(key);
    }
  });

  it.each(["en", "es", "fr", "ru"])(
    "%s has nav keys for floating pill navbar + Settings dropdown",
    (lang) => {
      const keys = flatten(bundles[lang]);
      for (const key of [
        "nav.products",
        "nav.solutions",
        "nav.resources",
        "nav.developers",
        "nav.enterprise",
        "nav.pricing",
        "nav.contactSales",
        "nav.settings",
        "nav.settings.theme",
        "nav.settings.language",
      ]) {
        expect(keys, `${lang} missing ${key}`).toContain(key);
      }
    },
  );

  it.each(["en", "es", "fr", "ru"])("%s has stash.link hint keys", (lang) => {
    const keys = flatten(bundles[lang]);
    for (const key of [
      "stash.link.payloadHint",
      "stash.link.shortHint",
      "stash.link.shortenFailed",
      "stash.shorten.idle",
    ]) {
      expect(keys, `${lang} missing ${key}`).toContain(key);
    }
  });

  it("shorten idle label is 'Shorten link' in en", () => {
    expect(t("stash.shorten.idle")).toBe("Shorten link");
  });

  it("nav keys resolve via t()", () => {
    expect(t("nav.newStash")).toBe("New stash");
    expect(t("nav.myStashes")).toBe("My stashes");
  });
});
