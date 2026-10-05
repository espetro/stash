import { useState, ChangeEventHandler } from "react";
import { setSettings } from "@/lib/settings";

interface Props {
  initEnabled: boolean;
  onSuccess: () => void;
}

/**
 * Opt-in toggle for the content-script bridge that exposes the local
 * stash library to the configured viewer origin. The sync-storage
 * area is mentioned explicitly so the user understands the setting
 * roams with their browser account, and the data exposure is called
 * out so they don't enable it accidentally.
 */
export default function OptionsLocalLibraryForm({ initEnabled, onSuccess }: Props) {
  const [enabled, setEnabled] = useState<boolean>(initEnabled);

  const handleEnabledChange: ChangeEventHandler<HTMLInputElement> = async (_) => {
    const next = _.target.checked;
    setEnabled(next);
    await setSettings({ localLibraryViewerEnabled: next });
    onSuccess();
  };

  return (
    <>
      <h2 id="local-library-heading" className="settings-section-title">
        Local Library Bridge
      </h2>
      <p className="settings-section-description">
        Allow the configured viewer origin (https://stash.illo.fyi) to read this profile's stash
        library when you open /stashes in that browser.{" "}
        <strong>This setting roams with your browser account</strong> (it's stored in{" "}
        <code>browser.storage.sync</code>). Enabling it lets JavaScript loaded by the configured
        viewer origin read your stash titles, URLs, tags, and notes — fetch-only agents still cannot
        see them.
      </p>
      <div className="form-group">
        <label htmlFor="local-library-enabled-checkbox" className="form-label">
          Expose local stash library to /stashes
        </label>
        <input
          type="checkbox"
          id="local-library-enabled-checkbox"
          checked={enabled}
          onChange={handleEnabledChange}
          className="settings-checkbox"
          aria-label="Expose local stash library to /stashes"
        />
      </div>
    </>
  );
}
