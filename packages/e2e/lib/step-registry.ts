/**
 * Step registry for the Playwright + markdown E2E harness.
 *
 * Mirrors the Gauge `step("text with <params>", handler)` API but with a
 * purely in-process implementation. Steps are matched against compiled
 * regexes that escape literal text and turn `<param>` placeholders into
 * non-greedy `(.+?)` capture groups. Quoted substrings (`"..."`) compile
 * to a tighter `"([^"]+)"` capture.
 *
 * Usage from step_implementations:
 *
 *   import { step } from "../lib/step-registry";
 *
 *   step("Wait for <duration> seconds", async (duration) => { ... });
 *   step('The user clicks on "Share tabs…" menu item', async () => { ... });
 *
 * Match semantics:
 *
 *  - Each registration produces an entry with a `literalLength` (the
 *    number of literal characters in the step text after placeholders
 *    are stripped). Matches are sorted by literal length **descending**,
 *    so the most specific step always wins.
 *  - `<param>` captures can be ambiguous only when two registrations
 *    have the same literal length and regex; in that case `matchStep`
 *    returns the lexicographically first text (deterministic) and
 *    `assertNoAmbiguity()` can flag the situation at validation time.
 *  - Captured param values have surrounding `"` quotes stripped so spec
 *    prose like `"<url>"` yields the bare url.
 */

export type StepHandler = (...args: string[]) => Promise<void> | void;

export interface RegisteredStep {
  /** Original text including <params> and quoted strings. */
  text: string;
  /** Compiled matcher, anchored ^...$. */
  regex: RegExp;
  /** Number of capture groups (placeholders + quoted). */
  paramCount: number;
  /** Length of the literal (non-placeholder) portion of the text. */
  literalLength: number;
  handler: StepHandler;
}

const steps = new Map<string, RegisteredStep[]>();

/**
 * Tokenize the step body into alternating literal runs and placeholders
 * (`<param>` or `"quoted"`). Returning a structured token stream keeps
 * the literal-length calculation honest (placeholder regex specials are
 * not counted) and lets us report specific text on match failure.
 */
type Token = { kind: "literal" | "param" | "quoted"; text: string };

