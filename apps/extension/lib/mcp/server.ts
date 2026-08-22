import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { decodeEncodedPayload } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import {
  listStashes,
  getStash,
  createStash,
  updateStash,
  deleteStash,
  searchStashes,
  type StashItem,
} from "../stash-store";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const stashItemSchema = z.object({ url: z.string(), title: z.string() });

function stashSummary(stash: {
  id: string;
  title?: string;
  tags: string[];
  note?: string;
  items: StashItem[];
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: stash.id,
    title: stash.title,
    tags: stash.tags,
    itemCount: stash.items.length,
    createdAt: stash.createdAt,
    updatedAt: stash.updatedAt,
  };
}

/**
 * Build a fresh McpServer (per connection; never reuse across ports) with
 * tools backed by the local stash record store (`../stash-store`).
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "stash-extension", version: "0.1.0" },
    { capabilities: { logging: {} } },
  );

  server.tool(
    "stash_snapshot_tabs",
    "Read-only snapshot of the tabs currently open in this browser window (url + title).",
    {},
    async () => {
      const tabs = await browser.tabs.query({ currentWindow: true });
      const items: StashItem[] = tabs
        .filter((t) => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")))
        .map((t) => ({ url: t.url!, title: t.title || t.url! }));
      return { content: [{ type: "text", text: JSON.stringify({ items }) }] };
    },
  );

  server.tool(
    "stash_list",
    "List local stashes (id, title, tags, item counts, timestamps).",
    {},
    async () => {
      const stashes = await listStashes();
      return {
        content: [{ type: "text", text: JSON.stringify({ stashes: stashes.map(stashSummary) }) }],
      };
    },
  );

  server.tool(
    "stash_get",
    "Fetch a local stash by id, including its full item list.",
    { id: z.string().describe("The stash id") },
    async ({ id }) => {
      const stash = await getStash(id);
      if (!stash) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not_found" }) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(stash) }] };
    },
  );

  server.tool(
    "stash_create",
    "Create and persist a new local stash from a list of URLs (with optional titles), title, tags and note.",
    {
      title: z.string().optional().describe("Optional title for the stash"),
      tags: z.array(z.string()).optional().describe("Optional tags"),
      note: z.string().optional().describe("Optional freeform note"),
      items: z.array(stashItemSchema).min(1).describe("Items to include in the stash"),
    },
    async ({ title, tags, note, items }) => {
      const stash = await createStash({ title, tags, note, items });
      return { content: [{ type: "text", text: JSON.stringify(stash) }] };
    },
  );

  server.tool(
    "stash_update",
    "Update a local stash's title, tags, note, or items by id.",
    {
      id: z.string().describe("The stash id"),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
      note: z.string().optional(),
      items: z.array(stashItemSchema).optional(),
    },
    async ({ id, title, tags, note, items }) => {
      const stash = await updateStash(id, { title, tags, note, items });
      if (!stash) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not_found" }) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(stash) }] };
    },
  );

  server.tool(
    "stash_delete",
    "Delete a local stash by id.",
    { id: z.string().describe("The stash id") },
    async ({ id }) => {
      const deleted = await deleteStash(id);
      if (!deleted) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "not_found" }) }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify({ id, deleted: true }) }] };
    },
  );

  server.tool(
    "stash_search",
    "Search local stashes by a substring match over title, tags and note.",
    { query: z.string().describe("Search query") },
    async ({ query }) => {
      const stashes = await searchStashes(query);
      return {
        content: [{ type: "text", text: JSON.stringify({ stashes: stashes.map(stashSummary) }) }],
      };
    },
  );

  server.tool(
    "stash_decode",
    "Decode a stash payload string (the ?p= value from a stash share URL) into its title, items, tags and note.",
    { payload: z.string().describe("The encoded payload string (p param value from a share URL)") },
    async ({ payload }) => {
      const brotli = await getBrotliFunctions();
      const decoded = await decodeEncodedPayload(payload, brotli);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: decoded.title,
              items: decoded.items,
              tags: decoded.tags,
              note: decoded.note,
            }),
          },
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
