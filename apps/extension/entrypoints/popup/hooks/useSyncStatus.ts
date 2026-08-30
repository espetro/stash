import { useCallback, useEffect, useState } from "react";
import { useStashes } from "./useStashes";
import { POPUP_INVALIDATE_MESSAGE } from "../../../lib/sync/sync-client";
import type { SyncStatusMeta } from "../../../lib/sync/protocol";
import { SYNC_STATUS_KEY } from "../../../lib/sync/protocol";
import { outboxSize } from "../../../lib/sync/outbox";

export interface SyncUiState {
  status: SyncStatusMeta;
  backlog: number;
}

const NEVER_PAIRED: SyncStatusMeta = { state: "disconnected" };

/**
 * Popup-side sync status (F5.W4): reads persisted sync metadata from
 * browser.storage.local (written by the background SyncClient) and refreshes
 * whenever the background materializes daemon changes or storage changes.
 * Non-blocking: popup reads/writes work identically in every sync state.
 */
export function useSyncStatus(): SyncUiState {
  const { refresh } = useStashes();
  const [status, setStatus] = useState<SyncStatusMeta>(NEVER_PAIRED);
  const [backlog, setBacklog] = useState(0);

  const reload = useCallback(async () => {
    try {
      const raw = await browser.storage.local.get(SYNC_STATUS_KEY);
      setStatus((raw?.[SYNC_STATUS_KEY] as SyncStatusMeta | undefined) ?? NEVER_PAIRED);
    } catch {
      setStatus(NEVER_PAIRED);
    }
    setBacklog(await outboxSize().catch(() => 0));
  }, []);

  useEffect(() => {
    void reload();
    const onStorage = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== "local") return;
      if (changes[SYNC_STATUS_KEY]) void reload();
    };
    browser.storage.onChanged.addListener(onStorage);
    const onMessage = (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: string }).type === POPUP_INVALIDATE_MESSAGE
      ) {
        void refresh();
        void reload();
      }
      return false;
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      browser.storage.onChanged.removeListener(onStorage);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [reload, refresh]);

  return { status, backlog };
}
