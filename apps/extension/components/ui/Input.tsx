/**
 * Reusable Input component that wraps a native <input>.
 *
 * Uses the extension's existing CSS variables for consistent theming.
 * Consumers can still pass any native input attribute (type, placeholder,
 * onChange, etc.).
 */

import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, style, ...props }, ref) => (
    <input
      ref={ref}
      className={className}
      style={{
        width: "100%",
        padding: "8px 12px",
        fontSize: "0.875rem",
        color: "var(--foreground)",
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxSizing: "border-box",
        fontFamily: "var(--font-sans)",
        outline: "none",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow =
          "0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
      {...props}
    />
  ),
);

Input.displayName = "Input";
