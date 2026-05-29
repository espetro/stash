import React, { useState, useEffect, useCallback, useRef } from "react";
import { getTheme, setTheme, getEffectiveTheme } from "@stash/theme";
import { browserStorageAdapter } from "../../../lib/browser-storage-adapter.js";

type Theme = "light" | "dark" | "system";

interface ThemeSwitcherProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

const ICONS: Record<Theme, React.FC<{ className?: string }>> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

export default function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">("light");
  const selectorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateSelectorPosition = useCallback(
    (themeValue: Theme, animate = true) => {
      if (!selectorRef.current || !containerRef.current) return;

      const index = THEMES.findIndex((t) => t.value === themeValue);
      if (index === -1) return;

      const segmentWidth = 100 / THEMES.length;
      selectorRef.current.style.transition = animate
        ? "left 0.22s cubic-bezier(0.4, 0, 0.2, 1), width 0.22s cubic-bezier(0.4, 0, 0.2, 1)"
        : "none";
      selectorRef.current.style.left = `${index * segmentWidth}%`;
      selectorRef.current.style.width = `${segmentWidth}%`;
    },
    [],
  );

  useEffect(() => {
    setEffectiveTheme(getEffectiveTheme());
    updateSelectorPosition(value, false);

    const handler = () => {
      setEffectiveTheme(getEffectiveTheme());
      if (getTheme(browserStorageAdapter) === "system") {
        updateSelectorPosition("system", true);
      }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [value, updateSelectorPosition]);

  const handleClick = useCallback(
    (themeValue: Theme) => {
      if (themeValue === value) return;
      setTheme(themeValue, browserStorageAdapter);
      setEffectiveTheme(getEffectiveTheme());
      updateSelectorPosition(themeValue, true);
      onChange(themeValue);
    },
    [value, onChange, updateSelectorPosition],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, themeValue: Theme) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick(themeValue);
      }
    },
    [handleClick],
  );

  return (
    <div
      ref={containerRef}
      className="theme-switcher"
      role="radiogroup"
      aria-label="Theme selection"
    >
      <div ref={selectorRef} className="theme-switcher-selector" aria-hidden="true" />
      {THEMES.map((theme) => {
        const Icon = ICONS[theme.value];
        const isActive = value === theme.value;
        const isSystemActive = theme.value === "system" && isActive;

        return (
          <button
            key={theme.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${theme.label} theme${isSystemActive ? ` (currently ${effectiveTheme})` : ""}`}
            className={`theme-switcher-button${isActive ? " theme-switcher-button--active" : ""}`}
            onClick={() => handleClick(theme.value)}
            onKeyDown={(e) => handleKeyDown(e, theme.value)}
            tabIndex={isActive ? 0 : -1}
          >
            <Icon className="theme-switcher-icon" />
            <span className="theme-switcher-label">{theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}
