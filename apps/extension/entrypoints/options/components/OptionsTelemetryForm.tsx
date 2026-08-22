import { useState, ChangeEventHandler } from "react";
import { setSettings } from "@/lib/settings";

interface Props {
  initEnabled: boolean;
  onSuccess: () => void;
}

export default function OptionsTelemetryForm({ initEnabled, onSuccess }: Props) {
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(initEnabled);

  const handleTelemetryEnabledChange: ChangeEventHandler<HTMLInputElement> = async (_) => {
    const enabled = _.target.checked;
    setTelemetryEnabled(enabled);
    await setSettings({ telemetryEnabled: enabled });
    onSuccess();
  };

  return (
    <>
      <h2 id="telemetry-heading" className="settings-section-title">
        Usage Analytics
      </h2>
      <p className="settings-section-description">
        Sends anonymous aggregate counters (e.g. "popup opened") to help us understand feature
        usage. No tab URLs, titles, tags, notes, or identifiers are ever collected.
      </p>
      <div className="form-group">
        <label htmlFor="telemetry-enabled-checkbox" className="form-label">
          Share anonymous usage analytics
        </label>
        <input
          type="checkbox"
          id="telemetry-enabled-checkbox"
          checked={telemetryEnabled}
          onChange={handleTelemetryEnabledChange}
          className="settings-checkbox"
          aria-label="Share anonymous usage analytics"
        />
      </div>
    </>
  );
}