function tokenize(body: string): Token[] {
  const tokens: Token[] = [];
  let literal = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "<") {
      const close = body.indexOf(">", i + 1);
      if (close === -1) {
        literal += body.slice(i);
        i = body.length;
        break;
      }
      const name = body.slice(i + 1, close);
      if (literal) {
        tokens.push({ kind: "literal", text: literal });
        literal = "";
      }
      tokens.push({ kind: "param", text: name });
      i = close + 1;
      continue;
    }
    if (ch === '"') {
      const close = body.indexOf('"', i + 1);
      if (close === -1) {
        literal += ch;
        i++;
        continue;
      }
      if (literal) {
        tokens.push({ kind: "literal", text: literal });
        literal = "";
      }
      tokens.push({ kind: "quoted", text: body.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    literal += ch;
    i++;
  }
  if (literal) {
    tokens.push({ kind: "literal", text: literal });
  }
  return tokens;
}

function compilePattern(text: string): {
  regex: RegExp;
  paramCount: number;
  literalLength: number;
} {
  const body = text.trim();
  const tokens = tokenize(body);

  let paramCount = 0;
  let literalLength = 0;
  const parts: string[] = [];
  for (const tok of tokens) {
    if (tok.kind === "literal") {
      parts.push(escapeLiteral(tok.text));
      literalLength += tok.text.length;
    } else if (tok.kind === "param") {
      // Non-greedy + anchor; the surrounding literals force the match.
      parts.push("(.+?)");
      paramCount++;
    } else {
      parts.push(`"([^"]+)"`);
      paramCount++;
    }
  }
  return {
    regex: new RegExp(`^${parts.join("")}$`),
    paramCount,
    literalLength,
  };
}

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Register a step. Same text may be registered multiple times (Gauge
 * allowed this for overloads); each goes onto the text's list and the
 * matcher walks them in literal-length order.
 */
export function step(text: string, handler: StepHandler, options: { tags?: string[] } = {}): void {
  const { regex, paramCount, literalLength } = compilePattern(text);
  const entry: RegisteredStep = {
    text,
    regex,
    paramCount,
    literalLength,
    handler: (...args) => handler(...args),
  };
  const list = steps.get(text) ?? [];
  list.push(entry);
  steps.set(text, list);
  void options;
}

/**
 * Flatten the registry into a list sorted longest-literal-first. This
 * guarantees the most specific step wins, independent of registration
 * order across files (which earlier tripped the `<url>` catch-all
 * matching "select the open tab"-like bodies).
 */
export function sortedSteps(): RegisteredStep[] {
  const all: RegisteredStep[] = [];
  for (const list of steps.values()) {
    for (const entry of list) all.push(entry);
  }
  all.sort((a, b) => {
    if (b.literalLength !== a.literalLength) {
      return b.literalLength - a.literalLength;
    }
    // Tie-break: lexicographic text so behaviour is stable.
    return a.text.localeCompare(b.text);
  });
  return all;
}

export function matchStep(text: string): { entry: RegisteredStep; params: string[] } | null {
  const trimmed = text.trim();
  for (const entry of sortedSteps()) {
    const m = entry.regex.exec(trimmed);
    if (m) {
      // Strip surrounding quotes from any param that came from a "..."
      // placeholder (compile-level only strips when the *registered*
      // step has the placeholder inside literal quotes; this guards
      // against mismatches where the spec author chose <url> instead).
      const params = m.slice(1).map((p) => unquote(p));
      return { entry, params };
    }
  }
  return null;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Static validation: flag registry entries whose runtime inputs could
 * collide — i.e. two entries have the same placeholder shape AND at
 * least one of their literal-or-quoted texts differs. (Two entries with
 * fully identical text legitimately need dedup, but distinct quoted
 * text never collides at runtime because only one matches a given
 * input.)
 */
export function findAmbiguousSteps(): Map<string, RegisteredStep[]> {
  const byShape = new Map<string, RegisteredStep[]>();
  for (const entry of sortedSteps()) {
    // The "shape" of a step is its tokens without per-placeholder text:
    //   `The viewer should show a <X> button` and
    //   `The viewer should show a <Y> button`
    // share shape LITERAL + PARAM + LITERAL and could collide if Y or X
    // differ only in capture value.
    const tokens = tokenize(entry.text.trim());
    const shapeKey = tokens
      .map((t) => t.kind[0]) // l/p/q
      .join("");
    const literalKey = tokens
      .filter((t) => t.kind !== "param")
      .map((t) => t.text)
      .join("|");
    const key = `${shapeKey}::${literalKey}`;
    const list = byShape.get(key) ?? [];
    list.push(entry);
    byShape.set(key, list);
  }
  const out = new Map<string, RegisteredStep[]>();
  for (const [key, list] of byShape) {
    if (list.length > 1) {
      // Confirm: do at least two of these have an identical compiled
      // regex? If yes, the matcher can't distinguish them. If not
      // (different quoted text patterns), they're fine.
      const byRegex = new Map<string, RegisteredStep[]>();
      for (const e of list) {
        const rk = e.regex.source + "|" + e.regex.flags;
        const sl = byRegex.get(rk) ?? [];
        sl.push(e);
        byRegex.set(rk, sl);
      }
      for (const [rk, sl] of byRegex) {
        if (sl.length > 1) out.set(`${key}|${rk}`, sl);
      }
    }
  }
  return out;
}

/** List of every registered step text (debugging + dry-run). */
export function listSteps(): string[] {
  return [...steps.keys()].sort();
}

/** Test-only helper. */
export function _resetRegistry(): void {
  steps.clear();
}
