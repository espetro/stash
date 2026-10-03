import { useState } from "react";
import {
  LuCloudOff,
  LuCircleAlert,
  LuRefreshCw,
  LuHardDriveDownload,
  LuCopy,
  LuCheck,
} from "react-icons/lu";
import { useSyncStatus } from "../hooks/useSyncStatus";
import type { SyncState } from "../../../lib/sync/protocol";

function formatLastSeen(ts?: number): string {
  if (!ts) return "";
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

/**
 * Daemon-offline status surface (F5.W4, spec §2.4/§4.7).
 * A persistent status line — never a modal, never a toast. Local reads,
 * writes and sharing stay fully functional in every state.
 */
export function SyncStatusBar() {
  const { status, backlog } = useSyncStatus();
  const [copied, setCopied] = useState(false);
  const state: SyncState = status.state;

  // Self-reported extension id so dev/unpacked users can point
  // `stash-daemon install --chrome-id` at it without hunting in
  // chrome://extensions. Firefox needs no --chrome-id flag.
  const extensionId = browser.runtime.id;
  const installCommand = import.meta.env.FIREFOX
    ? "stash-daemon install"
    : `stash-daemon install --chrome-id ${extensionId}`;

  async function copyInstallCommand() {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (state === "paired") {
    if (backlog > 0) {
      return (
        <div className="sync-status sync-status-pending" role="status">
          <LuRefreshCw aria-hidden /> {backlog} change{backlog === 1 ? "" : "s"} waiting to sync
        </div>
      );
    }
    return null;
  }

  if (state === "offline") {
    return (
      <div className="sync-status sync-status-offline" role="status">
        <LuCloudOff aria-hidden /> Daemon offline
        {status.lastSeenAt ? `, last seen ${formatLastSeen(status.lastSeenAt)}` : ""}. Changes will
        sync when it reconnects. If this persists, run <code>stash-daemon doctor</code>.
        {backlog > 0 && ` ${backlog} change${backlog === 1 ? "" : "s"} pending.`}
      </div>
    );
  }

  if (state === "refused_version") {
    return (
      <div className="sync-status sync-status-error" role="status">
        <LuCircleAlert aria-hidden /> Protocol version not supported (daemon:{" "}
        {status.refused?.theirs ?? status.protocolVersion ?? "unknown"}). Update one side to sync.
        Local stash is unaffected.
      </div>
    );
  }

  // disconnected: distinguish never paired (setup guidance) from backlog-only.
  return (
    <div className="sync-status sync-status-offline" role="status">
      <LuHardDriveDownload aria-hidden /> Daemon not connected. Install and run{" "}
      <code>stash-daemon</code> to sync across devices (setup: <code>stash-daemon doctor</code>).
      Saving and sharing work locally.
      {backlog > 0 && ` ${backlog} change${backlog === 1 ? "" : "s"} waiting to sync.`}
      <span className="sync-status-setup">
        Extension id: <code>{extensionId}</code>
        <button
          type="button"
          className="sync-status-copy"
          onClick={copyInstallCommand}
          title={installCommand}
        >
          {copied ? <LuCheck aria-hidden /> : <LuCopy aria-hidden />}
          {copied ? "Copied" : "Copy install command"}
        </button>
      </span>
    </div>
  );
}
