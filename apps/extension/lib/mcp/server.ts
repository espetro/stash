import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createStorage } from "unstorage";
import {
  encodeTabsToShareUrl,
  decodeEncodedPayload,
  createPayload,
  encodePayloadToUrl,
  type TabInfo,
} from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import {
  createStash,
  getStash,
  isExpired,
  SERVER_TTL_HOURS,
  type ServerTtl,
} from "@stash/server-core";
import { getSettings, EXPIRY_HOURS_MAP } from "../settings";
import { getHistory, addToHistory } from "../history";
import { browserStorageDriver } from "../server/storage-driver";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Build a fresh McpServer (per connection; never reuse across ports) with
 * tools mirroring the stash worker's /mcp endpoint where applicable.
 *
 * - stash_list: stashes/URLs currently stored by the extension (history)
 * - stash_create: create a new share link from URLs (URL-payload mode)
 * - stash_decode: decode a payload string into title + items
 */
export interface BuildMcpServerOptions {
  /** When true, additionally register server-backed tools (stash_create_stored,
   *  stash_get_stored) storing entries in browser.storage.local. */
  experimentalServer?: boolean;
}

export function buildMcpServer(options: BuildMcpServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "stash-extension", version: "0.1.0" },
    { capabilities: { logging: {} } },
  );

  server.tool(
    "stash_list",
    "List stashes currently stored by the extension (local history of created share links).",
    {},
    async () => {
      const history = await getHistory();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              stashes: history.map(({ id, url, itemCount, truncated, createdAt, expiresAt }) => ({
                id,
                url,
                itemCount,
                truncated,
                createdAt,
                expiresAt,
              })),
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "stash_create",
    "Create a stash: a shareable link bundling multiple URLs (URL-payload mode, stateless). Returns the share URL.",
    {
      title: z.string().optional().describe("Optional title for the stash"),
      urls: z.array(z.string()).min(1).describe("URLs to include in the stash"),
    },
    async ({ title, urls }) => {
      const brotli = await getBrotliFunctions();
      const settings = await getSettings();
      const expiryHours = EXPIRY_HOURS_MAP[settings.expiryMode];
      const tabs: TabInfo[] = urls.map((url) => ({ url, title: url }));
      const result = await encodeTabsToShareUrl(
        tabs,
        brotli,
        expiryHours,
        settings.viewerOrigin,
        title,
      );

      await addToHistory({
        id: Date.now().toString(36),
        url: result.url,
        itemCount: result.itemCount,
        truncated: result.truncated,
        createdAt: Date.now(),
        expiresAt: Date.now() + expiryHours * 3600 * 1000,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              itemCount: result.itemCount,
              truncated: result.truncated,
            }),
          },
        ],
      };
    },
  );

  if (options.experimentalServer) {
    registerStoredTools(server);
  }

  server.tool(
    "stash_decode",
    "Decode a stash payload string (the ?p= value from a stash share URL) into its title and items.",
    { payload: z.string().describe("The encoded payload string (p param value from a share URL)") },
    async ({ payload }) => {
      const brotli = await getBrotliFunctions();
      const decoded = await decodeEncodedPayload(payload, brotli);
      return {
        content: [
          { type: "text", text: JSON.stringify({ title: decoded.title, items: decoded.items }) },
        ],
      };
    },
  );

  return server;
}

/** Register experimental server-backed tools on an existing McpServer
 *  (mirrors @stash/server-core's buildServer stash_create/stash_get, but with
 *  the suffixed names to coexist with the URL-payload tools above). */
function registerStoredTools(server: McpServer): void {
  let storage: ReturnType<typeof createStorage> | null = null;
  const getStorage = () => {
    if (!storage) {
      storage = createStorage({ driver: browserStorageDriver({ area: browser.storage.local }) });
    }
    return storage;
  };

  server.tool(
    "stash_create_stored",
    "Create a server-backed stash: a short link bundling multiple URLs, stored in the extension's browser storage. Returns the id and share URL. Links expire after the chosen TTL (1, 7, 14 or 30 days).",
    {
      title: z.string().optional().describe("Optional title for the stash"),
      urls: z.array(z.string()).min(1).describe("URLs to include in the stash"),
      ttlDays: z
        .union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)])
        .default(7)
        .describe("TTL in days: 1, 7 (default), 14 or 30"),
    },
    async ({ title, urls, ttlDays }) => {
      const brotli = await getBrotliFunctions();
      const tabs: TabInfo[] = urls.map((url) => ({ url, title: url }));
      const payload = await encodePayloadToUrl(
        createPayload(tabs, SERVER_TTL_HOURS[`${ttlDays}d`], title),
        brotli,
      );
      const ttl: ServerTtl = `${ttlDays}d`;
      const { id } = await createStash(getStorage(), payload, ttl);
      const url = `${new URL(browser.runtime.getURL("")).origin}/s/${id}`;
      return {
        content: [{ type: "text", text: JSON.stringify({ id, url }) }],
      };
    },
  );

  server.tool(
    "stash_get_stored",
    "Fetch a server-backed stash by its short id and return its title and items. Errors with not_found or expired.",
    { id: z.string().describe("The 6-character stash id") },
    async ({ id }) => {
      const entry = await getStash(getStorage(), id.toUpperCase());
      if (!entry) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not_found" }) }],
          isError: true,
        };
      }
      if (isExpired(entry)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "expired" }) }],
          isError: true,
        };
      }
      const brotli = await getBrotliFunctions();
      const decoded = await decodeEncodedPayload(entry.p, brotli);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id, title: decoded.title, items: decoded.items }),
          },
        ],
      };
    },
  );
}

/**
 * Wire a fresh McpServer over a transport (one per connection, required
 * since SDK 1.26 to avoid cross-client state).
 */
export async function startMcpServerOverTransport(
  transport: Transport,
  options: BuildMcpServerOptions = {},
): Promise<McpServer> {
  const server = buildMcpServer(options);
  await server.connect(transport);
  return server;
}
