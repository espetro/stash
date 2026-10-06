import { LuHardDriveDownload } from "react-icons/lu";
import { useSyncStatus } from "../hooks/useSyncStatus";

/**
 * Never-paired backup hint (PR E §1.1): while the profile has never
 * seen a daemon, the local library is the only copy — nudge toward the
 * daemon or a JSON export. Hidden once any pairing state exists.
 */
export function BackupHint({ onExport }: { onExport: () => void }) {
  const { status } = useSyncStatus();
  // "Never paired" is broader than `disconnected`: a failed handshake
  // leaves the profile `offline`/`refused_version` with no daemonId.
  // daemonId is only ever written on a completed pairing.
  if (status.daemonId) return null;

  return (
    <div className="backup-hint" role="status">
      <LuHardDriveDownload aria-hidden />
      <span>
        Not backed up: this library only lives in this browser profile. Install the Stash daemon or{" "}
        <button type="button" className="backup-hint-link" onClick={onExport}>
          export a copy
        </button>
        .
      </span>
    </div>
  );
}
