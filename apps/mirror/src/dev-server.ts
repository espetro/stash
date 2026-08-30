/**
 * Node dev/preview server for the mirror app (local smoke tests and
 * self-hosting). Production mirror deploys use src/entry-deno.ts.
 */
import { createServer } from "node:http";
import { handleMirrorRequest } from "./index";
import { resolveStorageAsync } from "./storage";

const port = Number(process.env.PORT ?? 8787);

const storage = await resolveStorageAsync(process.env);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : Buffer.concat(chunks),
  });
  const response = await handleMirrorRequest(request, {
    storage,
    origin: process.env.MIRROR_ORIGIN || undefined,
  });
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
});

server.listen(port, () => {
  console.log(`stash mirror listening on http://localhost:${port}`);
});
