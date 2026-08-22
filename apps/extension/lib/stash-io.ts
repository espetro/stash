import { z } from "zod";
import type { StashRecord } from "./stash-store";

const STASH_EXPORT_VERSION = 1;

const stashItemSchema = z.object({
  url: z.string(),
  title: z.string(),
});

const stashRecordSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  tags: z.array(z.string()),
  note: z.string().optional(),
  items: z.array(stashItemSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const stashExportSchema = z.object({
  version: z.literal(STASH_EXPORT_VERSION),
  stashes: z.array(stashRecordSchema),
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

  const result = stashExportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Not a valid stash export file");
  }

  return result.data.stashes;
}
