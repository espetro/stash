"use client";

import * as React from "react";
import { FaArrowLeft, FaPlus, FaBoxArchive } from "react-icons/fa6";

import { cn } from "@/lib/utils";
import AppearanceMenu from "@/components/AppearanceMenu";
import { useLocale } from "@/components/LocaleProvider";
import { t } from "@/i18n";

interface SiteHeaderProps {
  /**
   * `share` renders the slim centered header for the /s/<payload> viewer
   * (logo + Get Stash). `app` renders the /s/new + /stashes header with the
   * New · Library segmented control; `active` marks the current page.
   */
  variant: "share" | "app";
  active?: "new" | "library";
}

/**
 * In-flow header for the /s surfaces, constrained to the same 640px
 * (max-w-160) column as the card below it — replaces the old floating
 * AppHeader pill so the bar aligns with the content edge.
 */
export default function SiteHeader({ variant, active }: SiteHeaderProps) {
  const { lang } = useLocale();
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  const logo = (
    <a
      href="/"
      className="flex items-center gap-2 no-underline transition-opacity duration-200 hover:opacity-80"
      aria-label={t("nav.home", undefined, lang)}
    >
      <img src="/icon-128-v2.png" width={28} height={28} alt="" className="block flex-shrink-0" />
      <span className="text-base font-semibold tracking-tight text-foreground">Stash</span>
    </a>
  );

  if (variant === "share") {
    return (
      <header className="mx-auto flex w-full max-w-160 items-center justify-between px-1 pb-3 sm:px-2">
        {logo}
        <div className="flex items-center gap-1">
          <a
            href="/"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
          >
            {t("nav.getStash", undefined, lang)}
          </a>
          <AppearanceMenu />
        </div>
      </header>
    );
  }

  const segment = (href: string, id: "new" | "library", icon: React.ReactNode, label: string) => (
    <a
      href={href}
      aria-current={active === id ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium no-underline transition-colors",
        active === id
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </a>
  );

  return (
    <header className="mx-auto flex w-full max-w-160 items-center justify-between px-1 pb-3 sm:px-2">
      <div className="flex items-center gap-1">
        {canGoBack && (
          <button
            type="button"
            aria-label={t("nav.back", undefined, lang)}
            onClick={() => window.history.back()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FaArrowLeft className="size-4" />
          </button>
        )}
        <nav
          className="flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5"
          aria-label={t("nav.library", undefined, lang)}
        >
          {segment("/s/new", "new", <FaPlus className="size-3.5" />, t("nav.new", undefined, lang))}
          {segment(
            "/stashes",
            "library",
            <FaBoxArchive className="size-3.5" />,
            t("nav.library", undefined, lang),
          )}
        </nav>
      </div>
      <AppearanceMenu />
    </header>
  );
}
