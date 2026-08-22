import { type ComponentProps } from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { FaSun, FaMoon, FaDesktop } from "react-icons/fa6";
import { getTheme, setTheme, getEffectiveTheme } from "@stash/theme";

interface ThemeSwitcherProps extends ComponentProps<"div"> {}

type Preference = "light" | "dark" | "system";

const SELECTOR_WIDTH = "calc(33.333% - 1.333px)";
const LIGHT_LEFT = "2px";
const SYSTEM_LEFT = "33%";
const DARK_LEFT = "calc(66.666% - 0px)";

export default function ThemeSwitcher({ className, ...props }: ThemeSwitcherProps) {
  const [preference, setPreference] = useState<Preference>("system");
  const [isDark, setIsDark] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  const updateUI = useCallback((pref: Preference, dark: boolean, animate = true) => {
    setPreference(pref);
    setIsDark(dark);
    if (selectorRef.current) {
      selectorRef.current.style.transition = animate
        ? "left 0.22s cubic-bezier(0.4, 0, 0.2, 1)"
        : "none";
      const left = pref === "light" ? LIGHT_LEFT : pref === "system" ? SYSTEM_LEFT : DARK_LEFT;
      selectorRef.current.style.left = left;
    }
  }, []);

  const applyTheme = useCallback(
    async (next: Preference, clickX: number, clickY: number) => {
      const apply = () => {
        setTheme(next, localStorage);
        updateUI(next, getEffectiveTheme() === "dark");
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
    const initialPref = getTheme(localStorage);
    updateUI(initialPref, getEffectiveTheme() === "dark", false);

    const handler = () => {
      if (getTheme(localStorage) === "system") {
        updateUI("system", getEffectiveTheme() === "dark");
      }
    };

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [updateUI]);

  const handleClick = useCallback(
    (next: Preference) => (e: React.MouseEvent) => {
      // Bail when re-clicking the already-active explicit preference.
      // For "system" we always re-apply: the OS may have flipped since the
      // last click, so the view transition is meaningful even if the pref
      // string is unchanged.
      if (next !== "system" && getTheme(localStorage) === next) return;
      applyTheme(next, e.clientX, e.clientY);
    },
    [applyTheme],
  );

  const lightPressed = preference === "light";
  const systemPressed = preference === "system";
  const darkPressed = preference === "dark";

  return (
    <div {...props} className={className}>
      <div
        className="relative inline-flex items-center rounded-full p-0.5"
        style={{ backgroundColor: "var(--muted)" }}
        role="group"
        aria-label="Theme switcher"
      >
        <div
          ref={selectorRef}
          className="absolute top-0.5 left-0.5 h-[calc(100%-4px)] rounded-full pointer-events-none"
          style={{
            width: SELECTOR_WIDTH,
            backgroundColor: "var(--background)",
            boxShadow: "0 1px 4px 0 rgba(0, 0, 0, 0.18), 0 0.5px 1.5px 0 rgba(0, 0, 0, 0.1)",
            zIndex: 0,
          }}
        />
        <button
          onClick={handleClick("light")}
          aria-label="Light theme"
          aria-pressed={lightPressed}
          className="relative z-10 flex flex-1 items-center justify-center h-9 rounded-full border-none bg-none cursor-pointer transition-colors duration-150"
          style={{
            color: lightPressed ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          <FaSun size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleClick("system")}
          aria-label="System theme"
          aria-pressed={systemPressed}
          className="relative z-10 flex flex-1 items-center justify-center h-9 rounded-full border-none bg-none cursor-pointer transition-colors duration-150"
          style={{
            color: systemPressed ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          <FaDesktop size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleClick("dark")}
          aria-label="Dark theme"
          aria-pressed={darkPressed}
          className="relative z-10 flex flex-1 items-center justify-center h-9 rounded-full border-none bg-none cursor-pointer transition-colors duration-150"
          style={{
            color: darkPressed ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          <FaMoon size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
