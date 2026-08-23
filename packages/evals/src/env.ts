/** Shared setup: fixtures, llms.txt, local viewer preview, shortener. */
import { readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as path from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { getBrotliFunctions } from "@stash/shared";
import { createStashServer, type StashServer } from "@stash/server-core";
import { loadPayloadFixtures, type PayloadFixture } from "@stash/shared/fixtures";
import fixturesJson from "@stash/shared/fixtures/payloads.json";

export const VIEWER_ORIGIN = "http://localhost:4321";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));

export function loadFixtures(): PayloadFixture[] {
  return loadPayloadFixtures(fixturesJson);
}

export function fixture(name: string): PayloadFixture {
  const f = loadFixtures().find((x) => x.name === name);
  if (!f) throw new Error(`missing fixture: ${name}`);
  return f;
}

/** Read apps/viewer/public/llms.txt from disk, as an agent would fetch it. */
export function readLlmsTxt(): string {
  return readFileSync(fileURLToPath(new URL("../../../apps/viewer/public/llms.txt", import.meta.url)), "utf8");
}

async function waitForPort(port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/llms.txt`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`viewer preview did not come up on port ${port}`);
}

export interface SpawnedViewer {
  origin: string;
  stop(): Promise<void>;
}

/** Boot `astro preview` for the viewer (or reuse it if already running). */
export async function bootViewer(): Promise<SpawnedViewer> {
  try {
    const res = await fetch(`${VIEWER_ORIGIN}/llms.txt`);
    if (res.ok) return { origin: VIEWER_ORIGIN, stop: async () => {} };
  } catch {
    // boot below
  }
  const child: ChildProcess = spawn(
    "pnpm",
    ["--filter", "stash-viewer", "exec", "astro", "preview", "--port", "4321"],
    { cwd: pkgRoot, stdio: "ignore", detached: true },
  );
  await waitForPort(4321);
  return {
    origin: VIEWER_ORIGIN,
    stop: async () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    },
  };
}

/**
 * Boot a loopback server that fronts the REAL viewer Pages Function
 * handler (apps/viewer/functions/s.ts). astro preview does not execute
 * Pages Functions, so `GET /s?p=&format=json` on :4321 would serve the
 * HTML shell and break agent evals. We import the actual `onRequest`
 * and proxy `context.next()` to the preview server, reusing the e2e
 * helper so the eval surface can never drift from the tested one.
 *
 * Returns the origin the evals should hand to the model.
 */
/**
 * Node loader hook that turns bare `.wasm` imports into base64-encoded
 * default exports (mirrors the e2e agent-fetch-server helper). Without
 * it Node treats the vendored brotli wasm as JS and fails with
 * "Cannot find package 'wbg'".
 */
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

let _wasmLoaderRegistered = false;
function ensureWasmLoader(): void {
  if (_wasmLoaderRegistered) return;
  register(`data:text/javascript,${encodeURIComponent(WASM_LOADER_SRC)}`);
  _wasmLoaderRegistered = true;
}

export async function bootAgentViewer(): Promise<SpawnedViewer> {
  await bootViewer();
  ensureWasmLoader();
  const mod = (await import(
    pathToFileURL(path.resolve(pkgRoot, "../../apps/viewer/functions/s.ts")).href
  )) as { onRequest: (ctx: unknown) => Promise<Response> };
  const server = createServer(async (req, res) => {
    try {
      const url = `http://localhost${req.url ?? "/"}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(", "));
      }
      const request = new Request(url, { method: req.method ?? "GET", headers });
      const ctx = {
        request,
        next: async () =>
          fetch(VIEWER_ORIGIN + (req.url ?? "/"), {
            method: req.method,
            headers: { Accept: req.headers.accept ?? "*/*" },
          }),
      };
      const response = (await mod.onRequest(ctx)) as Response;
      const out = Buffer.from(await response.arrayBuffer());
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.statusCode = response.status;
      res.end(out);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`agent viewer error: ${(error as Error).message}`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export interface SpawnedShortener {
  origin: string;
  stop(): Promise<void>;
}

/**
 * Boot createStashServer on an ephemeral node port, seeded with a stash
 * created via its POST /api/stash route. Returns the short URL origin.
 */
export async function bootShortener(payload: string): Promise<SpawnedShortener> {
  const storage = createStorage({ driver: memoryDriver() });
  const server: StashServer = createStashServer({
    storage,
    origin: "http://localhost",
    getBrotli: getBrotliFunctions,
  });
  const http = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const url = `http://localhost${req.url}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
      }
      const response = await server.handle(
        body ? new Request(url, { method: req.method, headers, body }) : new Request(url, { method: req.method, headers }),
      );
      const out = Buffer.from(await response.arrayBuffer());
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.statusCode = response.status;
      res.end(out);
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const port = address.port;
  const origin = `http://127.0.0.1:${port}`;

  const createRes = await fetch(`${origin}/api/stash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, ttl: "1d" }),
  });
  if (createRes.status !== 201) {
    http.close();
    throw new Error(`POST /api/stash failed: ${createRes.status}`);
  }
  return {
    origin,
    stop: () =>
      new Promise<void>((resolve) => {
        http.close();
        storage.clear().finally(() => resolve());
      }),
  };
}
