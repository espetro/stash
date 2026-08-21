import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import { decodeShareUrl, extractPayloadFromUrl } from "../helpers/decoder-helper";
import { isValidBase64url } from "../helpers/encoder-helper";

/**
 * The clipboard in headless Chromium is awkward to read. The harness
 * stores clipboard content on the active state and the encoder step
 * writes the share link there. Tests then read the "clipboard" through
 * the state, mirroring the prior gauge implementation.
 */

function getClipboard(): string {
  const state = getActiveState();
  return state.clipboard ?? state.shareLink ?? "";
}

step("Read clipboard content", async () => {
  const clipboardContent = getClipboard();
  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }
  getActiveState().clipboard = clipboardContent;
});

step("Verify URL format and structure", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  if (!clipboardContent.startsWith("http://localhost:4321/s/#p=")) {
    throw new Error("URL does not start with expected prefix");
  }

  if (!clipboardContent.includes("#p=")) {
    throw new Error("URL does not contain fragment parameter");
  }
});

step("Decode URL fragment", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  try {
    const payload = await decodeShareUrl(clipboardContent);
    getActiveState().decodedPayload = payload;
  } catch (e) {
    throw new Error(`Failed to decode URL fragment: ${e}`);
  }
});

step("Store decoded payload for assertions", async () => {
  if (!getActiveState().decodedPayload) {
    throw new Error("No decoded payload available");
  }
});

step("Verify base64url encoding validity", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  const match = clipboardContent.match(/#p=([A-Za-z0-9_-]+)$/);
  if (!match) {
    throw new Error("Invalid URL format");
  }

  const payload = match[1];

  if (!isValidBase64url(payload)) {
    throw new Error("Invalid base64url encoding");
  }
});

step("The clipboard content should be a valid URL", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  try {
    new URL(clipboardContent);
  } catch (e) {
    throw new Error("Clipboard content is not a valid URL");
  }
});

step("The clipboard content should contain only base64url characters <chars>", async (chars) => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  const match = clipboardContent.match(/#p=([A-Za-z0-9_-]+)$/);
  if (!match) {
    throw new Error("Invalid URL format");
  }

  const payload = match[1];
  const validChars = new Set(chars.split(""));

  for (const char of payload) {
    if (!validChars.has(char)) {
      throw new Error(`Invalid character "${char}" in base64url encoding`);
    }
  }
});

step("The clipboard content should not contain padding characters <padding>", async (padding) => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  if (clipboardContent.includes(padding)) {
    throw new Error(`Clipboard content should not contain "${padding}"`);
  }
});

