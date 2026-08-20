import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeTabsToShareUrl, decodeEncodedPayload, type TabInfo } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { getSettings, EXPIRY_HOURS_MAP } from "../settings";
import { getHistory, addToHistory } from "../history";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Build a fresh McpServer (per connection; never reuse across ports) with
 * tools mirroring the stash worker's /mcp endpoint where applicable.
 *
 * - stash_list: stashes/URLs currently stored by the extension (history)
 * - stash_create: create a new share link from URLs (URL-payload mode)
 * - stash_decode: decode a payload string into title + items
 */
export function buildMcpServer(): McpServer {
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

/**
 * Wire a fresh McpServer over a transport (one per connection, required
 * since SDK 1.26 to avoid cross-client state).
 */
export async function startMcpServerOverTransport(transport: Transport): Promise<McpServer> {
  const server = buildMcpServer();
  await server.connect(transport);
  return server;
}
