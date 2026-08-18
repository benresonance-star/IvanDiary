import { CloudDownload, History } from "lucide-react";

import type { BackupHistoryEntry } from "../domain/models";

export function NewDeviceRecoveryDialog({
  busy,
  entries,
  message,
  onRestoreHistory,
  onRestoreLatest,
  onStartNew,
}: {
  busy: boolean;
  entries: BackupHistoryEntry[];
  message?: string;
  onRestoreHistory: (entry: BackupHistoryEntry) => void;
  onRestoreLatest: () => void;
  onStartNew: () => void;
}) {
  return (
    <div className="dialog-backdrop new-device-recovery-backdrop">
      <section aria-labelledby="new-device-recovery-heading" aria-modal="true" className="new-device-recovery-dialog" role="dialog">
        <CloudDownload aria-hidden="true" />
        <h2 id="new-device-recovery-heading">Your diary is in iCloud</h2>
        <p>This looks like a new iPad. Restore your current diary, choose an earlier recovery point, or start a new diary.</p>
        {message ? <p aria-live="polite" className="new-device-recovery-message">{message}</p> : null}
        <div className="new-device-recovery-actions">
          <button className="primary-dialog-action" disabled={busy} onClick={onRestoreLatest} type="button">
            <CloudDownload aria-hidden="true" />
            {busy ? "Restoring…" : "Restore latest diary"}
          </button>
          <button disabled={busy} onClick={onStartNew} type="button">Start a new diary</button>
        </div>
        {entries.length ? (
          <div className="new-device-history">
            <h3><History aria-hidden="true" /> Choose from History</h3>
            <ul>
              {entries.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <button disabled={busy} onClick={() => onRestoreHistory(entry)} type="button">
                    <strong>{new Date(entry.capturedAt).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</strong>
                    <span>{entry.reason === "automatic" ? "Automatic" : entry.reason === "manual" ? "Manual" : "Before restore"} · {entry.deviceName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
