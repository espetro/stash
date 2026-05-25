import { type ComponentProps } from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Sun, Moon } from "lucide-react";
import { getTheme, setTheme, getEffectiveTheme } from "@stash/theme";

interface ThemeSwitcherProps extends ComponentProps<"div"> {}

export default function ThemeSwitcher({ className, ...props }: ThemeSwitcherProps) {
  const [isDark, setIsDark] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsDark(getEffectiveTheme() === "dark");
  }, []);

  const updateUI = useCallback((dark: boolean, animate = true) => {
    setIsDark(dark);
    if (selectorRef.current) {
      selectorRef.current.style.transition = animate
        ? "left 0.22s cubic-bezier(0.4, 0, 0.2, 1)"
        : "none";
      selectorRef.current.style.left = dark ? "calc(50% - 2px)" : "2px";
    }
  }, []);

  const applyTheme = useCallback(
    async (next: "light" | "dark", clickX: number, clickY: number) => {
      const apply = () => {
        setTheme(next, localStorage);
        updateUI(next === "dark");
      };

      if (!document.startViewTransition) {
        apply();
        return;
      }

      const endRadius = Math.hypot(
        Math.max(clickX, window.innerWidth - clickX),
        Math.max(clickY, window.innerHeight - clickY),
      );

      const transition = document.startViewTransition(apply);
      await transition.ready;

      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${clickX}px ${clickY}px)`,
            `circle(${endRadius}px at ${clickX}px ${clickY}px)`,
          ],
        },
        {
          duration: 420,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    },
    [updateUI],
  );

  useEffect(() => {
    updateUI(getEffectiveTheme() === "dark", false);

    const handler = () => {
      if (getTheme(localStorage) === "system") {
        updateUI(getEffectiveTheme() === "dark");
      }
    };

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", handler);
    return () =>
      window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", handler);
  }, [updateUI]);

  const handleLight = useCallback(
    (e: React.MouseEvent) => {
      if (getEffectiveTheme() === "light") return;
      applyTheme("light", e.clientX, e.clientY);
    },
    [applyTheme],
  );

  const handleDark = useCallback(
    (e: React.MouseEvent) => {
      if (getEffectiveTheme() === "dark") return;
      applyTheme("dark", e.clientX, e.clientY);
    },
    [applyTheme],
  );

  return (
    <div {...props} className={`${className} flex justify-center`}>
      <div
        className="relative flex items-center rounded-full p-0.5"
        style={{ backgroundColor: "var(--muted)" }}
        role="group"
        aria-label="Theme switcher"
      >
        <div
          ref={selectorRef}
          className="absolute top-0.5 left-0.5 h-[calc(100%-4px)] rounded-full pointer-events-none"
          style={{
            width: "calc(50% - 2px)",
            backgroundColor: "var(--background)",
            boxShadow: "0 1px 4px 0 rgba(0, 0, 0, 0.18), 0 0.5px 1.5px 0 rgba(0, 0, 0, 0.1)",
            zIndex: 0,
          }}
        />
        <button
          onClick={handleLight}
          aria-label="Light theme"
          aria-pressed={!isDark}
          className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full border-none bg-none cursor-pointer transition-colors duration-150"
          style={{
            color: !isDark ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          <Sun size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleDark}
          aria-label="Dark theme"
          aria-pressed={isDark}
          className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full border-none bg-none cursor-pointer transition-colors duration-150"
          style={{
            color: isDark ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          <Moon size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
