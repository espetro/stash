/** Deterministic graders. Pure functions, no network, no LLM judging. */

const NUMBER_WORDS: Record<number, string[]> = {
  1: ["one", "a", "an", "1"],
  2: ["two", "2"],
  3: ["three", "3"],
  4: ["four", "4"],
  5: ["five", "5"],
  6: ["six", "6"],
  7: ["seven", "7"],
  8: ["eight", "8"],
  9: ["nine", "9"],
  10: ["ten", "10"],
};

function numberWords(n: number): string[] {
  return NUMBER_WORDS[n] ?? [String(n)];
}

/** Extract the hostnames of a set of URLs, lowercased. */
export function domainsOf(urls: string[]): string[] {
  return urls.map((u) => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  });
}

export interface ComprehensionAnswer {
  count: number;
  domains: string[];
}

/**
 * Grade eval 1: model must state the number of links and the domains.
 * Tolerant to prose around the numbers, ordering, and "www." prefixes.
 */
export function gradeComprehension(
  response: string,
  expected: ComprehensionAnswer,
): { pass: boolean; reason: string } {
  const text = response.toLowerCase();
  const domainSet = new Set(expected.domains.map((d) => d.replace(/^www\./, "")));
  const missing = [...domainSet].filter((d) => !text.includes(d));
  if (missing.length > 0) {
    return { pass: false, reason: `missing domains: ${missing.join(", ")}` };
  }
  // Count check: the answer must state the link count (digits or small
  // number words) followed by links/tabs/urls/items; no other count.
  const countMentions = [...text.matchAll(/([\w-]+)\s+(?:links?|tabs?|urls?|items?)/g)].map(
    (m) => m[1],
  );
  if (countMentions.length === 0) {
    return { pass: false, reason: `no "<n> links" statement found` };
  }
  const okCounts = numberWords(expected.count);
  const wrong = countMentions.filter((t) => {
    if (/^\d+$/.test(t)) return Number(t) !== expected.count;
    return !okCounts.includes(t);
  });
  if (wrong.length > 0) {
    return { pass: false, reason: `wrong counts stated: ${wrong.join(", ")}` };
  }
  return { pass: true, reason: `ok: ${expected.count} links, domains ${[...domainSet].join(", ")}` };
}

/**
 * Grade eval 2: the model must return a JSON endpoint URL for the stash.
 * Accepted forms: `/s?p=...&format=json` (any param order) or a bare
 * `/s?p=...` intended for Accept: application/json negotiation.
 */
export function gradeFormatDiscovery(
  response: string,
  payload: string,
  origin: string,
): { pass: boolean; reason: string } {
  const wants = [`p=${payload}`];
  const hit = wants.some((w) => response.includes(w));
  if (!hit) return { pass: false, reason: `response does not contain the payload p=${payload}` };
  const urlMatches = [...response.matchAll(/https?:\/\/[^\s"'`)]+|\/s\?[^\s"'`)]+/g)].map((m) => m[0]);
  const ok = urlMatches.some((candidate) => {
    if (!candidate.includes(`p=${payload}`)) return false;
    if (!/\/s(\?|$)/.test(candidate.replace(origin, ""))) return false;
    if (/[?&]format=json\b/.test(candidate)) return true;
    // Accept-negotiation variant: bare /s?p=...
    return /\/s\?p=[^&\s]+$/i.test(candidate) || /\/s\?p=[^&\s]*(?:&|$)/.test(candidate);
  });
  return ok
    ? { pass: true, reason: "valid JSON endpoint URL produced" }
    : { pass: false, reason: `no /s?p=...&format=json or /s?p=... URL found; got: ${urlMatches.join(" | ") || "(none)"}` };
}

/** Grade eval 3: the model must report the same links as the ground truth. */
export function gradeShortLinkRead(
  response: string,
  expectedUrls: string[],
): { pass: boolean; reason: string } {
  const missing = expectedUrls.filter((u) => !response.includes(u));
  if (missing.length > 0) {
    return { pass: false, reason: `missing URLs: ${missing.join(", ")}` };
  }
  return { pass: true, reason: `all ${expectedUrls.length} URLs reported` };
}
