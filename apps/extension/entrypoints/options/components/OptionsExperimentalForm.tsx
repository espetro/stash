import { ComponentProps } from "react";

interface Props extends Omit<ComponentProps<"input">, "type" | "checked"> {
  checked: boolean;
}

export default function OptionsExperimentalForm({ checked, ...props }: Props) {
  return (
    <>
      <h2 id="experimental-heading" className="settings-section-title">
        Experimental
      </h2>
      <p className="settings-section-description">
        Host the stash server inside the extension (browser storage, share links expire)
      </p>
      <div className="form-group">
        <label htmlFor="experimental-checkbox" className="form-label">
          In-extension server
        </label>
        <input
          {...props}
          type="checkbox"
          id="experimental-checkbox"
          checked={checked}
          className="settings-checkbox"
          aria-label="Enable the experimental in-extension stash server"
        />
      </div>
    </>
  );
}
