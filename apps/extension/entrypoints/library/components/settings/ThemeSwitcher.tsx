import { useState, useEffect, useCallback, useRef, FC, KeyboardEvent } from "react";
import { getTheme, setTheme, getEffectiveTheme } from "@stash/theme";
import { browserStorageAdapter } from "@/lib/browser-storage-adapter.js";
import { LuMonitor, LuMoon, LuSun } from "react-icons/lu";

type Theme = "light" | "dark" | "system";

export interface ThemeSwitcherProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const ICONS: Record<Theme, FC<{ className?: string }>> = {
  light: LuSun,
  dark: LuMoon,
  system: LuMonitor,
};

export default function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">("light");
  const selectorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateSelectorPosition = useCallback((themeValue: Theme, animate = true) => {
    if (!selectorRef.current || !containerRef.current) return;

    const index = THEMES.findIndex((t) => t.value === themeValue);
    if (index === -1) return;

    const segmentWidth = 100 / THEMES.length;
    selectorRef.current.style.transition = animate
      ? "left 0.22s cubic-bezier(0.4, 0, 0.2, 1), width 0.22s cubic-bezier(0.4, 0, 0.2, 1)"
      : "none";
    selectorRef.current.style.left = `${index * segmentWidth}%`;
    selectorRef.current.style.width = `${segmentWidth}%`;
  }, []);

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
    (e: KeyboardEvent, themeValue: Theme) => {
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
