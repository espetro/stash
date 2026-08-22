"use client";

import * as React from "react";
import { FaSliders, FaCheck, FaChevronRight } from "react-icons/fa6";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/LocaleProvider";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, t, type Lang } from "@/i18n";
import { localizedHomePath } from "@/i18n/url";

// Locale -> flag emoji. en uses the US flag by convention (English
// isn't tied to a single country). Matches plan reference #2.
const LOCALE_FLAGS: Record<Lang, string> = {
  en: "\uD83C\uDDFA\uD83C\uDDF8",
  es: "\uD83C\uDDEA\uD83C\uDDF8",
  fr: "\uD83C\uDDEB\uD83C\uDDF7",
  ru: "\uD83C\uDDF7\uD83C\uDDFA",
};

interface SettingsMenuProps {
  /**
   * Server-resolved locale. When set (e.g. on `/`, `/es`, `/fr`, `/ru`),
   * selecting a language navigates to that locale's URL so crawlers see
   * distinct HTML per locale. When unset, selection is purely client-side.
   */
  lang?: Lang;
}

export default function SettingsMenu({ lang: langProp }: SettingsMenuProps) {
  const { lang, setLang } = useLocale();
  const activeLang = langProp ?? lang;

  const settingsLabel = t("nav.settings", undefined, activeLang);
  const themeRowLabel = t("nav.settings.theme", undefined, activeLang);
  const languageRowLabel = t("nav.settings.language", undefined, activeLang);

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={settingsLabel !== "nav.settings" ? settingsLabel : "Settings"}
          className={cn(
            "group inline-flex items-center justify-center rounded-full border border-border bg-card/80 backdrop-blur shadow-md",
            "h-10 w-10 text-foreground outline-none transition-colors",
            "hover:bg-muted",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <FaSliders
            size={18}
            strokeWidth={1.5}
            className="transition-colors duration-150 group-hover:text-primary"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 min-w-[18rem] rounded-xl border border-border bg-card p-1 shadow-lg shadow-black/5 outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <DropdownMenuPrimitive.Group>
            {/* Row 1: Theme */}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {themeRowLabel !== "nav.settings.theme" ? themeRowLabel : "Theme"}
              </span>
              <div className="flex justify-end">
                <ThemeSwitcher />
              </div>
            </div>

            <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />

            {/* Row 2: Language (submenu) */}
            <DropdownMenuPrimitive.Sub>
              <DropdownMenuPrimitive.SubTrigger
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors",
                  "hover:bg-muted focus:bg-muted data-[state=open]:bg-muted",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <span aria-hidden="true">{LOCALE_FLAGS[activeLang]}</span>
                <span>
                  {languageRowLabel !== "nav.settings.language" ? languageRowLabel : "Language"}
                </span>
                <span className="text-muted-foreground">{LANGUAGE_LABELS[activeLang]}</span>
                <FaChevronRight
                  size={12}
                  className="ml-auto text-muted-foreground"
                  aria-hidden="true"
                />
              </DropdownMenuPrimitive.SubTrigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.SubContent
                  sideOffset={6}
                  className={cn(
                    "z-50 min-w-[10rem] rounded-xl border border-border bg-card p-1 shadow-lg shadow-black/5 outline-none",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                  )}
                >
                  {SUPPORTED_LANGUAGES.map((code) => {
                    const labelKey = `language.${code}`;
                    const label =
                      t(labelKey, undefined, activeLang) !== labelKey
                        ? t(labelKey, undefined, activeLang)
                        : LANGUAGE_LABELS[code];
                    return (
                      <DropdownMenuPrimitive.Item
                        key={code}
                        onSelect={() => {
                          setLang(code);
                          if (langProp) {
                            window.location.assign(localizedHomePath(code));
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors",
                          "hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          activeLang === code && "text-primary",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true">{LOCALE_FLAGS[code]}</span>
                          <span>{label}</span>
                        </span>
                        {activeLang === code && <FaCheck size={14} aria-hidden="true" />}
                      </DropdownMenuPrimitive.Item>
                    );
                  })}
                </DropdownMenuPrimitive.SubContent>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Sub>
          </DropdownMenuPrimitive.Group>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
