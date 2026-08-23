/**
 * Node shim for brotli-wasm. Its export map sends the "import" condition
 * to index.web.js, which fetches the wasm over HTTP at module init and
 * crashes plain-node tsx runs. This shim is aliased in tsconfig paths so
 * any transitive "brotli-wasm" import (via @stash/shared) resolves to
 * node-native zlib instead.
 */
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

export default Promise.resolve({
  compress: (data: Uint8Array, _opts?: unknown): Uint8Array =>
    new Uint8Array(brotliCompressSync(data, { params: { [0]: 5 } as never })),
  decompress: (data: Uint8Array): Uint8Array =>
    new Uint8Array(brotliDecompressSync(Buffer.from(data))),
});
