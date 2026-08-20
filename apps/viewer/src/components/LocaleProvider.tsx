"use client";

import * as React from "react";
import { DEFAULT_LANG, type Lang, isLang } from "@/i18n";

const STORAGE_KEY = "stash-locale";
const CHANGE_EVENT = "stash-locale-change";

const listeners = new Set<(lang: Lang) => void>();
let currentLang: Lang = DEFAULT_LANG;

function readStoredLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw && isLang(raw) ? raw : DEFAULT_LANG;
}

function notify(lang: Lang) {
  for (const listener of listeners) listener(lang);
}

if (typeof window !== "undefined") {
  currentLang = readStoredLang();
  document.documentElement.lang = currentLang;
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue && isLang(event.newValue)) {
      currentLang = event.newValue;
      notify(currentLang);
    }
  });
  window.addEventListener(CHANGE_EVENT, () => {
    notify(currentLang);
  });
}

function setLang(next: Lang) {
  if (typeof window === "undefined") return;
  if (currentLang === next) return;
  currentLang = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Lang {
  return currentLang;
}

function getServerSnapshot(): Lang {
  return DEFAULT_LANG;
}

/**
 * Astro renders each interactive component as an independent React island,
 * so React context cannot span them. Locale state therefore lives in this
 * module-level store, synced across islands via a custom event and persisted
 * in localStorage. LocaleProvider is kept as a pass-through so existing
 * layouts keep working; useLocale() works in any island regardless.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useLocale(): { lang: Lang; setLang: (lang: Lang) => void } {
  const lang = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { lang, setLang };
}
