"use client";

import * as React from "react";
import { DEFAULT_LANG, type Lang, isLang } from "@/i18n";

interface LocaleContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const defaultValue: LocaleContextValue = { lang: DEFAULT_LANG, setLang: () => {} };

const LocaleContext = React.createContext<LocaleContextValue>(defaultValue);

const STORAGE_KEY = "stash-locale";

function readStoredLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw && isLang(raw) ? raw : DEFAULT_LANG;
}

function updateHtmlLang(lang: Lang) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

interface LocaleProviderProps {
  children: React.ReactNode;
  initialLang?: Lang;
}

export function LocaleProvider({ children, initialLang }: LocaleProviderProps) {
  const [lang, setLangState] = React.useState<Lang>(() => initialLang ?? DEFAULT_LANG);

  React.useEffect(() => {
    const stored = readStoredLang();
    setLangState(stored);
    updateHtmlLang(stored);
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    updateHtmlLang(next);
  }, []);

  const value = React.useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return React.useContext(LocaleContext);
}
