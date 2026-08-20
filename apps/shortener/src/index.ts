import { createStorage, type Storage } from "unstorage";
import cloudflareKVBindingDriver from "unstorage/drivers/cloudflare-kv-binding";
import { createStashServer } from "@stash/server-core";
import { getBrotli } from "./brotli";

export interface Env {
  STASH_KV?: KVNamespace;
  /** Test seam: inject an in-memory storage instead of the KV binding */
  TEST_STORAGE?: Storage;
}

const KV_PREFIX = "stash:";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const storage = env.TEST_STORAGE
      ? env.TEST_STORAGE
      : env.STASH_KV
        ? createStorage({
            driver: cloudflareKVBindingDriver({ binding: env.STASH_KV, base: KV_PREFIX }),
          })
        : (() => {
            throw new Error("STASH_KV binding missing");
          })();

    const server = createStashServer({
      storage,
      origin: new URL(request.url).origin,
      getBrotli,
    });
    return server.handle(request);
  },
};
