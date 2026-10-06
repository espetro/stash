/** Stable, machine-checkable error contract for all stash HTTP surfaces.
 *
 * Every JSON error body is `{ error, code, hint? }`:
 *  - `error` — human-readable message (free-form; not part of the contract)
 *  - `code`  — stable snake_case token agents can switch on
 *  - `hint`  — actionable recovery: the corrected call shape or next step
 *
 * Contract precision beats prose: agents recover from `code`+`hint` without
 * parsing English. Keep the union exhaustive; document it in llms.txt.
 */
export const STASH_ERROR_CODES = [
  "invalid_json",
  "invalid_beacon",
  "missing_field",
  "conflicting_fields",
  "payload_too_large",
  "invalid_ciphertext",
  "unknown_prefix",
  "invalid_payload",
  "invalid_ttl",
  "ttl_exceeded",
  "id_collision",
  "invalid_id",
  "unknown_format",
  "not_found",
  "expired",
  "encrypted_payload",
  "rate_limited",
  "internal",
] as const;

export type StashErrorCode = (typeof STASH_ERROR_CODES)[number];

export interface StashErrorBody {
  error: string;
  code: StashErrorCode;
  hint?: string;
}

export function stashError(code: StashErrorCode, error: string, hint?: string): StashErrorBody {
  return hint ? { error, code, hint } : { error, code };
}
