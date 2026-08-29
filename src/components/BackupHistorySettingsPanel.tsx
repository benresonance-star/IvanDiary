import { History, RotateCcw, Trash2 } from "lucide-react";

import type { BackupHistoryEntry, BackupHistoryStatus } from "../domain/models";

function entryLabel(entry: BackupHistoryEntry): string {
  return new Date(entry.capturedAt).toLocaleString([], {
    dateStyle: "full",
    timeStyle: "short",
  });
}

function reasonLabel(entry: BackupHistoryEntry): string {
  if (entry.reason === "before-restore") return "Before restore";
  if (entry.reason === "manual") return "Manual recovery point";
  return "Automatic recovery point";
}

export function BackupHistorySettingsPanel({
  historyStatus,
  onCreate,
  onDelete,
  onRefresh,
  onRestore,
  embedded = false,
}: {
  historyStatus: BackupHistoryStatus;
  onCreate: () => void;
  onDelete: (entry: BackupHistoryEntry) => void;
  onRefresh: () => void;
  onRestore: (entry: BackupHistoryEntry) => void;
  embedded?: boolean;
}) {
  const busy = historyStatus.state === "creating" || historyStatus.state === "restoring";
  return (
    <div aria-labelledby={embedded ? "backup-section-history-heading" : "settings-tab-history"} className="setting-group history-setting-group" id={embedded ? "backup-section-history-content" : "settings-panel-history"} role={embedded ? "region" : "tabpanel"}>
      <History aria-hidden="true" />
      <div>
        <h2>Backup history</h2>
        <p className="setting-description">
          Recovery points are separate from iCloud Sync. History keeps the last 5 entry days and one recovery point per week for 12 weeks.
        </p>
        <div className="history-actions">
          <button className="backup-now-action" disabled={busy} onClick={onCreate} type="button">
            {historyStatus.state === "creating" ? "Creating…" : "Create recovery point"}
          </button>
          <button className="backup-setup-action" disabled={busy} onClick={onRefresh} type="button">Refresh history</button>
        </div>
        {historyStatus.message ? <p aria-live="polite" className="backup-availability-note">{historyStatus.message}</p> : null}
        {historyStatus.state === "loading" ? <p>Loading recovery points…</p> : null}
        {historyStatus.state !== "loading" && historyStatus.entries.length === 0 ? (
          <div className="history-empty"><h3>No recovery points yet</h3><p>Create one now, or allow automatic iCloud Sync to finish.</p></div>
        ) : (
          <ul className="history-list">
            {historyStatus.entries.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entryLabel(entry)}</strong>
                  <span>{reasonLabel(entry)} · {entry.deviceName}</span>
                  <span>{entry.assetCount} files</span>
                </div>
                <div className="history-entry-actions">
                  <button aria-label={`Restore recovery point from ${entryLabel(entry)}`} disabled={busy} onClick={() => onRestore(entry)} type="button"><RotateCcw aria-hidden="true" /> Restore</button>
                  <button aria-label={`Delete recovery point from ${entryLabel(entry)}`} disabled={busy} onClick={() => onDelete(entry)} type="button"><Trash2 aria-hidden="true" /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
