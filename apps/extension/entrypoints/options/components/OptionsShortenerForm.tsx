import { useState, ChangeEventHandler } from "react";
import { setSettings } from "@/lib/settings";

interface Props {
  initOrigin: string;
  initEnabled: boolean;
  onSuccess: () => void;
}

export default function OptionsShortenerForm({ initOrigin, initEnabled, onSuccess }: Props) {
  const [shortenerOrigin, setShortenerOrigin] = useState<string>(initOrigin);
  const [shortenerOriginError, setShortenerOriginError] = useState<string | null>(null);
  const [shortenerEnabled, setShortenerEnabled] = useState<boolean>(initEnabled);

  const handleShortenerOriginChange: ChangeEventHandler<HTMLInputElement> = (_) => {
    setShortenerOrigin(_.target.value);
    setShortenerOriginError(null);
  };

  const handleShortenerOriginSave = async () => {
    const trimmedOrigin = shortenerOrigin.trim();
    if (trimmedOrigin === "") {
      return;
    }

    const result = await setSettings({ shortenerOrigin: trimmedOrigin });

    if (result.success) {
      setShortenerOriginError(null);
      return onSuccess();
    }

    return setShortenerOriginError(result.error ?? "Invalid URL");
  };

  const handleShortenerEnabledChange: ChangeEventHandler<HTMLInputElement> = async (_) => {
    const enabled = _.target.checked;
    setShortenerEnabled(enabled);
    await setSettings({ shortenerEnabled: enabled });
    onSuccess();
  };

  return (
    <>
      <h2 id="shortener-heading" className="settings-section-title">
        Short Link Sharing
      </h2>
      <p className="settings-section-description">
        Optionally publish a frozen snapshot to a shortener for a short link, instead of the default
        self-contained URL. Falls back to the default URL if the shortener is unavailable.
      </p>
      <div className="form-group">
        <label htmlFor="shortener-enabled-checkbox" className="form-label">
          Enable short link sharing
        </label>
        <input
          type="checkbox"
          id="shortener-enabled-checkbox"
          checked={shortenerEnabled}
          onChange={handleShortenerEnabledChange}
          className="settings-checkbox"
          aria-label="Enable short link sharing"
        />
      </div>
      <div className="form-group">
        <label htmlFor="shortener-origin-input" className="form-label">
          Shortener URL
        </label>
        <div className="viewer-origin-row">
          <input
            id="shortener-origin-input"
            type="url"
            className={`settings-input${shortenerOriginError ? " settings-input--error" : ""}`}
            value={shortenerOrigin}
            onChange={handleShortenerOriginChange}
            placeholder="https://shortener.example.com"
            aria-label="Shortener server URL"
            aria-describedby={shortenerOriginError ? "shortener-origin-error" : undefined}
            aria-invalid={shortenerOriginError ? "true" : undefined}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleShortenerOriginSave}
            disabled={shortenerOrigin.trim() === "" || shortenerOriginError !== null}
          >
            Save
          </button>
        </div>
        {shortenerOriginError && (
          <p id="shortener-origin-error" className="settings-error" role="alert">
            {shortenerOriginError}
          </p>
        )}
      </div>
    </>
  );
}
