/**
 * Reusable Card component with composable sub-components.
 *
 * Pattern (shadcn/ui style):
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>...</CardTitle>
 *       <CardDescription>...</CardDescription>
 *     </CardHeader>
 *     <CardContent>...</CardContent>
 *     <CardFooter>...</CardFooter>
 *   </Card>
 *
 * Uses the extension's existing CSS variables for theming.
 */

import * as React from "react";

/* ------------------------------------------------------------------ */
/* Card Root                                                          */
/* ------------------------------------------------------------------ */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, style, children, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        background: "var(--card)",
        color: "var(--card-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  ),
);

Card.displayName = "Card";

/* ------------------------------------------------------------------ */
/* Card Header                                                        */
/* ------------------------------------------------------------------ */

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, style, children, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "24px",
        paddingBottom: "0",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  ),
);

CardHeader.displayName = "CardHeader";

/* ------------------------------------------------------------------ */
/* Card Title                                                         */
/* ------------------------------------------------------------------ */

export interface CardTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, style, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={className}
      style={{
        fontSize: "1.125rem",
        fontWeight: 600,
        lineHeight: 1.3,
        margin: 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </h3>
  ),
);

CardTitle.displayName = "CardTitle";

/* ------------------------------------------------------------------ */
/* Card Description                                                   */
/* ------------------------------------------------------------------ */

export interface CardDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, style, children, ...props }, ref) => (
  <p
    ref={ref}
    className={className}
    style={{
      fontSize: "0.875rem",
      color: "var(--muted-foreground)",
      lineHeight: 1.5,
      margin: 0,
      ...style,
    }}
    {...props}
  >
    {children}
  </p>
));

CardDescription.displayName = "CardDescription";

/* ------------------------------------------------------------------ */
/* Card Content                                                       */
/* ------------------------------------------------------------------ */

export interface CardContentProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, style, children, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        padding: "24px",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  ),
);

CardContent.displayName = "CardContent";

/* ------------------------------------------------------------------ */
/* Card Footer                                                        */
/* ------------------------------------------------------------------ */

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, style, children, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "24px",
        paddingTop: "0",
        gap: "8px",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  ),
);

CardFooter.displayName = "CardFooter";
