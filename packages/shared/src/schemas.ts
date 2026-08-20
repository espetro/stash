import * as v from "valibot";

/**
 * Shared validation schemas (valibot, ~1KB).
 * Used by the extension settings and the /s/new creation form.
 */

export const viewerOriginSchema = v.pipe(
  v.string(),
  v.url("Please enter a valid URL (e.g. https://viewer.example.com)"),
  v.check(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://",
  ),
);

export const expiryModeSchema = v.picklist(["24h", "7d", "30d", "never"]);

/** A single line of the /s/new textarea: a URL, optionally "URL | Title" */
export const stashLineSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Line is empty"),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const line = dataset.value;
    const pipeIdx = line.indexOf("|");
    const url = (pipeIdx > 0 ? line.slice(0, pipeIdx) : line).trim();
    try {
      new URL(url);
    } catch {
      addIssue({ message: `"${url.slice(0, 40)}" is not a valid URL` });
    }
  }),
);

export interface ParsedStashLine {
  url: string;
  title: string;
}

/** Parse a "URL | Title" line; title falls back to the hostname. */
export function parseStashLine(line: string): ParsedStashLine {
  const trimmed = line.trim();
  const pipeIdx = trimmed.indexOf("|");
  if (pipeIdx > 0) {
    const url = trimmed.slice(0, pipeIdx).trim();
    const title = trimmed.slice(pipeIdx + 1).trim();
    if (title) return { url, title };
  }
  try {
    return { url: trimmed, title: new URL(trimmed).hostname };
  } catch {
    return { url: trimmed, title: trimmed.slice(0, 30) };
  }
}

export function validateViewerOrigin(value: string): { success: boolean; error?: string } {
  const result = v.safeParse(viewerOriginSchema, value);
  if (result.success) return { success: true };
  return {
    success: false,
    error: result.issues[0]?.message ?? "Invalid URL",
  };
}

export function validateExpiryMode(value: string): { success: boolean; error?: string } {
  const result = v.safeParse(expiryModeSchema, value);
  if (result.success) return { success: true };
  return { success: false, error: "Invalid expiry mode" };
}

export interface LineValidation {
  line: number;
  ok: boolean;
  error?: string;
}

/** Validate each textarea line; returns per-line results for inline markers. */
export function validateStashLines(input: string): LineValidation[] {
  return input
    .split("\n")
    .map((raw, i) => {
      const trimmed = raw.trim();
      if (trimmed.length === 0) return { line: i, ok: true };
      const result = v.safeParse(stashLineSchema, raw);
      return result.success
        ? { line: i, ok: true }
        : { line: i, ok: false, error: result.issues[0]?.message ?? "Invalid line" };
    });
}
