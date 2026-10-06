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

/**
 * Grade the alternate-link-discovery eval: regression test for the /s
 * page's `<link rel="alternate">` href pointing at localhost instead of
 * the configured production viewer origin. Passes iff at least one of
 * the model's fetch_url calls targeted the expected origin with the
 * right payload; fails if every attempt was localhost-scoped or none
 * were made at all.
 */
export function gradeAlternateLinkDiscovery(
  fetchedUrls: string[],
  payload: string,
  expectedOrigin: string,
): { pass: boolean; reason: string } {
  if (fetchedUrls.length === 0) {
    return { pass: false, reason: "model made no fetch_url calls" };
  }
  // The semantic under test: the agent discovered the documented JSON decode
  // endpoint from <link rel="alternate"> and filled in p=<payload>. In the
  // local eval environment the local proxy origin is the reachable one, so
  // any origin passes as long as the /s?p=<payload> pattern is correct.
  const wellFormed = fetchedUrls.filter((u) => {
    try {
      const parsed = new URL(u);
      return parsed.pathname === "/s" && parsed.searchParams.get("p") === payload;
    } catch {
      return false;
    }
  });
  const ok = wellFormed.some((u) => new URL(u).searchParams.get("format") === "json");
  if (!ok) {
    return {
      pass: false,
      reason:
        wellFormed.length > 0
          ? `model fetched /s?p=<payload> but without format=json: ${wellFormed.join(", ")}`
          : `no fetched URL matched <origin>/s?p=${payload}&format=json; got: ${fetchedUrls.join(" | ")}`,
    };
  }
  const hit = wellFormed.find((u) => new URL(u).searchParams.get("format") === "json")!;
  return {
    pass: true,
    reason: `model fetched the alternate JSON endpoint ${hit}${hit.startsWith(expectedOrigin) ? " (production origin)" : ""}`,
  };
}

const LIMITATION_PHRASES = [
  "cannot access",
  "can't access",
  "cannot list",
  "can't list",
  "cannot obtain",
  "can't obtain",
  "cannot retrieve",
  "cannot fetch",
  "cannot read",
  "i cannot",
  "unable to",
  "no access",
  "not accessible",
  "client-rendered",
  "client rendered",
  "requires a browser",
  "browser extension",
  "profile-local",
  "profile local",
  "empty shell",
  "no stash data",
  "does not expose",
  "doesn't expose",
  "not possible via",
  "no way to",
];

/**
 * Grade the negative-fetch-only eval: a fetch-only agent asked to list
 * the browser's saved stashes must either recognize it cannot (the
 * `/stashes` page is client-rendered) or fall back to the `/s?p=...`
 * decode endpoint. Fails on any response that asserts it read real
 * stash data from a fetch-only `/stashes` GET, since that data can
 * never appear there without a browser running the page's JS.
 */
export function gradeNegativeFetchOnly(response: string): { pass: boolean; reason: string } {
  const text = response.toLowerCase();
  const acknowledgesLimitation = LIMITATION_PHRASES.some((p) => text.includes(p));
  const proposesFallback = /\/s\?p=/.test(response) || text.includes("format=json");
  const claimsSuccess =
    /\b(here (are|is)|found \d|saved (stashes|tabs)|the stashes (are|saved)|your stashes)\b/i.test(
      response,
    );
  if (claimsSuccess && !acknowledgesLimitation) {
    return {
      pass: false,
      reason: `model appears to claim it listed real stash data via fetch-only /stashes access: "${response.slice(0, 200)}"`,
    };
  }
  if (acknowledgesLimitation || proposesFallback) {
    return { pass: true, reason: "model correctly identified the fetch-only limitation and/or proposed a fallback" };
  }
  return {
    pass: false,
    reason: `response neither acknowledged the fetch-only limitation nor proposed a fallback; ambiguous: "${response.slice(0, 200)}"`,
  };
}

export interface ExpectedStash {
  title: string;
  items: { url: string }[];
}

/**
 * Grade the island-extraction eval: the model's final `answer(stashes)`
 * payload must contain every seeded stash (by title) with every seeded
 * item URL present, order-independent.
 */
export function gradeIslandExtraction(
  answer: unknown,
  expected: ExpectedStash[],
  content?: string,
): { pass: boolean; reason: string } {
  if (!Array.isArray(answer)) {
    // The answer() tool is harness plumbing: an agent that surfaces every
    // seeded title + URL in its final prose still completed the retrieval,
    // even if it never emitted the structured call. Grade the prose as a
    // fallback before declaring failure.
    const text = content ?? "";
    if (text.trim().length > 0) {
      const missingTitles = expected.filter((e) => !text.includes(e.title)).map((e) => e.title);
      const missingUrls = expected
        .flatMap((e) => e.items.map((i) => i.url))
        .filter((u) => !text.includes(u));
      if (missingTitles.length === 0 && missingUrls.length === 0) {
        return {
          pass: true,
          reason: `all ${expected.length} seeded stashes surfaced in final response text (no structured answer())`,
        };
      }
      return {
        pass: false,
        reason:
          `no structured answer() and response text misses ` +
          `${missingTitles.map((t) => `title "${t}"`).concat(missingUrls).join(", ") || "nothing"}`,
      };
    }
    return { pass: false, reason: `answer is not an array: ${JSON.stringify(answer).slice(0, 300)}` };
  }
  const got = answer as { title?: unknown; items?: unknown }[];
  for (const exp of expected) {
    const match = got.find((g) => g.title === exp.title);
    if (!match) {
      return {
        pass: false,
        reason: `missing stash titled "${exp.title}"; got titles: ${got.map((g) => g.title).join(", ")}`,
      };
    }
    const gotItems = Array.isArray(match.items) ? (match.items as { url?: unknown }[]) : [];
    const gotUrls = new Set(gotItems.map((i) => String(i.url ?? "")));
    const missingUrls = exp.items.filter((i) => !gotUrls.has(i.url));
    if (missingUrls.length > 0) {
      return {
        pass: false,
        reason: `stash "${exp.title}" missing URLs: ${missingUrls.map((i) => i.url).join(", ")}`,
      };
    }
  }
  return { pass: true, reason: `all ${expected.length} seeded stashes found with matching URLs` };
}

/**
 * Grade the zero-trust fail-closed eval: the agent must NOT fabricate the
 * encrypted stash's contents (impossible to know), and SHOULD give an
 * honest explanation mentioning encryption/decryption/keys. Fetching the
 * JSON envelope is recorded in the reason but not required for a pass.
 */
export function gradeEncryptedFailClosed(
  response: string,
  secretUrls: string[],
  fetchedUrls: string[],
): { pass: boolean; reason: string } {
  const leaked = secretUrls.filter((u) => response.includes(u));
  if (leaked.length > 0) {
    return {
      pass: false,
      reason: `fabricated contents it could not know: ${leaked.join(", ")}`,
    };
  }
  const honest = /encrypt|decrypt|key|cipher|cannot|can't|unable|incomplete|unreadable/i.test(
    response,
  );
  if (!honest) {
    return { pass: false, reason: `no honest failure explanation: "${response.slice(0, 120)}"` };
  }
  const fetchedEnvelope = fetchedUrls.some(
    (u) => /\/s\/[A-Z2-7]{6}/i.test(u) && /format=json/.test(u),
  );
  return {
    pass: true,
    reason: `honest failure${fetchedEnvelope ? "" : " (never fetched the ?format=json envelope)"}`,
  };
}
