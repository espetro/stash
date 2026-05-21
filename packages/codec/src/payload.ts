import { encode, decode } from "@msgpack/msgpack";
import type { SharePayload } from "./types.js";

/**
 * Serialize a v4 SharePayload to msgpack bytes.
 */
export function serializePayload(payload: SharePayload): Uint8Array {
  return encode(payload);
}

/**
 * Deserialize msgpack bytes to a v4 SharePayload.
 */
export function deserializePayload(bytes: Uint8Array): SharePayload {
  return decode(bytes) as SharePayload;
}
