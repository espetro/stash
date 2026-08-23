/**
 * Local stand-in for the viewer's Cloudflare Pages function `GET /s`
 * (apps/viewer/functions/s.ts), for the agent-flow e2e specs.
 *
 * Why: Playwright's webServer runs `astro preview`, which serves the
 * static build only; the Pages Function that implements the
 * `?p=&format=` agent endpoints does not execute locally. Rather than
 * re-implement the agent surface (drift risk), we import the real
 * `onRequest` handler and drive it with standard `Request` objects —
 * the same contract Cloudflare's runtime provides.
 *
 * `context.next()` (the HTML fallthrough when no `p=` is given) is
 * served by proxying to the running astro preview, so the helper
 * covers the full surface.
 */

import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { VIEWER_ORIGIN } from "./encoder-helper";

let _server: http.Server | null = null;
let _baseUrl = "";

/**
 * Start (or reuse) the agent-fetch server. Returns the base URL
 * agents should target, e.g. http://127.0.0.1:<port>.
 */
let _registered = false;

/**
 * Register the wasm loader hook once (mirrors the viewer vitest
 * plugin). Playwright's tsx pipeline can swallow register() hooks
 * under some runners, so a failed registration falls back to a
 * data-URL copy of the same hook.
 */
function ensureWasmLoader(): void {
  if (_registered) return;
  const here = path.dirname(new URL(import.meta.url).pathname);
  const loaderUrl = pathToFileURL(path.join(here, "wasm-loader.mjs")).href;
  try {
    register(loaderUrl);
  } catch {
    register(`data:text/javascript,${encodeURIComponent(WASM_LOADER_SRC)}`);
  }
  _registered = true;
}

const WASM_LOADER_SRC = `
import { readFile } from "node:fs/promises";
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".wasm")) {
    return { shortCircuit: true, url: new URL(specifier, context.parentURL).href };
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith(".wasm")) {
    const bytes = await readFile(new URL(url));
    return {
      shortCircuit: true,
      format: "module",
      source: "const b64=" + JSON.stringify(bytes.toString("base64"))
        + ";export default Uint8Array.from(atob(b64),c=>c.charCodeAt(0));",
    };
  }
  return nextLoad(url, context);
}
`;

export async function agentFetchServer(): Promise<string> {
  if (_server) return _baseUrl;
  ensureWasmLoader();
  const server = http.createServer(async (req, res) => {
    try {
      // Resolve the real handler from the viewer package at runtime.
      const here = path.dirname(new URL(import.meta.url).pathname);
      const mod = (await import(
        pathToFileURL(path.resolve(here, "../../../apps/viewer/functions/s.ts")).href
      )) as {
        onRequest: (ctx: unknown) => Promise<Response>;
      };
      const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      }
      const body = ["GET", "HEAD"].includes(req.method ?? "GET")
        ? undefined
        : (req as unknown as BodyInit);
      const request = new Request(url, { method: req.method, headers, body });
      const ctx = {
        request,
        next: async () => {
          // No payload / no negotiated format: fall through to the SPA
          // served by astro preview.
          return fetch(VIEWER_ORIGIN + (req.url ?? "/"), {
            method: req.method,
            headers: { Accept: req.headers.accept ?? "*/*" },
          });
        },
      };
      const response = await mod.onRequest(ctx);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (error) {
      const err = error as Error;
      const message = `${err.message}\n${err.stack ?? ""}`;
      console.error("[agent-fetch-server]", message);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`agent-fetch server error: ${err.message}`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as net.AddressInfo;
  _server = server;
  _baseUrl = `http://127.0.0.1:${addr.port}`;
  return _baseUrl;
}

/** Test-only teardown. */
export async function closeAgentFetchServer(): Promise<void> {
  if (_server) {
    await new Promise<void>((resolve) => _server!.close(() => resolve()));
    _server = null;
  }
}
