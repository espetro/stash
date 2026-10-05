import { StorageItem } from "webext-storage";
import type { StashExportRecord } from "@stash/shared/agent-export";

/**
 * One-shot handoff slot written by the background worker when the viewer
 * page sends `stash:viewer:handoff` (PR E): the records the user kept in
 * viewer localStorage before installing the extension. The Library page
 * shows a confirmation banner for it; nothing is merged until the user
 * confirms, and the slot is cleared either way.
 */
export interface PendingImport {
  records: StashExportRecord[];
  source: string;
  receivedAt: number;
}

export const PENDING_IMPORT_KEY = "pending-import";

export const pendingImportItem = new StorageItem<PendingImport | null>(PENDING_IMPORT_KEY, {
  area: "local",
  defaultValue: null,
});

export async function setPendingImport(value: PendingImport): Promise<void> {
  await pendingImportItem.set(value);
}

export async function getPendingImport(): Promise<PendingImport | null> {
  try {
    return (await pendingImportItem.get()) ?? null;
  } catch {
    return null;
  }
}

export async function clearPendingImport(): Promise<void> {
  await pendingImportItem.set(null);
}
