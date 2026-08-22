# `@stash/mcp-relay`

A small stdio JSON-RPC relay that bridges desktop MCP clients
([Claude Desktop], [Cursor], …) to the stash browser extension's
local MCP server.

The binary reads newline-delimited JSON-RPC frames from `stdin`,
forwards them to the extension over a local TCP socket, and pipes
the extension's replies back to `stdout`. From the parent's point
of view, `stash-mcp-relay` looks like a normal MCP stdio server.

## Status

The relay's transport plumbing, lifecycle, and round-trip tests are
shipped. The extension-side endpoint that `STASH_RELAY_PORT` is
expected to advertise is **not yet wired up** — that work lands in
PR6. Until then, running this binary without `STASH_RELAY_PORT`
exits cleanly with a readable error rather than hanging the parent.

## Install

```sh
pnpm add -D @stash/mcp-relay
# or, if you publish binaries:
npx -y @stash/mcp-relay
```

## Configure your MCP client

### Claude Desktop

Add this entry to `claude_desktop_config.json` (typically at
`~/Library/Application Support/Claude/claude_desktop_config.json` on
macOS):

```json
{
  "mcpServers": {
    "stash": {
      "command": "npx",
      "args": ["-y", "@stash/mcp-relay"],
      "env": {
        "STASH_RELAY_PORT": "4317"
      }
    }
  }
}
```

The relay itself trusts the parent process — i.e. it relies on the
local-user trust model that Claude Desktop already enforces. No
auth, no token. (Decision recorded in the
[planning sheet](../../.omo/plans/).)

### Cursor

Cursor reads the same JSON shape from its MCP server settings. The
`command` and `args` are the same; only the location of the config
differs.

## Environment

| Name                | Required | Purpose                                                           |
| ------------------- | -------- | ----------------------------------------------------------------- |
| `STASH_RELAY_PORT`  | yes      | TCP port on `127.0.0.1` that the stash extension will listen on.  |

If `STASH_RELAY_PORT` is unset or invalid, the relay exits within a
few hundred milliseconds with a clear error on stderr and a
non-zero status. It will not hang the parent.

## Architecture

```
   Claude Desktop  ─── stdin/stdout ───▶  stash-mcp-relay  ─── TCP ──▶  Extension (port STASH_RELAY_PORT)
       (MCP client)                       (frame pump)                       (MCP server)
```

The relay doesn't speak MCP itself — it doesn't run an SDK
`Client` or `Server`. It just forwards JSON-RPC frames in both
directions. The parent is the MCP client, the extension is the MCP
server, and the relay is a fire-and-forget pump.

Frame format is the same one Claude Desktop and the SDK use:
newline-delimited UTF-8 JSON, one `JSONRPCMessage` per line.

## Development

```sh
pnpm --filter @stash/mcp-relay run tscheck   # typecheck
pnpm --filter @stash/mcp-relay run test      # vitest (relay + transport unit tests + stdio round-trip)
pnpm --filter @stash/mcp-relay run build     # tsc -p tsconfig.build.json
pnpm --filter @stash/mcp-relay run lint      # oxlint
pnpm --filter @stash-mcp-relay run format   # oxfmt
```

The relay's tests cover:

- **Mocked transport forwarding** — frames arriving on `onmessage`
  one side get written to the other side's wire.
- **`done` promise + `teardown`** — the relay resolves cleanly when
  either side closes, and `teardown()` restores the original
  `onmessage` handlers so the transports can be reused.
- **Real MCP round-trip** — the SDK `Client` and a fixture MCP
  server (`__tests__/fixtures/echoServer.mjs`) prove the relay
  forwards `tools/list` and `tools/call` end-to-end.

[Claude Desktop]: https://modelcontextprotocol.io/
[Cursor]: https://cursor.com/

## Package layout

| Path                              | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `src/cli.ts`                      | Binary entrypoint (`stash-mcp-relay`). Wires stdio ↔ upstream.  |
| `src/stdioTransport.ts`           | `process.stdin` / `process.stdout` ↔ MCP `Transport`.           |
| `src/extensionTransport.ts`       | TCP `127.0.0.1:STASH_RELAY_PORT` ↔ MCP `Transport`, with a fallback `NeverConnectsTransport` for clear errors when the env is missing. |
| `src/relay.ts`                    | Generic JSON-RPC frame pump for any two MCP transports.         |
| `__tests__/relay.test.ts`         | Relay forwarding + MCP round-trip tests.                        |
| `__tests__/stdioTransport.test.ts` | Line-framing tests for `StdioTransport`.                       |
| `__tests__/extensionTransport.test.ts` | Env-var / fallback behaviour for `extensionTransportFromEnv`. |
| `__tests__/fixtures/echoServer.mjs` | Tiny stdio MCP server used as a test peer.                    |