step('The decoded payload should have version "v": <version>', async (versionStr) => {
  const version = parseInt(versionStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { version?: number } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  if (decodedPayload.version !== version) {
    throw new Error(`Expected version ${version}, but got ${decodedPayload.version}`);
  }
});

step("The decoded payload version should be <version>", async (versionStr) => {
  const version = parseInt(versionStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { version?: number } | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  if (decodedPayload.version !== version) {
    throw new Error(`Expected version ${version}, got ${decodedPayload.version}`);
  }
});

step("The decoded payload expiry should be in the future", async () => {
  const decodedPayload = getActiveState().decodedPayload as { expiry?: number } | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  const now = Math.floor(Date.now() / 1000);
  if (decodedPayload.expiry !== undefined && decodedPayload.expiry < now) {
    throw new Error(`Expiry ${decodedPayload.expiry} is in the past (now ${now})`);
  }
});

step("The decoded payload should have <n> item", async (countStr) => {
  const n = parseInt(countStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { items: unknown[] } | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  if (decodedPayload.items.length !== n) {
    throw new Error(`Expected ${n} item(s), got ${decodedPayload.items.length}`);
  }
});

step("The decoded payload should have <n> items", async (countStr) => {
  const n = parseInt(countStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { items: unknown[] } | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  if (decodedPayload.items.length !== n) {
    throw new Error(`Expected ${n} items, got ${decodedPayload.items.length}`);
  }
});

step("The decoded payload item count should be less than <n>", async (countStr) => {
  const max = parseInt(countStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { items: unknown[] } | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  if (decodedPayload.items.length >= max) {
    throw new Error(`Expected < ${max} items, got ${decodedPayload.items.length}`);
  }
});

step("The decoded title should be <max> characters or less", async (maxStr) => {
  const max = parseInt(maxStr, 10);
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  for (const [, title] of decodedPayload.items) {
    if (title.length > max) {
      throw new Error(`Title "${title}" exceeds ${max} chars`);
    }
  }
});

step("The decoded item URL should be <url>", async (url) => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;
  if (!decodedPayload) throw new Error("No decoded payload available");
  // Canonicalize both sides — Chromium appends a slash to host-only
  // URLs after navigation, so `https://github.com` shows up as
  // `https://github.com/` in the encoded payload.
  const canonical = (s: string) => {
    try {
      const u = new URL(s);
      if (u.pathname === "/" && !u.search && !u.hash) u.pathname = "";
      return u.toString();
    } catch {
      return s;
    }
  };
  const wanted = canonical(url);
  const found = decodedPayload.items.some(([u]) => canonical(u) === wanted);
  if (!found) throw new Error(`URL "${url}" not found in decoded items`);
});

step("The encoded fragment should match base64url pattern", async () => {
  const state = getActiveState();
  const url = state.shareLink ?? state.clipboard;
  if (!url) throw new Error("No share URL");
  const match = url.match(/#p=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("URL has no #p= fragment");
  const fragment = match[1];
  if (!/^[A-Za-z0-9_-]+$/.test(fragment)) {
    throw new Error(`Fragment "${fragment}" is not base64url`);
  }
});

step("The share link should contain encoded data", async () => {
  const state = getActiveState();
  if (!state.shareLink || !state.shareLink.includes("#p=")) {
    throw new Error("No #p= fragment on share link");
  }
});

step("The share link should contain the fragment parameter <param>", async (param) => {
  const state = getActiveState();
  const url = state.shareLink ?? state.clipboard;
  if (!url || !url.includes(param)) {
    throw new Error(`Share link should contain "${param}"`);
  }
});

step("The link should be marked as valid base64url", async () => {
  const state = getActiveState();
  const url = state.shareLink ?? state.clipboard;
  if (!url) throw new Error("No share link");
  const match = url.match(/#p=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("No #p= fragment");
  if (!/^[A-Za-z0-9_-]+$/.test(match[1])) {
    throw new Error("Fragment is not valid base64url");
  }
});

step("The decoded payload should have an expiry timestamp in the future", async () => {
  const decodedPayload = getActiveState().decodedPayload as { expiry?: number } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const now = Math.floor(Date.now() / 1000);

  if (decodedPayload.expiry === undefined || decodedPayload.expiry < now) {
    throw new Error("Expiry timestamp is in the past");
  }
});

step("The expiry should be approximately <hours> hours from now", async (hoursStr) => {
  const hours = parseInt(hoursStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { expiry?: number } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const now = Math.floor(Date.now() / 1000);
  const expectedExpiry = now + hours * 3600;
  const tolerance = 60;

  const difference = Math.abs((decodedPayload.expiry ?? 0) - expectedExpiry);

  if (difference > tolerance) {
    throw new Error(`Expiry timestamp is not approximately ${hours} hours from now`);
  }
});

step("The decoded URL should preserve special characters", async () => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const hasSpecialChars = decodedPayload.items.some((item) => {
    const url = item[0];
    return url.includes("&") || url.includes("#") || url.includes("?");
  });

  if (!hasSpecialChars) {
    throw new Error("No special characters found in decoded URLs");
  }
});

step("The decoded title should preserve special characters", async () => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const hasSpecialChars = decodedPayload.items.some((item) => {
    const title = item[1];
    return title.includes("&") || title.includes("#") || title.includes("?");
  });

  if (!hasSpecialChars) {
    throw new Error("No special characters found in decoded titles");
  }
});

step("The decoded URL should preserve Unicode characters", async () => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const hasUnicode = decodedPayload.items.some((item) => {
    const url = item[0];
    for (const char of url) {
      if (char.charCodeAt(0) > 127) {
        return true;
      }
    }
    return false;
  });

  if (!hasUnicode) {
    throw new Error("No Unicode characters found in decoded URLs");
  }
});

step("The decoded title should preserve Unicode characters", async () => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const hasUnicode = decodedPayload.items.some((item) => {
    const title = item[1];
    for (const char of title) {
      if (char.charCodeAt(0) > 127) {
        return true;
      }
    }
    return false;
  });

  if (!hasUnicode) {
    throw new Error("No Unicode characters found in decoded titles");
  }
});

step(
  "The decoded title should be truncated to <maxChars> characters or less",
  async (maxCharsStr) => {
    const maxChars = parseInt(maxCharsStr, 10);
    const decodedPayload = getActiveState().decodedPayload as
      | { items: Array<[string, string]> }
      | undefined;

    if (!decodedPayload) {
      throw new Error("No decoded payload available");
    }

    for (const item of decodedPayload.items) {
      const title = item[1];
      if (title.length > maxChars) {
        throw new Error(`Title "${title}" exceeds ${maxChars} characters`);
      }
    }
  },
);

step("The decoded payload should contain <count> items", async (countStr) => {
  const count = parseInt(countStr, 10);
  const decodedPayload = getActiveState().decodedPayload as { items: unknown[] } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  if (decodedPayload.items.length !== count) {
    throw new Error(`Expected ${count} items, but got ${decodedPayload.items.length}`);
  }
});

step("The decoded payload should contain URL <url>", async (url) => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const hasUrl = decodedPayload.items.some((item) => item[0] === url);

  if (!hasUrl) {
    throw new Error(`URL "${url}" not found in decoded payload`);
  }
});

step("The decoded payload should contain title <title>", async (title) => {
  const decodedPayload = getActiveState().decodedPayload as
    | { items: Array<[string, string]> }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  const hasTitle = decodedPayload.items.some((item) => item[1] === title);

  if (!hasTitle) {
    throw new Error(`Title "${title}" not found in decoded payload`);
  }
});

step("The decoded payload items should be [url, title] tuples", async () => {
  const decodedPayload = getActiveState().decodedPayload as { items: unknown[] } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  for (const item of decodedPayload.items) {
    if (!Array.isArray(item) || item.length !== 2) {
      throw new Error("Item is not a [url, title] tuple");
    }
    if (typeof item[0] !== "string" || typeof item[1] !== "string") {
      throw new Error("Item does not contain string url and title");
    }
  }
});

step("The clipboard content should start with <prefix>", async (prefix) => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  if (!clipboardContent.startsWith(prefix)) {
    throw new Error(`Clipboard content should start with "${prefix}"`);
  }
});

step("The clipboard content should contain the fragment parameter <param>", async (param) => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  if (!clipboardContent.includes(param)) {
    throw new Error(`Clipboard content should contain "${param}"`);
  }
});

