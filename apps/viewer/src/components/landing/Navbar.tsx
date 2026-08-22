"use client";

import * as React from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import SettingsMenu from "@/components/landing/SettingsMenu";
import { useLocale } from "@/components/LocaleProvider";
import { t, type Lang } from "@/i18n";
import { localizedHomePath } from "@/i18n/url";
import { cn } from "@/lib/utils";

interface NavbarProps {
  minimal?: boolean;
  /**
   * Server-resolved locale. When set (landing page only) it takes
   * priority over the client store to avoid SSR/hydration mismatch
   * on `/es`, `/fr`, `/ru`, and is forwarded to the language selector
   * so selecting a language navigates to the locale URL.
   */
  lang?: Lang;
}

interface NavItem {
  labelKey: string;
  href: string;
  disabled?: boolean;
}

const LANDING_NAV: readonly NavItem[] = [
  { labelKey: "nav.products", href: "#features" },
  { labelKey: "nav.solutions", href: "#how-it-works" },
  { labelKey: "nav.resources", href: "#demo" },
  { labelKey: "nav.developers", href: "#", disabled: true },
  { labelKey: "nav.enterprise", href: "#", disabled: true },
  { labelKey: "nav.pricing", href: "#", disabled: true },
  { labelKey: "nav.contactSales", href: "#", disabled: true },
] as const;

export default function Navbar({ minimal = false, lang: langProp }: NavbarProps) {
  const { lang: clientLang } = useLocale();
  const lang = langProp ?? clientLang;

  return (
    <nav
      aria-label="Primary"
      className="navbar-shell fixed top-4 left-0 right-0 z-100 pointer-events-none"
    >
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-center gap-3 pointer-events-auto">
        {/* Logo (left) */}
        <a
          href={localizedHomePath(lang)}
          className="logo flex items-center gap-2 no-underline transition-opacity duration-200 hover:opacity-85 pointer-events-auto"
        >
          <img
            src="/icon-128.png"
            width={40}
            height={40}
            alt=""
            aria-hidden="true"
            className="block flex-shrink-0"
          />
          <span className="text-lg font-semibold text-foreground tracking-tight">Stash</span>
        </a>

        {/* Nav pill (center) */}
        <NavigationMenu
          className={cn(
            "nav-links rounded-full border border-border bg-card/80 backdrop-blur shadow-md px-2 py-1.5",
            "max-w-full",
          )}
        >
          <NavigationMenuList className="gap-0">
            {minimal ? (
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <a
                    href={localizedHomePath(lang)}
                    className="rounded-full px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {t("nav.home", undefined, lang)}
                  </a>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : (
              LANDING_NAV.map((item) => (
                <NavigationMenuItem key={item.labelKey}>
                  <NavigationMenuLink asChild>
                    <a
                      href={item.href}
                      aria-disabled={item.disabled ? "true" : undefined}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        item.disabled && "opacity-60 cursor-not-allowed hover:bg-transparent",
                      )}
                    >
                      {t(item.labelKey, undefined, lang)}
                    </a>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))
            )}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Settings pill (right) */}
        <div className="pointer-events-auto">
          <SettingsMenu lang={langProp} />
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 767px) {
          .nav-links {
            display: none;
          }

          .navbar-shell {
            top: 1rem;
          }

          .navbar-shell > div {
            padding-left: 1rem;
            padding-right: 1rem;
            gap: 0.5rem;
          }
        }
        `,
        }}
      />
    </nav>
  );
}
