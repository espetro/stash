import * as React from "react";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import LanguageSelector from "@/components/LanguageSelector";
import { useLocale } from "@/components/LocaleProvider";
import { t } from "@/i18n";
import { FaArrowLeft, FaPlus, FaBoxArchive } from "react-icons/fa6";

/**
 * Minimal app header for the unprefixed app routes (/s/new, /stashes):
 * optional back chevron on the left, nav actions + theme/lang on the right.
 */
export default function AppHeader() {
  const { lang } = useLocale();
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <header className="flex w-full items-center justify-between px-1 py-2">
      {canGoBack ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("nav.back", undefined, lang)}
          onClick={() => window.history.back()}
        >
          <FaArrowLeft className="size-4" />
        </Button>
      ) : (
        <span aria-hidden className="size-9" />
      )}

      <nav className="flex items-center gap-1">
        <Button variant="ghost" size="sm" asChild>
          <a href="/s/new" className="gap-1.5">
            <FaPlus className="size-3.5" />
            {t("nav.newStash", undefined, lang)}
          </a>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href="/stashes" className="gap-1.5">
            <FaBoxArchive className="size-3.5" />
            {t("nav.myStashes", undefined, lang)}
          </a>
        </Button>
        <ThemeSwitcher />
        <LanguageSelector />
      </nav>
    </header>
  );
}
