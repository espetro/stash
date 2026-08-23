/**
 * Shared content-negotiation contract (W2).
 *
 * Single source of truth for `?format=` + `Accept` negotiation. The
 * viewer's Pages Function and server-core's routes both consume this
 * so the two surfaces can never drift apart.
 */

export type NegotiatedFormat = "json" | "md" | "txt";

/**
 * Aliases accepted for the `?format=` query param. `markdown|plain|text`
 * are already shipped on the viewer surface, so we keep them.
 */
export const FORMAT_ALIASES: Readonly<Record<string, NegotiatedFormat>> = {
  json: "json",
  md: "md",
  markdown: "md",
  txt: "txt",
  plain: "txt",
  text: "txt",
};

/** True when `formatParam` is a known format or its alias. */
export function isValidFormatParam(formatParam: string): boolean {
  return formatParam in FORMAT_ALIASES;
}

function negotiateAccept(accept: string): NegotiatedFormat | null {
  const lower = accept.toLowerCase();
  // Simple contains matching: real Accept headers are comma-separated
  // media ranges, and no two of our three types is a subtype of
  // another, so containment is unambiguous in practice.
  if (lower.includes("application/json")) return "json";
  if (lower.includes("text/markdown")) return "md";
  if (lower.includes("text/plain")) return "txt";
  return null;
}

/**
 * Negotiate the response format.
 *
 * Precedence: an explicit `?format=` param wins over `Accept`.
 * An unknown `formatParam` yields `null` (callers decide whether to
 * 400 via `isValidFormatParam` or fall back to an HTML redirect);
 * absent params fall through to Accept negotiation, then null.
 */
export function negotiateFormat(
  accept: string | null | undefined,
  formatParam: string | null | undefined,
): NegotiatedFormat | null {
  if (formatParam !== null && formatParam !== undefined && formatParam !== "") {
    return FORMAT_ALIASES[formatParam] ?? null;
  }
  if (accept) {
    return negotiateAccept(accept);
  }
  return null;
}

/**
 * Fixture table covering the Accept → format matrix plus format-param
 * precedence. Consumed by the shared tests here and by the parametrized
 * tests in viewer/server-core (later waves).
 */
export const NEGOTIATION_CASES: ReadonlyArray<{
  accept?: string;
  format?: string;
  expected: NegotiatedFormat | null;
}> = [
  { accept: "application/json", expected: "json" },
  { accept: "application/json, text/plain;q=0.9", expected: "json" },
  { accept: "text/markdown", expected: "md" },
  { accept: "text/markdown;q=0.8, application/json;q=0.5", expected: "json" },
  { accept: "text/plain", expected: "txt" },
  { accept: "text/plain;q=0.5, text/markdown;q=0.9", expected: "md" },
  { accept: "text/*, application/json", expected: "json" },
  { accept: "text/html,application/xhtml+xml", expected: null },
  { accept: "*/*", expected: null },
  { accept: "", expected: null },
  { format: "json", expected: "json" },
  { format: "md", expected: "md" },
  { format: "markdown", expected: "md" },
  { format: "txt", expected: "txt" },
  { format: "plain", expected: "txt" },
  { format: "text", expected: "txt" },
  { format: "yaml", expected: null },
  { format: "json", accept: "text/markdown", expected: "json" },
  { format: "md", accept: "application/json", expected: "md" },
  { accept: "text/html", format: "txt", expected: "txt" },
];
