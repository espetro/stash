import { useState, ChangeEventHandler } from "react";
import { setSettings } from "@/lib/settings";

interface Props {
  init: string;
  onSuccess: () => void;
}

export default function OptionsViewerForm({ init, onSuccess }: Props) {
  const [viewerOrigin, setViewerOrigin] = useState<string>(init);
  const [viewerOriginError, setViewerOriginError] = useState<string | null>(null);

  const handleViewerOriginChange: ChangeEventHandler<HTMLInputElement> = (_) => {
    setViewerOrigin(_.target.value);
    setViewerOriginError(null);
  };

  const handleViewerOriginSave = async () => {
    const trimmedOrigin = viewerOrigin.trim();
    if (trimmedOrigin === "") {
      return;
    }

    const result = await setSettings({ viewerOrigin: trimmedOrigin });

    if (result.success) {
      setViewerOriginError(null);
      return onSuccess();
    }

    return setViewerOriginError(result.error ?? "Invalid URL");
  };

  return (
    <>
      <h2 id="viewer-heading" className="settings-section-title">
        Viewer Server
      </h2>
      <p className="settings-section-description">
        The URL of the server that renders shared tabs. Change this if the default server is down or
        you want to use your own.
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
    </>
  );
}
