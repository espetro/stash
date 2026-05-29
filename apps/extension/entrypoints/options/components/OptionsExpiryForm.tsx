import { ComponentProps } from "react";
import { ExpiryOption } from "@stash/shared";

interface Props extends ComponentProps<"select"> {
  options: ExpiryOption[];
}

export default function OptionsExpiryForm({ options, ...props }: Props) {
  return (
    <>
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
          {...props}
          id="expiry-select"
          className="settings-select"
          aria-label="Select link expiry duration"
        >
          {options.map((_) => (
            <option key={_.value} value={_.value}>
              {_.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
