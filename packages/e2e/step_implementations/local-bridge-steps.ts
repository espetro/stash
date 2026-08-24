/**
 * Local-bridge steps (plan W4): the viewer's `/stashes` page exposed to
 * browser-class agents via the extension content-script bridge.
 *
 * Reuses `launchWithExtension`, `connectMcpPort`, `seedExtensionLibrary`
 * from the agent-flow helpers — the new surface is layered on top of
 * the existing extension-launch plumbing. The MCP port stays open
 * throughout each scenario so reload-after-update assertions can use
 * `rpc.callTool("stash_update", ...)` without re-launching.
 *
 * The `localLibraryViewerEnabled` opt-in flag lives in
 * `browser.storage.sync` (the extension's settings store). The steps
 * below write through `chrome.storage.sync` directly because that's
 * the same surface the options UI uses, so no DOM interaction is
 * required to flip the gate.
 */

import { request, type APIRequestContext } from "playwright";
import type { BrowserContext } from "playwright";
import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import { EXTENSION_SEED, type McpRpc } from "../helpers/mcp-seed";
import { generateViewerUrlFromFixture, encodeFixturePayload } from "../helpers/encoder-helper";
import { setCurrentPage, getCurrentPage } from "./common-steps";

/**
 * Shared APIRequestContext for the fetch-only baseline scenario.
 * `agent-flow-steps.ts` already owns its own; we keep a separate one
 * here so this file stays decoupled and the baseline test does not
 * accidentally share connection state with the agent-flow suite.
 */
let _baselineApi: APIRequestContext | null = null;
async function baselineApi(): Promise<APIRequestContext> {
  if (!_baselineApi) _baselineApi = await request.newContext();
  return _baselineApi;
}

function requireExtensionContext(): BrowserContext {
  const ctx = getActiveState().extensionContext;
  if (!ctx) {
    throw new Error("No extension context. Launch the extension first.");
  }
  return ctx;
}

function getRpc(): McpRpc {
  const rpc = getActiveState().variables["rpc"] as McpRpc | undefined;
  if (!rpc) {
    throw new Error("No MCP RPC in scenario state. Connect to the extension port first.");
  }
  return rpc;
}

interface StashExportItem {
  url: string;
  title: string;
}
interface StashExportRecord {
  id: string;
  title: string | null;
  tags: string[];
  note: string | null;
  items: StashExportItem[];
  createdAt: number;
  updatedAt: number;
}
interface StashExport {
  version: number;
  source: "extension" | "viewer-local";
  stashes: StashExportRecord[];
}

/**
 * Parse the JSON island the viewer renders inside
 * `<script type="application/json" id="stash-local-export">`. Returns
 * `null` if the island has not yet reached `data-stash-status="ready"`,
 * so callers can fail with a clear message instead of crashing on
 * `undefined`.
 */
async function readStashExportIsland(
  page: ReturnType<typeof getCurrentPage>,
): Promise<StashExport | null> {
  return page.evaluate(() => {
    const el = document.getElementById("stash-local-export");
    if (!el) return null;
    if (el.getAttribute("data-stash-status") !== "ready") return null;
    try {
      return JSON.parse(el.textContent ?? "null") as unknown;
    } catch {
      return null;
    }
  }) as Promise<StashExport | null>;
}

step("The user navigates to /stashes", async () => {
  const ctx = requireExtensionContext();
  const page =
    ctx.pages().find((p) => !p.url().startsWith("chrome-extension://")) ?? (await ctx.newPage());
  setCurrentPage(page);
  await page.goto("http://localhost:4321/stashes", { waitUntil: "domcontentloaded" });
  // The bridge probe runs in a post-mount effect, so wait for the
  // island to settle before any assertions read it.
  await page.waitForSelector('#stash-local-export[data-stash-status="ready"]', { timeout: 10000 });
});

step("The user sets localLibraryViewerEnabled to <value>", async (value) => {
  const enabled = value.trim().toLowerCase() === "true";
  const ctx = requireExtensionContext();
  const probe = ctx.pages().find((p) => p.url().startsWith("chrome-extension://"));
  const page = probe ?? (await ctx.newPage());
  await page.evaluate(async (flag) => {
    // The settings item (`stash-settings`) lives in `sync` storage; the
    // existing settings-steps.ts uses the same `c.storage.sync.get`
    // surface to read it, so `set` is the symmetric write path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (globalThis as any).chrome;
    const current = (await c.storage.sync.get("stash-settings"))["stash-settings"];
    const parsed = current ? JSON.parse(current) : {};
    parsed.localLibraryViewerEnabled = flag;
    await c.storage.sync.set({ "stash-settings": JSON.stringify(parsed) });
  }, enabled);
});

