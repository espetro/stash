import { createStorage, type Storage } from "unstorage";
import cloudflareKVBindingDriver from "unstorage/drivers/cloudflare-kv-binding";
import { createStashServer, type TelemetryEvent, type TelemetrySink } from "@stash/server-core";
import { getBrotli } from "./brotli";

export interface Env {
  STASH_KV?: KVNamespace;
  /** Test seam: inject an in-memory storage instead of the KV binding */
  TEST_STORAGE?: Storage;
  /** Workers ratelimit binding — POST /api/stash, 5/min per IP per PoP */
  RL_STASH?: RateLimit;
  /** Workers ratelimit binding — POST /mcp, 60/min per IP per PoP */
  RL_MCP?: RateLimit;
  /** Anonymous aggregate telemetry — free-tier Analytics Engine binding */
  STASH_ANALYTICS?: AnalyticsEngineDataset;
}

/** Data point layout (stable ordering, no schema enforcement by Analytics
 *  Engine so this comment is the source of truth):
 *  blobs:   [route, clientClass, ttlBucket, origin, beaconEvent ?? "", surface ?? ""]
 *  doubles: [status]
 *  indexes: [route] */
function analyticsSink(dataset: AnalyticsEngineDataset): TelemetrySink {
  return {
    record(event: TelemetryEvent) {
      dataset.writeDataPoint({
        blobs: [
          event.route,
          event.clientClass,
          event.ttlBucket,
          event.origin,
          event.beaconEvent ?? "",
          event.surface ?? "",
        ],
        doubles: [event.status],
        indexes: [event.route],
      });
    },
  };
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
      rateLimiter: { stash: env.RL_STASH, mcp: env.RL_MCP },
      maxTtl: "7d",
      telemetry: env.STASH_ANALYTICS ? analyticsSink(env.STASH_ANALYTICS) : undefined,
    });
    return server.handle(request);
  },
};
