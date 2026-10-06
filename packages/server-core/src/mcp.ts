import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport as StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  createPayload,
  encodePayloadToUrl,
  decodeEncodedPayload,
  type TabInfo,
  type BrotliFunctions,
} from "@stash/codec";
import { parseStashLine } from "@stash/shared";
import { stashError } from "@stash/shared/error-contract";
import { createStash, getStash, isExpired, SERVER_TTL_HOURS, type ServerTtl } from "./store";
import type { StashServerDeps } from "./config";

/** The relay's MCP surface: the only tools the hosted/self-hosted relay
 *  advertises. The 8 frozen daemon tool names live in the extension
 *  (`apps/extension/lib/mcp/server.ts`) and the daemon (F2) — this module
 *  no longer mirrors them. */
export const MCP_TOOLS = [
  {
    name: "stash_create",
    description:
      'Create a stash: a short shareable link bundling multiple URLs. Input: urls[] of lines ("https://..." or "https://... | optional title"), optional title, ttlDays 1|7|14|30. Returns {id, url} — url is shareable as-is. Storing plaintext by design: the payload already transits to this relay in the arguments, so recipients can read it back via stash_get or GET <url>?format=json. Do NOT use to read or look up existing stashes — use stash_get.',
  },
  {
    name: "stash_get",
    description:
      "Fetch a stash by its 6-character base32 id — the token after /s/ in a share URL like https://<host>/s/AHK7QY. Returns {id, title, items[]}. Errors: {error: \"not_found\"} (unknown id), {error: \"expired\"} (link outlived its TTL), {error: \"encrypted\"} (zero-trust entry — the key is in the share URL's #<key> fragment; decrypt client-side or use a self-contained #p= link). When you only have a #p= fragment payload, use stash_decode.",
  },
  {
    name: "stash_decode",
    description:
      "Decode a stash payload string into {title, items[]}. Input: the raw payload token — the value after #p= or ?p= in a share URL — NOT the whole URL (strip everything up to and including p=). For 6-character short-link ids use stash_get instead.",
  },
] as const;

export function buildServer(origin: string, deps: StashServerDeps): McpServer {
  const server = new McpServer(
    { name: "stash-shortener", version: "0.1.0" },
    { capabilities: { logging: {} } },
  );

  server.tool(
    "stash_create",
    MCP_TOOLS[0].description,
    {
      title: z.string().optional().describe("Optional stash title"),
      urls: z
        .array(z.string())
        .min(1)
        .describe('URLs to include, one per line; "url | title" syntax sets a per-item title'),
      ttlDays: z
        .union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)])
        .default(Math.round(SERVER_TTL_HOURS[deps.defaultTtl] / 24) as 1 | 7 | 14 | 30)
        .describe(
          `TTL in days: 1, 7, 14 or 30 (default ${Math.round(SERVER_TTL_HOURS[deps.defaultTtl] / 24)})`,
        ),
    },
    async ({ title, urls, ttlDays }) => {
      const ttl: ServerTtl = `${ttlDays}d` as ServerTtl;
      if (deps.maxTtl && SERVER_TTL_HOURS[ttl] > SERVER_TTL_HOURS[deps.maxTtl]) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                stashError(
                  "ttl_exceeded",
                  `ttl exceeds maximum allowed (${deps.maxTtl})`,
                  `this relay caps ttlDays at ${Math.round(SERVER_TTL_HOURS[deps.maxTtl] / 24)}`,
                ),
              ),
            },
          ],
          isError: true,
        };
      }
      const brotli = await deps.getBrotli();
      const tabs: TabInfo[] = urls.map((line) => {
        const { url, title } = parseStashLine(line);
        return { url, title };
      });
      const payload = await encodePayloadToUrl(createPayload(tabs, ttlDays * 24, title), brotli);
      const { id } = await createStash(deps.storage, payload, ttl);
      return {
        content: [{ type: "text", text: JSON.stringify({ id, url: `${origin}/s/${id}` }) }],
      };
    },
  );

  server.tool(
    "stash_get",
    MCP_TOOLS[1].description,
    {
      id: z
        .string()
        .describe("The 6-character base32 stash id (the token after /s/ in the share URL)"),
    },
    async ({ id }) => {
      const entry = await getStash(deps.storage, id.toUpperCase());
      if (!entry) {
        return {
          content: [{ type: "text", text: JSON.stringify(stashError("not_found", "not_found")) }],
          isError: true,
        };
      }
      if (isExpired(entry)) {
        return {
          content: [{ type: "text", text: JSON.stringify(stashError("expired", "expired")) }],
          isError: true,
        };
      }
      if (entry.enc) {
        // Zero-trust relay: the fragment key never reaches the server, so
        // relayed entries cannot be decoded server-side. Fail closed —
        // agents should fetch the plaintext via the viewer's ?id= flow or
        // use self-contained #p= links.
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                stashError(
                  "encrypted_payload",
                  "encrypted",
                  "the entry's key lives in the share URL's #<key> fragment — decrypt client-side, or use a self-contained #p= link",
                ),
              ),
            },
          ],
          isError: true,
        };
      }
      const brotli = await deps.getBrotli();
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

  server.tool(
    "stash_decode",
    MCP_TOOLS[2].description,
    {
      payload: z
        .string()
        .describe("The encoded payload token — the value after #p= or ?p=, not the full URL"),
    },
    async ({ payload }) => {
      const brotli = await deps.getBrotli();
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

/** Stateless Streamable-HTTP MCP handler. A new server + transport is
 * created per request (required since SDK 1.26 to avoid cross-client state). */
export async function handleMcpRequest(request: Request, deps: StashServerDeps): Promise<Response> {
  const url = new URL(request.url);
  const server = buildServer(url.origin, deps);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request, {
    parsedBody: await request
      .clone()
      .json()
      .catch(() => undefined),
  });
}

/** GET /.well-known/mcp-server-card — agent discovery card. */
export function serverCardResponse(origin: string): Response {
  const shortenerTools = MCP_TOOLS.map(({ name, description }) => ({ name, description }));
  const card = {
    name: "stash",
    version: "0.1.0",
    docs: `${origin}/llms.txt`,
    endpoints: [
      {
        url: `${origin}/s/{id}`,
        description:
          "Resolve a short stash id by content negotiation: ?format=json|md|txt wins, then the Accept header (application/json, text/markdown, text/plain), otherwise a 302 to the HTML viewer.",
      },
      {
        url: `${origin}/openapi.json`,
        description: "OpenAPI 3.1 specification of all HTTP endpoints.",
      },
      {
        url: `${origin}/llms.txt`,
        description: "LLM-oriented documentation for agents consuming Stash.",
      },
    ],
    // The shortener advertises only its own HTTP surface. Local surfaces:
    // the extension MCP server is browser-internal (reachable only from the
    // extension's own pages / allowlisted peers, not from desktop clients);
    // the daemon's stdio entry is the local surface for desktop MCP clients.
    servers: [
      {
        name: "stash-shortener",
        url: `${origin}/mcp`,
        transport: "streamable-http",
        tools: shortenerTools,
      },
      {
        name: "stash-extension",
        transport: "extension-port",
        portName: "mcp",
        tools: shortenerTools,
      },
      {
        name: "stash-daemon",
        transport: "stdio",
        tools: shortenerTools,
      },
    ],
    // Legacy flat fields kept for backwards compatibility with existing
    // agent integrations that read the card as a single MCP surface.
    url: `${origin}/mcp`,
    transport: "streamable-http",
    tools: shortenerTools,
  };
  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
