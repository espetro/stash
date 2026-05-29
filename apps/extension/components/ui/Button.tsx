/**
 * Reusable Button component that maps to the extension's existing CSS classes.
 *
 * Variants:
 * - primary   → .btn.btn-primary
 * - secondary → .btn.btn-secondary
 * - ghost     → transparent background, minimal styling
 * - destructive → .btn with destructive colors
 *
 * Composable pattern: accepts children, spreads extra props to the
 * underlying <button> element.
 */

import * as React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Build the full CSS className for a button based on its variant and size.
 *
 * We intentionally keep this as a plain string so it works with the
 * extension's existing CSS (no Tailwind required).
 */
function buildButtonClass(
  variant: ButtonVariant,
  size: ButtonSize,
  extraClassName?: string,
): string {
  const classes: string[] = ["btn"];

  switch (variant) {
    case "primary":
      classes.push("btn-primary");
      break;
    case "secondary":
      classes.push("btn-secondary");
      break;
    case "ghost":
      // Ghost uses no extra background class; consumers can style via
      // inline styles or additional CSS.
      break;
    case "destructive":
      // Destructive is not yet defined in the existing CSS, so we rely
      // on inline styles for the destructive look while keeping the
      // base .btn structure.
      break;
  }

  switch (size) {
    case "sm":
      classes.push("btn-sm");
      break;
    case "lg":
      classes.push("btn-lg");
      break;
    case "icon":
      classes.push("btn-icon");
      break;
    default:
      break;
  }

  if (extraClassName) {
    classes.push(extraClassName);
  }

  return classes.join(" ");
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "default",
      className,
      children,
      disabled,
      style,
      ...props
    },
    ref,
  ) => {
    const isDestructive = variant === "destructive";

    const mergedStyle: React.CSSProperties = {
      ...(isDestructive
        ? { background: "var(--destructive)", color: "var(--destructive-foreground)" }
        : {}),
      ...style,
    };

    return (
      <button
        ref={ref}
        className={buildButtonClass(variant, size, className)}
        disabled={disabled}
        style={mergedStyle}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
