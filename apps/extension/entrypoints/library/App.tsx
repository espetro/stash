import { useCallback, useEffect, useState } from "react";
import { LuLibrary, LuSettings } from "react-icons/lu";
import LibraryView from "./components/LibraryView";
import SettingsView from "./components/SettingsView";
import { PendingImportBanner } from "./components/PendingImportBanner";
import { BackupHint } from "./components/BackupHint";
import { SyncStatusBar } from "../../components/library/SyncStatusBar";
import { exportStashesToJSON } from "../../lib/stash-io";
import { listStashes } from "../../lib/stash-store";

type LibraryTab = "library" | "settings";

function tabFromHash(hash: string): LibraryTab {
  return hash === "#settings" ? "settings" : "library";
}

export default function App() {
  const [tab, setTab] = useState<LibraryTab>(() => tabFromHash(window.location.hash));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectTab = (next: LibraryTab) => {
    window.location.hash = next === "settings" ? "#settings" : "#library";
    setTab(next);
  };

  const handleExport = useCallback(async () => {
    const stashes = await listStashes();
    const json = exportStashesToJSON(stashes);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stash-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="library-page">
      <header className="library-header">
        <h1>Stash Library</h1>
        <nav className="library-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "library"}
            className={`library-tab${tab === "library" ? " active" : ""}`}
            onClick={() => selectTab("library")}
          >
            <LuLibrary aria-hidden /> Library
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "settings"}
            className={`library-tab${tab === "settings" ? " active" : ""}`}
            onClick={() => selectTab("settings")}
          >
            <LuSettings aria-hidden /> Settings
          </button>
        </nav>
      </header>

      <PendingImportBanner onImported={() => setRefreshKey((k) => k + 1)} />

      {tab === "library" ? (
        <main key={refreshKey}>
          <SyncStatusBar />
          <BackupHint onExport={() => void handleExport()} />
          <LibraryView />
        </main>
      ) : (
        <SettingsView />
      )}
    </div>
  );
}
