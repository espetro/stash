"use client";

import * as React from "react";
import { FaSliders, FaCheck, FaSun, FaMoon, FaDesktop } from "react-icons/fa6";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/LocaleProvider";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from "@/i18n";
import { t } from "@/i18n";
import { getTheme, setTheme } from "@stash/theme";

type Preference = "light" | "dark" | "system";

const THEME_OPTIONS: { value: Preference; icon: React.ReactNode; labelKey: string }[] = [
  { value: "light", icon: <FaSun size={13} />, labelKey: "theme.light" },
  { value: "system", icon: <FaDesktop size={13} />, labelKey: "theme.system" },
  { value: "dark", icon: <FaMoon size={13} />, labelKey: "theme.dark" },
];

const itemClass = cn(
  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors",
  "hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
);

const labelClass =
  "px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Single settings menu for /s surfaces: theme preference (light / system /
 * dark) and language, replacing the loose ThemeSwitcher + LanguageSelector
 * pair that used to live inside the share card / floating pill.
 */
export default function AppearanceMenu() {
  const { lang, setLang } = useLocale();
  const [preference, setPreference] = React.useState<Preference>("system");

  React.useEffect(() => {
    setPreference(getTheme(localStorage));
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getTheme(localStorage) === "system") setPreference("system");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const chooseTheme = (next: Preference) => {
    setTheme(next, localStorage);
    setPreference(next);
  };

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t("appearance.label", undefined, lang)}
          className="group inline-flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <FaSliders size={17} />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 min-w-[11rem] rounded-xl border border-border bg-card p-1 shadow-lg shadow-black/5 outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <DropdownMenuPrimitive.Label className={labelClass}>
            {t("nav.settings.theme", undefined, lang)}
          </DropdownMenuPrimitive.Label>
          {THEME_OPTIONS.map(({ value, icon, labelKey }) => (
            <DropdownMenuPrimitive.Item
              key={value}
              onSelect={() => chooseTheme(value)}
              className={cn(itemClass, preference === value && "text-primary")}
            >
              <span className="flex items-center gap-2.5">
                {icon}
                {t(labelKey, undefined, lang)}
              </span>
              {preference === value && <FaCheck size={13} />}
            </DropdownMenuPrimitive.Item>
          ))}
          <DropdownMenuPrimitive.Separator className="mx-1 my-1.5 h-px bg-border" />
          <DropdownMenuPrimitive.Label className={labelClass}>
            {t("nav.settings.language", undefined, lang)}
          </DropdownMenuPrimitive.Label>
          {SUPPORTED_LANGUAGES.map((code) => (
            <DropdownMenuPrimitive.Item
              key={code}
              onSelect={() => setLang(code)}
              className={cn(itemClass, lang === code && "text-primary")}
            >
              <span>{LANGUAGE_LABELS[code]}</span>
              {lang === code && <FaCheck size={13} />}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
