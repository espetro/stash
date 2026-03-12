import React, { useState, useEffect } from "react";
import { getSettings, setSettings } from "../../lib/settings.js";
import { invalidateSettingsCache } from "../../lib/settings-cache.js";
import { getTheme, setTheme } from "@tab-mail/theme";

type ExpiryMode = "24h" | "7d" | "30d" | "never";
type Theme = "light" | "dark" | "system";

const EXPIRY_OPTIONS: { value: ExpiryMode; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function App() {
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("24h");
  const [theme, setThemeState] = useState<Theme>("system");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const settings = getSettings();
    setExpiryMode(settings.expiryMode);
    setThemeState(getTheme());
  }, []);

  const handleExpiryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as ExpiryMode;
    setExpiryMode(newMode);
    setSettings({ expiryMode: newMode });
    invalidateSettingsCache();
    showSuccessFeedback();
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTheme = e.target.value as Theme;
    setThemeState(newTheme);
    setTheme(newTheme);
    showSuccessFeedback();
  };

  const showSuccessFeedback = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h1>TabShare Settings</h1>
        {showSuccess && (
          <div
            className="settings-success"
            role="status"
            aria-live="polite"
          >
            Settings saved!
          </div>
        )}
      </header>

      <section className="settings-section" aria-labelledby="expiry-heading">
        <h2 id="expiry-heading" className="settings-section-title">
          Link Expiry
        </h2>
        <p className="settings-section-description">
          Shared links will expire after the selected duration.
        </p>
        <div className="form-group">
          <label htmlFor="expiry-select" className="form-label">
            Expiry time
          </label>
          <select
            id="expiry-select"
            className="settings-select"
            value={expiryMode}
            onChange={handleExpiryChange}
            aria-label="Select link expiry duration"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="settings-section-title">
          Appearance
        </h2>
        <p className="settings-section-description">
          Choose how TabShare looks on your device.
        </p>
        <div className="form-group" role="radiogroup" aria-labelledby="theme-heading">
          <span className="form-label">Theme</span>
          <div className="theme-options">
            {THEME_OPTIONS.map((option) => (
              <label key={option.value} className="theme-option">
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={handleThemeChange}
                  aria-label={`${option.label} theme`}
                />
                <span className="theme-option-label">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
