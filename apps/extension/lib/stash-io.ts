import { z } from "zod";
import type { StashRecord } from "./stash-store";

/**
 * Export format version (F8 bumped 1 → 2 in lockstep with the `shares[]`
 * field on `StashRecord`). v1 payloads still import via the shim in
 * `parseStashesImport`; v2 exports round-trip unchanged.
 */
const STASH_EXPORT_VERSION = 2;

const stashItemSchema = z.object({
  url: z.string(),
  title: z.string(),
});

const shareEventSchema = z.object({
  url: z.string(),
  itemCount: z.number(),
  truncated: z.boolean(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

const stashRecordSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  tags: z.array(z.string()),
  note: z.string().optional(),
  items: z.array(stashItemSchema),
  shares: z.array(shareEventSchema).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const stashExportSchema = z.object({
  version: z.literal(STASH_EXPORT_VERSION),
  stashes: z.array(stashRecordSchema),
});

/** v1 payloads differ from v2 only by the absent `shares[]` field. */
const stashExportV1Schema = stashExportSchema.extend({
  version: z.literal(1),
});

export interface StashExport {
  version: typeof STASH_EXPORT_VERSION;
  stashes: StashRecord[];
}

export function exportStashesToJSON(stashes: StashRecord[]): string {
  const payload: StashExport = { version: STASH_EXPORT_VERSION, stashes };
  return JSON.stringify(payload, null, 2);
}

export function parseStashesImport(json: string): StashRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }

  let result = stashExportSchema.safeParse(parsed);
  if (!result.success) {
    // v1 → v2 shim (F8): pre F8 exports carry no `shares[]`, so upgrading is
    // leaving the field absent. Records are still fully revalidated.
    const v1 = stashExportV1Schema.safeParse(parsed);
    if (!v1.success) {
      throw new Error("Not a valid stash export file");
    }
    result = stashExportSchema.safeParse({
      version: STASH_EXPORT_VERSION,
      stashes: v1.data.stashes,
    });
    if (!result.success) {
      throw new Error("Not a valid stash export file");
    }
  }

  return result.data.stashes;
}
