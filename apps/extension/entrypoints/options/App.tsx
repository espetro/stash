import { useState, useEffect, ChangeEventHandler } from "react";
import { getSettings, setSettings } from "@/lib/settings.js";
import { getTheme, setTheme } from "@stash/theme";
import { browserStorageAdapter } from "@/lib/browser-storage-adapter.js";
import { EXPIRY_OPTIONS } from "@stash/shared";
import OptionsFooter from "./components/OptionsFooter.js";
import OptionsExpiryForm from "./components/OptionsExpiryForm.js";
import OptionsThemeForm from "./components/OptionsThemeForm.js";
import OptionsViewerForm from "./components/OptionsViewerForm.js";

type ExpiryMode = "24h" | "7d" | "30d" | "never";
type Theme = "light" | "dark" | "system";

/** Options app */
export default function App() {
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("never");
  const [theme, setThemeState] = useState<Theme>("system");
  const [viewerOrigin, setViewerOrigin] = useState<string>("");
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

  const handleExpiryChange: ChangeEventHandler<HTMLSelectElement> = async (_) => {
    const newMode = _.target.value as ExpiryMode;
    setExpiryMode(newMode);
    await setSettings({ expiryMode: newMode });
    showSuccessFeedback();
  };

  const handleThemeChange = (newTheme: Theme) => {
    setThemeState(newTheme);
    setTheme(newTheme, browserStorageAdapter);
    showSuccessFeedback();
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
            <OptionsExpiryForm
              value={expiryMode}
              onChange={handleExpiryChange}
              options={EXPIRY_OPTIONS}
            />
          </section>

          <section className="settings-section" aria-labelledby="theme-heading">
            <OptionsThemeForm value={theme} onChange={handleThemeChange} />
          </section>

          <section className="settings-section" aria-labelledby="viewer-heading">
            <OptionsViewerForm init={viewerOrigin} onSuccess={() => showSuccessFeedback()} />
          </section>

          <OptionsFooter />
        </>
      )}
    </div>
  );
}