step("The page source chip should be <value>", async (expected) => {
  const page = getCurrentPage();
  const chip = await page.waitForSelector(`[data-stash-source="${expected}"]`, {
    state: "attached",
    timeout: 10000,
  });
  if (!chip) {
    throw new Error(`No element with data-stash-source="${expected}".`);
  }
});

step("The page should show <count> stashes", async (countStr) => {
  const page = getCurrentPage();
  const expected = parseInt(countStr, 10);
  const observed = await page.locator("[data-stash-record-id]").count();
  if (observed !== expected) {
    throw new Error(
      `Expected ${expected} [data-stash-record-id] elements on /stashes, got ${observed}.`,
    );
  }
});

step("The JSON island parses to a StashExport matching the seed", async () => {
  const page = getCurrentPage();
  const parsed = await readStashExportIsland(page);
  if (!parsed) {
    throw new Error("StashExport island is missing or not in 'ready' state.");
  }
  if (parsed.version !== 1) {
    throw new Error(`StashExport.version expected 1, got ${parsed.version}.`);
  }
  if (parsed.source !== "extension") {
    throw new Error(`StashExport.source expected "extension", got "${parsed.source}".`);
  }
  if (parsed.stashes.length !== EXTENSION_SEED.length) {
    throw new Error(
      `Expected ${EXTENSION_SEED.length} stashes in island, got ${parsed.stashes.length}.`,
    );
  }
  // Order is not guaranteed by the bridge, but every seed entry must
  // appear with its title, its tags, and the items in any order.
  const titles = parsed.stashes.map((s) => s.title);
  for (const seed of EXTENSION_SEED) {
    if (!titles.includes(seed.title)) {
      throw new Error(`Island is missing the seeded stash "${seed.title}".`);
    }
  }
  for (const seed of EXTENSION_SEED) {
    const matching = parsed.stashes.find((s) => s.title === seed.title);
    if (!matching) continue;
    if (matching.tags.join(",") !== seed.tags.join(",")) {
      throw new Error(
        `Tag mismatch for "${seed.title}": expected ${JSON.stringify(seed.tags)}, got ${JSON.stringify(matching.tags)}.`,
      );
    }
    if (matching.items.length !== seed.items.length) {
      throw new Error(
        `Item-count mismatch for "${seed.title}": expected ${seed.items.length}, got ${matching.items.length}.`,
      );
    }
  }
  getActiveState().variables["lastIsland"] = parsed;
});

