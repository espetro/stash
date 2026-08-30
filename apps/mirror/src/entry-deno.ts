/**
 * Deno Deploy entrypoint for the mirror (F13 W5 provider decision).
 *
 * Deploy: `deployctl deploy --entrypoint src/entry-deno.ts` with env:
 *   MIRROR_STORAGE=deno-kv
 *   (optional) MIRROR_ORIGIN=https://mirror.illo.fyi — derived from the
 *   request URL when unset, which is what the discovery card advertises.
 *
 * DNS: mirror.illo.fyi terminates on Deno's IP space (not Cloudflare) —
 * that separation is the whole point of F13.
 */
import { handleMirrorRequest } from "./index";
import { resolveStorageAsync } from "./storage";

const storage = await resolveStorageAsync(
  Object.fromEntries(Object.entries(Deno.env.toObject()).filter(([k]) => k.startsWith("MIRROR_"))),
);

Deno.serve(async (request: Request) => {
  try {
    return await handleMirrorRequest(request, {
      storage,
      origin: Deno.env.get("MIRROR_ORIGIN") || undefined,
    });
  } catch (error) {
    console.error("mirror request failed:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
