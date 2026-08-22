"use client";

import * as React from "react";
import { FaLanguage, FaCheck } from "react-icons/fa6";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/LocaleProvider";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type Lang } from "@/i18n";
import { localizedHomePath } from "@/i18n/url";

interface LanguageSelectorProps extends React.ComponentProps<"button"> {
  /**
   * When set, the selector is on a locale-prefixed landing route and
   * selecting a language also navigates to that locale's URL (full
   * page load). When unset, selection is purely client-side (used by
   * unprefixed pages like `/s/*`).
   */
  lang?: Lang;
}

export default function LanguageSelector({
  className,
  lang: langProp,
  ...props
}: LanguageSelectorProps) {
  const { lang, setLang } = useLocale();
  // On a locale-prefixed route, prefer the prop (matches server-rendered
  // `lang` attribute); otherwise fall back to the client store.
  const activeLang = langProp ?? lang;

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Select language"
          className={cn(
            "group inline-flex h-9 w-9 items-center justify-center rounded-full border-none bg-transparent text-foreground outline-none transition-transform duration-150 ease-out active:scale-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
          {...props}
        >
          <FaLanguage
            size={20}
            className="transition-colors duration-150 group-hover:text-primary"
            strokeWidth={1.5}
          />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 min-w-[9rem] rounded-xl border border-border bg-card p-1 shadow-lg shadow-black/5 outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <DropdownMenuPrimitive.Item
              key={code}
              onSelect={() => {
                setLang(code);
                // On landing routes: navigate to the locale URL so crawlers
                // see distinct HTML per locale. localStorage is still
                // updated above so the preference carries to unprefixed
                // pages like `/s/*`.
                if (langProp) {
                  window.location.assign(localizedHomePath(code));
                }
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors",
                "hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                activeLang === code && "text-primary",
              )}
            >
              <span>{LANGUAGE_LABELS[code]}</span>
              {activeLang === code && <FaCheck size={14} />}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