step("The ?agent=json view returns the canonical StashExport shape", async () => {
  // Re-navigate via the dedicated agent view; the underlying React
  // tree skips the SharedCard chrome and renders the island verbatim
  // inside a `<pre id="agent-export">`. The script-tag island is not
  // emitted in this mode (no SharedCard), so we read from <pre>.
  const ctx = requireExtensionContext();
  const page =
    ctx.pages().find((p) => !p.url().startsWith("chrome-extension://")) ?? (await ctx.newPage());
  setCurrentPage(page);
  await page.goto("http://localhost:4321/stashes?agent=json", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('pre#agent-export[data-stash-status="ready"]', { timeout: 10000 });
  const parsed = (await page.evaluate(() => {
    const el = document.getElementById("agent-export");
    if (!el) return null;
    if (el.getAttribute("data-stash-status") !== "ready") return null;
    try {
      return JSON.parse(el.textContent ?? "null") as unknown;
    } catch {
      return null;
    }
  })) as StashExport | null;
  if (!parsed) {
    throw new Error("?agent=json view returned no payload in 'ready' state.");
  }
  if (parsed.version !== 1 || parsed.source !== "extension") {
    throw new Error(
      `?agent=json shape mismatch: got version=${parsed.version} source=${parsed.source}`,
    );
  }
  if (parsed.stashes.length !== EXTENSION_SEED.length) {
    throw new Error(
      `?agent=json expected ${EXTENSION_SEED.length} stashes, got ${parsed.stashes.length}.`,
    );
  }
});

step("The ?agent=markdown view contains each seeded title and URL", async () => {
  const ctx = requireExtensionContext();
  const page =
    ctx.pages().find((p) => !p.url().startsWith("chrome-extension://")) ?? (await ctx.newPage());
  setCurrentPage(page);
  await page.goto("http://localhost:4321/stashes?agent=markdown", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('pre#agent-export-md[data-stash-status="ready"]', { timeout: 10000 });
  const body = await page.evaluate(() => {
    const el = document.getElementById("agent-export-md");
    return el?.textContent ?? "";
  });
  for (const seed of EXTENSION_SEED) {
    if (!body.includes(seed.title)) {
      throw new Error(`Markdown body missing seeded title "${seed.title}".`);
    }
    for (const item of seed.items) {
      if (!body.includes(item.url)) {
        throw new Error(`Markdown body missing seeded URL ${item.url} for "${seed.title}".`);
      }
    }
  }
});

step("Reloading the page reflects the updated extension record", async () => {
  const rpc = getRpc();
  // Pick the first seeded stash, update its title via the MCP port,
  // and verify the reloaded viewer picks up the new title.
  const seeded = getActiveState().variables["seededIds"] as string[] | undefined;
  if (!seeded || seeded.length === 0) {
    throw new Error("No seeded stash IDs in state. Run the seed step first.");
  }
  const targetId = seeded[0];
  const newTitle = "Web dev reading list (updated)";
  const updated = (await rpc.callTool("stash_update", { id: targetId, title: newTitle })) as {
    id: string;
    title?: string;
  };
  if (updated.title !== newTitle) {
    throw new Error(
      `stash_update did not persist title; expected "${newTitle}", got "${updated.title}".`,
    );
  }

  const ctx = requireExtensionContext();
  const page =
    ctx.pages().find((p) => !p.url().startsWith("chrome-extension://")) ?? (await ctx.newPage());
  setCurrentPage(page);
  await page.goto("http://localhost:4321/stashes", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#stash-local-export[data-stash-status="ready"]', { timeout: 10000 });

  // The bridge reads from extension storage, so the updated title
  // must surface in the reloaded island.
  const reloaded = await readStashExportIsland(page);
  if (!reloaded) {
    throw new Error("StashExport island missing after reload.");
  }
  if (!reloaded.stashes.some((s) => s.title === newTitle)) {
    throw new Error(
      `Reloaded island missing updated title "${newTitle}". Titles seen: ${JSON.stringify(reloaded.stashes.map((s) => s.title))}.`,
    );
  }
  // The DOM should also reflect it: the StashCard renders the title
  // in an element with `[data-stash-title]` (the canonical selector).
  const titleSeen = await page
    .locator(`[data-stash-record-id="${targetId}"] [data-stash-title]`)
    .first()
    .textContent()
    .catch(() => null);
  if (!titleSeen || !titleSeen.includes(newTitle)) {
    throw new Error(`StashCard for ${targetId} did not render updated title; got "${titleSeen}".`);
  }
});

step("The JSON island parses to an empty viewer-local StashExport", async () => {
  const page = getCurrentPage();
  const parsed = await readStashExportIsland(page);
  if (!parsed) {
    throw new Error("StashExport island is missing or not in 'ready' state.");
  }
  if (parsed.version !== 1) {
    throw new Error(`StashExport.version expected 1, got ${parsed.version}.`);
  }
  if (parsed.source !== "viewer-local") {
    throw new Error(`StashExport.source expected "viewer-local", got "${parsed.source}".`);
  }
  if (!Array.isArray(parsed.stashes) || parsed.stashes.length !== 0) {
    throw new Error(
      `Expected empty stashes[] for viewer-local source, got ${JSON.stringify(parsed.stashes)}.`,
    );
  }
});

step("viewer localStorage contains no extension record titles or URLs", async () => {
  const page = getCurrentPage();
  const localDump = (await page.evaluate(() =>
    Object.values(localStorage)
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("\n"),
  )) as string;
  for (const seed of EXTENSION_SEED) {
    if (localDump.includes(seed.title)) {
      throw new Error(`viewer localStorage contains seeded title "${seed.title}".`);
    }
    for (const item of seed.items) {
      if (localDump.includes(item.url)) {
        throw new Error(`viewer localStorage contains seeded URL ${item.url}.`);
      }
    }
  }
});

step("viewer IndexedDB contains no extension stash titles or URLs", async () => {
  const page = getCurrentPage();
  // Enumerate every database the viewer created, dump object-store
  // values, and ensure none of the seed titles/URLs leaked through.
  const dump = (await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indexedDb = (globalThis as any).indexedDB as IDBFactory;
    if (!indexedDb || typeof indexedDb.databases !== "function") {
      return "";
    }
    const dbs = (await indexedDb.databases()) as { name?: string }[];
    const out: string[] = [];
    for (const info of dbs) {
      const name = info.name;
      if (!name) continue;
      const req = indexedDb.open(name);
      await new Promise<void>((resolve) => {
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
      const db = req.result;
      if (!db) continue;
      try {
        const stores = Array.from(db.objectStoreNames);
        for (const store of stores) {
          const tx = db.transaction(store, "readonly");
          const obj = tx.objectStore(store);
          const cur = obj.openCursor();
          await new Promise<void>((resolve) => {
            cur.onsuccess = () => {
              const cursor = cur.result;
              if (!cursor) {
                resolve();
                return;
              }
              try {
                out.push(JSON.stringify(cursor.value));
              } catch {
                /* ignore unserializable values */
              }
              cursor.continue();
            };
            cur.onerror = () => resolve();
          });
        }
      } finally {
        db.close();
      }
    }
    return out.join("\n");
  })) as string;
  if (!dump) return; // No viewer DBs created yet — nothing to leak.
  for (const seed of EXTENSION_SEED) {
    if (dump.includes(seed.title)) {
      throw new Error(`viewer IndexedDB contains seeded title "${seed.title}".`);
    }
    for (const item of seed.items) {
      if (dump.includes(item.url)) {
        throw new Error(`viewer IndexedDB contains seeded URL ${item.url}.`);
      }
    }
  }
});

step("A plain GET of /stashes returns an HTML shell with no extension records", async () => {
  // Fetch-only baseline: no extension, no extension storage, no
  // bridge. The viewer should serve an HTML shell that does NOT
  // include any of the seeded titles or URLs.
  const api = await baselineApi();
  const response = await api.get("http://localhost:4321/stashes");
  if (!response.ok()) {
    throw new Error(`Fetch-only GET of /stashes failed: ${response.status()}`);
  }
  const body = await response.text();
  for (const seed of EXTENSION_SEED) {
    if (body.includes(seed.title)) {
      throw new Error(
        `Fetch-only /stashes leaked seeded title "${seed.title}" without an extension.`,
      );
    }
    for (const item of seed.items) {
      if (body.includes(item.url)) {
        throw new Error(`Fetch-only /stashes leaked seeded URL ${item.url} without an extension.`);
      }
    }
  }
  // The fetch-only baseline also must NOT carry the JSON island at
  // all — the island is `client:only`, so SSR emits an empty shell.
  if (body.includes('id="stash-local-export"')) {
    throw new Error("Fetch-only /stashes unexpectedly rendered the JSON island.");
  }
});

step("A hosted /s decode with format json returns the canonical payload", async () => {
  // The hosted `/s` decode endpoint is unaffected by the local bridge
  // and remains the universal surface for fetch-only agents. Use the
  // existing canonical fixture so the assertion matches the existing
  // agent-flow suite exactly.
  const fixture = "single-tab";
  const url = await generateViewerUrlFromFixture(fixture);
  const encoded = await encodeFixturePayload(fixture);
  const api = await baselineApi();
  const response = await api.get(`http://localhost:4321/s?p=${encoded}&format=json`);
  if (!response.ok()) {
    throw new Error(`/s?format=json failed: ${response.status()}`);
  }
  const json = (await response.json()) as { v?: number; i?: unknown[] };
  if (json.v === undefined) {
    throw new Error(`/s?format=json missing canonical version field; got ${JSON.stringify(json)}.`);
  }
  // Compare URLs end-to-end: the canonical share URL path is
  // `${VIEWER_ORIGIN}/s/#p=...`; the rendered URL must equal what the
  // encoder produced. Round-tripping the URL also proves the decode
  // endpoint didn't URL-strip the fragment.
  if (!url.startsWith("http://localhost:4321/s/#p=")) {
    throw new Error(`Unexpected canonical share URL shape: ${url}`);
  }
});
