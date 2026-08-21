import type { BrotliFunctions } from "@stash/codec";
// brotli-wasm's package.json "exports" field maps ESM imports to the
// web bundle, which calls `fetch()` at init and fails under Node.
// Load it through CommonJS via createRequire to pick the Node entry,
// which is synchronous and works under both loaders. The Node CJS
// entry exposes the brotli API directly (not as a Promise), so we
// wrap it once at module load time.
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);
const nodeBrotli = nodeRequire("brotli-wasm") as {
  compress: (data: Uint8Array, opts: { quality: number }) => Uint8Array;
  decompress: (data: Uint8Array) => Uint8Array;
};
import * as fs from "fs";
import * as path from "path";
import {
  type TabInfo,
  type SharePayload,
  type EncodingResult,
  type QrEncodingResult,
  PAYLOAD_VERSION,
  EXPIRY_HOURS,
  MAX_TITLE_CHARS,
  BUDGET_CHARS,
  normalizeTitle as codecNormalizeTitle,
  createPayload as codecCreatePayload,
  encodeTabsToShareUrl as codecEncodeTabsToShareUrl,
  encodeTabsToQrUrl as codecEncodeTabsToQrUrl,
  buildShareUrl as codecBuildShareUrl,
  buildQrUrl as codecBuildQrUrl,
} from "@stash/codec";

export type { TabInfo, SharePayload, EncodingResult, QrEncodingResult };

/**
 * Local viewer origin. Defaults to the dev server on `localhost:4321`
 * so generated share URLs point at the viewer Astro server actually
 * running in front of the tests. Override with `VIEWER_ORIGIN` env var
 * (e.g. when running against a deployed preview).
 */
export const VIEWER_ORIGIN: string = process.env.VIEWER_ORIGIN || "http://localhost:4321";
export const VIEWER_PATH = "/s/";

/**
 * Build a full share URL, swapping the codec default origin for the
 * locally-configured one. Thin wrapper around `codec.buildShareUrl`
 * that always threads our `VIEWER_ORIGIN` through.
 */
export function buildShareUrl(encoded: string): string {
  return codecBuildShareUrl(encoded, VIEWER_ORIGIN);
}

export function buildQrUrl(encoded: string): string {
  return codecBuildQrUrl(encoded, VIEWER_ORIGIN);
}

let _brotli: BrotliFunctions | null = null;

/**
 * Get brotli functions (cached). Backed by brotli-wasm's Node CJS entry,
 * which is synchronous and resolves immediately on load.
 */
export async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (!_brotli) {
    _brotli = {
      compress: (data, opts) => nodeBrotli.compress(data, opts),
      decompress: (data) => nodeBrotli.decompress(data),
    };
  }
  return _brotli;
}

/**
 * Normalize title (re-export from codec)
 */
export const normalizeTitle = codecNormalizeTitle;

/**
 * Create payload with expiry timestamp (re-export from codec)
 */
export function createPayload(tabs: TabInfo[]): SharePayload {
  return codecCreatePayload(tabs, EXPIRY_HOURS);
}

/**
 * Create payload with custom expiry for testing
 */
export function createPayloadWithExpiry(tabs: TabInfo[], expiryHours: number): SharePayload {
  return codecCreatePayload(tabs, expiryHours);
}

/**
 * Encode payload to base64url string using brotli compression
 */
export async function encodePayload(payload: SharePayload): Promise<string> {
  const brotli = await getBrotliFunctions();
  const { encodePayloadToUrl } = await import("@stash/codec");
  return encodePayloadToUrl(payload, brotli);
}

/**
 * Main entry point: encode tabs to share URL with budget enforcement
 */
export async function encodeTabsToShareUrl(tabs: TabInfo[]): Promise<EncodingResult> {
  const brotli = await getBrotliFunctions();
  return codecEncodeTabsToShareUrl(tabs, brotli, EXPIRY_HOURS, VIEWER_ORIGIN);
}

/**
 * Encode tabs to QR share URL with budget enforcement
 */
export async function encodeTabsToQrUrl(
  tabs: TabInfo[],
  title?: string,
): Promise<QrEncodingResult> {
  const brotli = await getBrotliFunctions();
  return codecEncodeTabsToQrUrl(tabs, brotli, EXPIRY_HOURS, VIEWER_ORIGIN, title);
}

/**
 * Filter out chrome:// URLs
 */
export function filterChromeUrls(tabs: TabInfo[]): TabInfo[] {
  return tabs.filter((tab) => !tab.url.startsWith("chrome://"));
}

/**
 * Load sample tabs from fixtures
 */
export function loadSampleTabs(datasetName: string): TabInfo[] {
  const fixturesPath = path.join(process.cwd(), "fixtures", "sample-tabs.json");
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));

  if (!fixtures[datasetName]) {
    throw new Error(`Dataset "${datasetName}" not found in sample-tabs.json`);
  }

  return fixtures[datasetName];
}

/**
 * Load payloads from fixtures
 */
export function loadPayloads(): Record<string, any> {
  // The committed fixture file is an array for reviewability. Consumers
  // look up by `name`, so re-key it on read.
  const fixturesPath = path.join(process.cwd(), "fixtures", "payloads.json");
  const arr = JSON.parse(fs.readFileSync(fixturesPath, "utf-8")) as Array<{
    name: string;
  }>;
  const out: Record<string, unknown> = {};
  for (const entry of arr) out[entry.name] = entry;
  return out as Record<string, any>;
}

/**
 * Encode a fixture payload (async)
 */
export async function encodeFixturePayload(payloadName: string): Promise<string> {
  const payloads = loadPayloads();
  const fixture = payloads[payloadName];

  if (!fixture) {
    throw new Error(`Payload "${payloadName}" not found in payloads.json`);
  }

  if (fixture.fragment) {
    return fixture.fragment.replace(/^#p=/, "");
  }

  return encodePayload(fixture.payload);
}

/**
 * Generate viewer URL from fixture payload (async)
 */
export async function generateViewerUrlFromFixture(payloadName: string): Promise<string> {
  const encoded = await encodeFixturePayload(payloadName);
  return buildShareUrl(encoded);
}

/**
 * Validate base64url encoding
 */
export function isValidBase64url(str: string): boolean {
  const base64urlRegex = /^[A-Za-z0-9_-]*$/;
  return base64urlRegex.test(str);
}

/**
 * Validate base32 encoding (uppercase, no padding)
 */
export function isValidBase32(str: string): boolean {
  const base32Regex = /^[A-Z2-7]*$/;
  return base32Regex.test(str);
}

/**
 * Check if URL is within budget
 */
export function isUrlWithinBudget(url: string): boolean {
  return url.length <= BUDGET_CHARS;
}

// Suppress unused-import warnings for symbols retained for parity
// with the codec public surface (used by step implementations).
void PAYLOAD_VERSION;
void MAX_TITLE_CHARS;
void VIEWER_PATH;
