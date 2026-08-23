/**
 * Loader for the committed payload fixtures
 * (`packages/shared/fixtures/payloads.json`).
 *
 * Pure validation/identity function over the parsed JSON so any
 * runtime (browser, worker, Node) and vitest can call it without
 * filesystem access. Consumers parse the JSON themselves:
 *
 *   import fixtures from "@stash/shared/fixtures/payloads.json";
 *   const payloads = loadPayloadFixtures(fixtures);
 */

export interface TabInfo {
  url: string;
  title: string;
}

export interface PayloadFixture {
  name: string;
  description: string;
  fragment: string;
  itemCount: number;
  items: TabInfo[];
  title?: string;
  tags?: string[];
  note?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTab(value: unknown, at: string): TabInfo {
  if (!isRecord(value)) {
    throw new Error(`${at}: expected an object, got ${typeof value}`);
  }
  if (typeof value.url !== "string") {
    throw new Error(`${at}.url: expected a string`);
  }
  if (typeof value.title !== "string") {
    throw new Error(`${at}.title: expected a string`);
  }
  return { url: value.url, title: value.title };
}

function validateOptionalString(value: unknown, at: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${at}: expected a string when present`);
  }
  return value;
}

function validateOptionalTags(value: unknown, at: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((t) => typeof t !== "string")) {
    throw new Error(`${at}: expected an array of strings when present`);
  }
  return value as string[];
}

/**
 * Validate a parsed payloads.json and return it as typed fixtures.
 * Throws a descriptive Error on any shape mismatch.
 */
export function loadPayloadFixtures(data: unknown): PayloadFixture[] {
  if (!Array.isArray(data)) {
    throw new Error(`payload fixtures: expected an array, got ${typeof data}`);
  }
  return data.map((entry, i) => {
    const at = `payload fixtures[${i}]`;
    if (!isRecord(entry)) {
      throw new Error(`${at}: expected an object`);
    }
    for (const key of ["name", "description", "fragment"] as const) {
      if (typeof entry[key] !== "string") {
        throw new Error(`${at}.${key}: expected a string`);
      }
    }
    if (typeof entry.itemCount !== "number") {
      throw new Error(`${at}.itemCount: expected a number`);
    }
    if (!Array.isArray(entry.items)) {
      throw new Error(`${at}.items: expected an array`);
    }
    const fixture: PayloadFixture = {
      name: entry.name as string,
      description: entry.description as string,
      fragment: entry.fragment as string,
      itemCount: entry.itemCount as number,
      items: entry.items.map((tab, j) => validateTab(tab, `${at}.items[${j}]`)),
      title: validateOptionalString(entry.title, `${at}.title`),
      tags: validateOptionalTags(entry.tags, `${at}.tags`),
      note: validateOptionalString(entry.note, `${at}.note`),
    };
    if (fixture.itemCount !== fixture.items.length) {
      throw new Error(
        `${at}: itemCount ${fixture.itemCount} does not match items.length ${fixture.items.length}`,
      );
    }
    return fixture;
  });
}
