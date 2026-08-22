#!/usr/bin/env node
/**
 * Tiny stdio MCP server fixture used by `__tests__/relay.test.ts`.
 * Exposes two tools (`echo`, `add`) and responds to `tools/list` +
 * `tools/call`. Prints its label arg to stderr so test logs can
 * attribute output to a specific instance.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const label = process.argv[2] ?? "anon";
process.stderr.write(`[echoServer ${label}] booting\n`);

const server = new McpServer(
  { name: `echo-server-${label}`, version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.tool(
  "echo",
  "Echo back the `text` argument verbatim.",
  { text: z.string() },
  async ({ text }) => ({
    content: [{ type: "text", text: `echo:${text}` }],
  }),
);

server.tool(
  "add",
  "Add two numbers.",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: `sum:${a + b}` }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[echoServer ${label}] connected\n`);
