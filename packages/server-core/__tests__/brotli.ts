import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import type { BrotliFunctions } from "@stash/codec";

/** Node-native brotli for tests (no wasm fetch). */
export const testBrotli: BrotliFunctions = {
  compress: (data) => new Uint8Array(brotliCompressSync(data, { params: { quality: 5 } })),
  decompress: (data) => new Uint8Array(brotliDecompressSync(Buffer.from(data))),
};

export const getTestBrotli = async (): Promise<BrotliFunctions> => testBrotli;
