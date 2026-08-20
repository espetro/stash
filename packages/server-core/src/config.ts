import type { Storage } from "unstorage";
import type { BrotliFunctions } from "@stash/codec";

/** Ports every runtime adapter must supply. */
export interface StashServerConfig {
  /** unstorage instance (KV binding, browser.storage.local, memory…) */
  storage: Storage;
  /** Reported origin for share URLs and the MCP server card. */
  origin: string;
  /** Lazily-loaded brotli (worker: vendored wasm; extension: @stash/shared). */
  getBrotli: () => Promise<BrotliFunctions>;
}

/** The resolved set of dependencies passed through routing and MCP layers. */
export interface StashServerDeps {
  storage: Storage;
  origin: string;
  getBrotli: () => Promise<BrotliFunctions>;
}
