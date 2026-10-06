import * as React from "react";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import LanguageSelector from "@/components/LanguageSelector";
import { useLocale } from "@/components/LocaleProvider";
import { t } from "@/i18n";
import { FaArrowLeft, FaPlus, FaBoxArchive } from "react-icons/fa6";

/**
 * Floating app navbar for the unprefixed app routes (/s/new, /stashes):
 * a centered pill holding the back chevron, nav actions, and theme/lang —
 * every control lives inside the bar instead of pinned to the edges.
 * An in-flow spacer keeps page content clear of the fixed bar.
 */
export default function AppHeader() {
  const { lang } = useLocale();
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <>
      <div aria-hidden className="h-14 w-full" />
      <header className="fixed top-4 left-0 right-0 z-100 pointer-events-none flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/80 px-2 py-1.5 shadow-md backdrop-blur">
          {canGoBack && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("nav.back", undefined, lang)}
                onClick={() => window.history.back()}
              >
                <FaArrowLeft className="size-4" />
              </Button>
              <span aria-hidden className="h-5 w-px bg-border" />
            </>
          )}

          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a
                href="/s/new"
                aria-label={t("nav.newStash", undefined, lang)}
                title={t("nav.newStash", undefined, lang)}
                className="gap-1.5"
              >
                <FaPlus className="size-3.5" />
                <span className="sr-only sm:not-sr-only">{t("nav.newStash", undefined, lang)}</span>
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a
                href="/stashes"
                aria-label={t("nav.myStashes", undefined, lang)}
                title={t("nav.myStashes", undefined, lang)}
                className="gap-1.5"
              >
                <FaBoxArchive className="size-3.5" />
                <span className="sr-only sm:not-sr-only">
                  {t("nav.myStashes", undefined, lang)}
                </span>
              </a>
            </Button>
          </nav>

          <span aria-hidden className="h-5 w-px bg-border" />
          <ThemeSwitcher variant="toggle" />
          <LanguageSelector />
        </div>
      </header>
    </>
  );
}