step("The clipboard content should contain encoded data", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  const match = clipboardContent.match(/#p=[A-Za-z0-9_-]+$/);
  if (!match) {
    throw new Error("Clipboard content does not contain encoded data");
  }
});

step("The clipboard content should contain encoded data for <count> tabs", async (countStr) => {
  const count = parseInt(countStr, 10);

  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  try {
    const decoded = await decodeShareUrl(clipboardContent);

    if (decoded.items.length !== count) {
      throw new Error(`Expected encoded data for ${count} tabs, but got ${decoded.items.length}`);
    }
  } catch (e) {
    throw new Error(`Failed to decode clipboard content: ${e}`);
  }
});

step("Store clipboard content as <variableName>", async (variableName) => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  getActiveState().variables[variableName] = clipboardContent;
});

step("Variable <variableName> should equal clipboard content", async (variableName) => {
  const state = getActiveState();
  const variableValue = state.variables[variableName];
  const clipboardContent = getClipboard();

  if (variableValue !== clipboardContent) {
    throw new Error(`Variable "${variableName}" should equal clipboard content`);
  }
});

step("Extract payload from URL", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  try {
    const payload = extractPayloadFromUrl(clipboardContent);
    getActiveState().variables["extractedPayload"] = payload;
  } catch (e) {
    throw new Error(`Failed to extract payload from URL: ${e}`);
  }
});

step("The extracted payload should be valid base64url", async () => {
  const extractedPayload = getActiveState().variables["extractedPayload"] as string | undefined;

  if (!extractedPayload) {
    throw new Error("No extracted payload available");
  }

  if (!isValidBase64url(extractedPayload)) {
    throw new Error("Extracted payload is not valid base64url");
  }
});

step("The clipboard content length should be less than or equal to <budget>", async (budgetStr) => {
  const budget = parseInt(budgetStr, 10);
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  if (clipboardContent.length > budget) {
    throw new Error(`Clipboard content length ${clipboardContent.length} exceeds budget ${budget}`);
  }
});

step("The clipboard content should be a valid viewer URL", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  if (!clipboardContent.startsWith("http://localhost:4321/s/#p=")) {
    throw new Error("Clipboard content is not a valid viewer URL");
  }
});

step("The clipboard content should contain no chrome:// URLs", async () => {
  const clipboardContent = getClipboard();

  if (!clipboardContent) {
    throw new Error("No clipboard content available");
  }

  try {
    const decoded = await decodeShareUrl(clipboardContent);

    const hasChromeUrl = decoded.items.some((item) => {
      return item[0].startsWith("chrome://");
    });

    if (hasChromeUrl) {
      throw new Error("Clipboard content contains chrome:// URLs");
    }
  } catch (e) {
    throw new Error(`Failed to decode clipboard content: ${e}`);
  }
});

step("The decoded payload should have valid structure", async () => {
  const decodedPayload = getActiveState().decodedPayload as
    | { version?: unknown; expiry?: unknown; items?: unknown }
    | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  if (typeof decodedPayload.version !== "number") {
    throw new Error("Payload missing version field");
  }

  if (typeof decodedPayload.expiry !== "number") {
    throw new Error("Payload missing expiry field");
  }

  if (!Array.isArray(decodedPayload.items)) {
    throw new Error("Payload missing items array");
  }
});

step("The decoded payload should not be expired", async () => {
  const decodedPayload = getActiveState().decodedPayload as { isExpired?: boolean } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  if (decodedPayload.isExpired) {
    throw new Error("Payload is expired");
  }
});

step("The decoded payload should be expired", async () => {
  const decodedPayload = getActiveState().decodedPayload as { isExpired?: boolean } | undefined;

  if (!decodedPayload) {
    throw new Error("No decoded payload available");
  }

  if (!decodedPayload.isExpired) {
    throw new Error("Payload is not expired");
  }
});
