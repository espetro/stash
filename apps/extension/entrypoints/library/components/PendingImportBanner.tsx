import { useCallback, useEffect, useState } from "react";
import { LuDownload, LuX } from "react-icons/lu";
import { isStashExport } from "@stash/shared/agent-export";
import {
  clearPendingImport,
  getPendingImport,
  PENDING_IMPORT_KEY,
  type PendingImport,
} from "../../../lib/pending-import";
import { importStashes, type StashRecord } from "../../../lib/stash-store";
import { recordEvent } from "../../../lib/telemetry";

function toStashRecord(rec: PendingImport["records"][number]): StashRecord {
  return {
    id: rec.id,
    title: rec.title ?? undefined,
    tags: [...rec.tags],
    note: rec.note ?? undefined,
    items: rec.items,
    kept: rec.kept !== false,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Confirmation banner for the viewer→extension handoff (PR E): the
 * viewer parked its localStorage records under `pending-import`; the
 * user reviews and confirms here. Confirm or dismiss, the slot clears.
 */
export function PendingImportBanner({ onImported }: { onImported: () => void }) {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const value = await getPendingImport();
    setPending(value && value.records.length > 0 ? value : null);
  }, []);

  useEffect(() => {
    void reload();
    const onStorage = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName === "local" && changes[PENDING_IMPORT_KEY]) void reload();
    };
    browser.storage.onChanged.addListener(onStorage);
    return () => browser.storage.onChanged.removeListener(onStorage);
  }, [reload]);

  async function handleConfirm() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      // Re-validate the payload shape before merging — the slot is
      // extension-internal but the writer is a relayed page message.
      const records = pending.records
        .filter((r) => isStashExport({ version: 1, source: "viewer-local", stashes: [r] }))
        .map(toStashRecord);
      const added = await importStashes(records);
      recordEvent("viewer_handoff_imported");
      setDone(`Imported ${added.length} ${added.length === 1 ? "stash" : "stashes"}`);
      onImported();
    } finally {
      await clearPendingImport();
      setPending(null);
      setBusy(false);
      setTimeout(() => setDone(null), 4000);
    }
  }

  async function handleDismiss() {
    await clearPendingImport();
    setPending(null);
  }

  if (done) {
    return (
      <div className="pending-import-banner pending-import-done" role="status">
        <LuDownload aria-hidden /> {done}
      </div>
    );
  }
  if (!pending) return null;

  return (
    <div className="pending-import-banner" role="status">
      <LuDownload aria-hidden />
      <span>
        {pending.records.length} {pending.records.length === 1 ? "stash" : "stashes"} from the Stash
        website are ready to import into this profile's library.
      </span>
      <button type="button" className="stash-row-action" onClick={handleConfirm} disabled={busy}>
        {busy ? "Importing..." : "Import"}
      </button>
      <button
        type="button"
        className="stash-header-btn"
        onClick={handleDismiss}
        aria-label="Dismiss import"
        title="Dismiss"
      >
        <LuX />
      </button>
    </div>
  );
}
