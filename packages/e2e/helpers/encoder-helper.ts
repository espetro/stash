import type { BrotliFunctions } from "@stash/codec";
import brotliWasm from "brotli-wasm";
import * as fs from "fs";
import * as path from "path";
import {
  type TabInfo,
  type SharePayload,
  type EncodingResult,
  PAYLOAD_VERSION,
  EXPIRY_HOURS,
  MAX_TITLE_CHARS,
  BUDGET_CHARS,
  VIEWER_ORIGIN,
  VIEWER_PATH,
  normalizeTitle as codecNormalizeTitle,
  createPayload as codecCreatePayload,
  encodePayload as codecEncodePayload,
  buildShareUrl,
  findMaxTabsWithinBudget as codecFindMaxTabsWithinBudget,
  encodeTabsToShareUrl as codecEncodeTabsToShareUrl,
} from "@stash/codec";

export type { TabInfo, SharePayload, EncodingResult };

let _brotli: BrotliFunctions | null = null;
let _initPromise: Promise<BrotliFunctions> | null = null;

/**
 * Get brotli functions (cached)
 */
export async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (_brotli) return _brotli;

  if (!_initPromise) {
    _initPromise = (async () => {
      const brotliModule = await brotliWasm;
      _brotli = {
        compress: (data, opts) => brotliModule.compress(data, opts),
        decompress: (data) => brotliModule.decompress(data),
      };
      return _brotli;
    })();
  }

  return _initPromise;
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
export function createPayloadWithExpiry(
  tabs: TabInfo[],
  expiryHours: number,
): SharePayload {
  return codecCreatePayload(tabs, expiryHours);
}

/**
 * Encode payload to base64url string using brotli compression
 * NOTE: This is async and uses the codec's v2 encoding with brotli-wasm
 */
export async function encodePayload(payload: SharePayload): Promise<string> {
  const brotli = await getBrotliFunctions();
  return codecEncodePayload(payload, brotli);
}

/**
 * Find max number of tabs that fit within budget using binary search
 */
export async function findMaxTabsWithinBudget(tabs: TabInfo[]): Promise<number> {
  const brotli = await getBrotliFunctions();
  return codecFindMaxTabsWithinBudget(tabs, brotli, VIEWER_ORIGIN, EXPIRY_HOURS);
}

/**
 * Main entry point: encode tabs to share URL with budget enforcement
 */
export async function encodeTabsToShareUrl(
  tabs: TabInfo[],
): Promise<EncodingResult> {
  const brotli = await getBrotliFunctions();
  return codecEncodeTabsToShareUrl(tabs, brotli, EXPIRY_HOURS, VIEWER_ORIGIN);
}

/**
 * Filter out chrome:// URLs
 */
export function filterChromeUrls(tabs: TabInfo[]): TabInfo[] {
  return tabs.filter(tab => !tab.url.startsWith('chrome://'));
}

/**
 * Load sample tabs from fixtures
 */
export function loadSampleTabs(datasetName: string): TabInfo[] {
  const fixturesPath = path.join(process.cwd(), 'fixtures', 'sample-tabs.json');
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

  if (!fixtures[datasetName]) {
    throw new Error(`Dataset "${datasetName}" not found in sample-tabs.json`);
  }

  return fixtures[datasetName];
}

/**
 * Load payloads from fixtures
 */
export function loadPayloads(): Record<string, any> {
  const fixturesPath = path.join(process.cwd(), 'fixtures', 'payloads.json');
  return JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
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
    return fixture.fragment.replace(/^#p=/, '');
  }

  return encodePayload(fixture.payload);
}

/**
 * Generate viewer URL from fixture payload (async)
 */
export async function generateViewerUrlFromFixture(
  payloadName: string,
): Promise<string> {
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
 * Check if URL is within budget
 */
export function isUrlWithinBudget(url: string): boolean {
  return url.length <= BUDGET_CHARS;
}
