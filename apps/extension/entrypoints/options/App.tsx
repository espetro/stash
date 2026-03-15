import React, { useState, useEffect } from "react";
import { getSettings, setSettings } from "../../lib/settings.js";
import { getTheme, setTheme } from "@stash/theme";
import { browserStorageAdapter } from "../../lib/browser-storage-adapter.js";

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
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("never");
  const [theme, setThemeState] = useState<Theme>("system");
  const [viewerOrigin, setViewerOrigin] = useState<string>("");
  const [viewerOriginError, setViewerOriginError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        setExpiryMode(settings.expiryMode);
        setViewerOrigin(settings.viewerOrigin);
        setThemeState(getTheme(browserStorageAdapter));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleExpiryChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as ExpiryMode;
    setExpiryMode(newMode);
    await setSettings({ expiryMode: newMode });
    showSuccessFeedback();
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTheme = e.target.value as Theme;
    setThemeState(newTheme);
    setTheme(newTheme, browserStorageAdapter);
    showSuccessFeedback();
  };

  const handleViewerOriginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setViewerOrigin(e.target.value);
    setViewerOriginError(null);
  };

  const handleViewerOriginSave = async () => {
    const trimmedOrigin = viewerOrigin.trim();
    if (trimmedOrigin === "") return;
    const result = await setSettings({ viewerOrigin: trimmedOrigin });
    if (result.success) {
      setViewerOriginError(null);
      showSuccessFeedback();
    } else {
      setViewerOriginError(result.error ?? "Invalid URL");
    }
  };

  const showSuccessFeedback = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h1>Stash Settings</h1>
        {showSuccess && (
          <div className="settings-success" role="status" aria-live="polite">
            Settings saved!
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="settings-loading" role="status" aria-live="polite">
          Loading settings...
        </div>
      ) : (
        <>
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
            <p className="settings-section-description">Choose how Stash looks on your device.</p>
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

          <section className="settings-section" aria-labelledby="viewer-heading">
            <h2 id="viewer-heading" className="settings-section-title">
              Viewer Server
            </h2>
            <p className="settings-section-description">
              The URL of the server that renders shared tabs. Change this if the default server is
              down or you want to use your own.
            </p>
            <div className="form-group">
              <label htmlFor="viewer-origin-input" className="form-label">
                Viewer URL
              </label>
                <div className="viewer-origin-row">
                  <input
                    id="viewer-origin-input"
                    type="url"
                    className={`settings-input${viewerOriginError ? " settings-input--error" : ""}`}
                    value={viewerOrigin}
                    onChange={handleViewerOriginChange}
                    placeholder="https://viewer.example.com"
                    aria-label="Viewer server URL"
                    aria-describedby={viewerOriginError ? "viewer-origin-error" : undefined}
                    aria-invalid={viewerOriginError ? "true" : undefined}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleViewerOriginSave}
                    disabled={viewerOrigin.trim() === "" || viewerOriginError !== null}
                  >
                    Save
                  </button>
                </div>
                {viewerOriginError && (
                  <p id="viewer-origin-error" className="settings-error" role="alert">
                    {viewerOriginError}
                  </p>
                )}
              </div>
          </section>
        </>
      )}
    </div>
  );
}
