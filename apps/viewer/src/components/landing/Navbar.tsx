"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { INSTALL_CHROME_URL, INSTALL_FIREFOX_URL } from "@/lib/constants";
import LanguageSelector from "@/components/LanguageSelector";
import { useLocale } from "@/components/LocaleProvider";
import { t, type Lang } from "@/i18n";
import { localizedHomePath } from "@/i18n/url";

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

export default function Navbar({ minimal = false, lang: langProp }: NavbarProps) {
  const { lang: clientLang } = useLocale();
  const lang = langProp ?? clientLang;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setScrolled(!entry.isIntersecting);
        });
      },
      { threshold: 0, rootMargin: "0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const toggleDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }, []);

  const closeDropdown = useCallback(() => setOpen(false), []);

  return (
    <nav
      className={`navbar fixed top-0 left-0 right-0 z-100 bg-card transition-all duration-300 border-b border-transparent ${
        scrolled ? "scrolled" : ""
      }`}
    >
      <div
        ref={sentinelRef}
        className="sentinel absolute top-[50px] left-0 h-px w-px pointer-events-none"
      />

      <div className="navbar-container max-w-7xl mx-auto px-6 py-3.5 grid grid-cols-[auto_1fr_auto] items-center gap-6">
        {/* Logo */}
        <a
          href={localizedHomePath(lang)}
          className="logo flex items-center gap-2 no-underline transition-opacity duration-200 justify-self-start"
        >
          <img
            src="/icon-128.png"
            width={40}
            height={40}
            alt=""
            aria-hidden="true"
            className="logo-icon block flex-shrink-0"
          />
          <span className="logo-text text-lg font-semibold text-foreground tracking-tight">
            Stash
          </span>
        </a>

        {/* Nav Links */}
        <div className="nav-links flex items-center gap-8 justify-self-center">
          {minimal ? (
            <a
              href={localizedHomePath(lang)}
              className="nav-link text-foreground no-underline text-[0.9375rem] font-medium font-sans relative pb-0.5"
            >
              {t("nav.home", undefined, lang)}
            </a>
          ) : (
            <>
              <a
                href="#features"
                className="nav-link text-foreground no-underline text-[0.9375rem] font-medium font-sans relative pb-0.5"
              >
                {t("nav.features", undefined, lang)}
              </a>
              <a
                href="#how-it-works"
                className="nav-link text-foreground no-underline text-[0.9375rem] font-medium font-sans relative pb-0.5"
              >
                {t("nav.howItWorks", undefined, lang)}
              </a>
              <a
                href="#demo"
                className="nav-link text-foreground no-underline text-[0.9375rem] font-medium font-sans relative pb-0.5"
              >
                {t("nav.demo", undefined, lang)}
              </a>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="justify-self-end flex items-center gap-2">
          <LanguageSelector variant="navbar" lang={langProp} />

          <div ref={dropdownRef} className="install-dropdown relative">
            <button
              type="button"
              onClick={toggleDropdown}
              aria-expanded={open}
              aria-haspopup="true"
              className="cta-button bg-accent text-accent-foreground py-2 px-4 rounded-md text-[0.875rem] font-semibold no-underline transition-colors duration-200 font-sans dropdown-trigger flex items-center cursor-pointer"
            >
              {t("install.trigger", undefined, lang)}
            </button>
            <div
              className={`dropdown-menu absolute top-full right-0 bg-card border border-border rounded-md min-w-48 py-2 mt-2 shadow-md transition-all duration-200 z-10 ${
                open ? "opacity-100 visible translate-y-0" : "opacity-0 invisible -translate-y-2"
              }`}
              role="menu"
            >
              <a
                href={INSTALL_CHROME_URL}
                onClick={closeDropdown}
                className="dropdown-item block py-2.5 px-4 text-foreground no-underline text-[0.875rem] font-medium font-sans transition-colors duration-150"
                role="menuitem"
              >
                {t("install.chrome", undefined, lang)}
              </a>
              <a
                href={INSTALL_FIREFOX_URL}
                onClick={closeDropdown}
                className="dropdown-item block py-2.5 px-4 text-foreground no-underline text-[0.875rem] font-medium font-sans transition-colors duration-150"
                role="menuitem"
              >
                {t("install.firefox", undefined, lang)}
              </a>
              <div className="dropdown-divider h-px bg-border my-2"></div>
              <a
                href="/s/new"
                onClick={closeDropdown}
                className="dropdown-item block py-2.5 px-4 text-foreground no-underline text-[0.875rem] font-medium font-sans transition-colors duration-150"
                role="menuitem"
              >
                {t("install.tryInBrowser", undefined, lang)}
              </a>
            </div>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .navbar.scrolled {
          background-color: var(--card);
          border-bottom: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }

        .logo:hover {
          opacity: 0.85;
        }

        .nav-link::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0;
          height: 1px;
          background-color: var(--primary);
          transition: width 0.2s ease;
        }

        .nav-link:hover::after {
          width: 100%;
        }

        .nav-link:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 4px;
          border-radius: 2px;
        }

        .cta-button:hover {
          background-color: color-mix(in srgb, var(--accent) 85%, transparent);
        }

        .cta-button:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }

        .dropdown-item:hover {
          background-color: var(--muted);
        }

        .dropdown-item:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: -2px;
        }

        @media (max-width: 767px) {
          .navbar-container {
            padding: 0.75rem 1rem;
            grid-template-columns: auto 1fr;
          }

          .nav-links {
            display: none;
          }

          .logo-text {
            font-size: 1rem;
          }

          .cta-button {
            font-size: 0.8125rem;
            padding: 0.5rem 0.875rem;
          }

          .dropdown-menu {
            right: -0.5rem;
          }
        }

        @media (max-width: 767px) and (hover: none) {
          .dropdown-menu {
            display: none;
          }

          .install-dropdown.open .dropdown-menu {
            display: block;
          }
        }
        `,
        }}
      />
    </nav>
  );
}
