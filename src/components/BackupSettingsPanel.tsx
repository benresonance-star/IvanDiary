import { ChevronDown, Cloud, CloudOff } from "lucide-react";

import type {
  BackupStatus,
  DocumentOperationInput,
  JournalSettings,
} from "../domain/models";
import { SettingToggle } from "./SettingToggle";

export function BackupSettingsPanel({
  backupStatus,
  commit,
  onBackupNow,
  onCheckBackup,
  onRestore,
  settings,
}: {
  backupStatus: BackupStatus;
  commit: (operation: DocumentOperationInput) => void;
  onBackupNow: () => void;
  onCheckBackup: () => void;
  onRestore: () => void;
  settings: JournalSettings;
}) {
  const backupAvailable =
    backupStatus.state === "synced" || backupStatus.state === "available";

  return (
    <div
      aria-labelledby="settings-tab-backup"
      className="setting-group backup-setting-group"
      id="settings-panel-backup"
      role="tabpanel"
    >
      {backupAvailable ? (
        <Cloud aria-hidden="true" />
      ) : (
        <CloudOff aria-hidden="true" />
      )}
      <div>
        <h2>iCloud backup</h2>
        <div
          className="backup-status-card"
          data-state={backupStatus.state}
          role="status"
        >
          {backupAvailable ? (
            <Cloud aria-hidden="true" />
          ) : (
            <CloudOff aria-hidden="true" />
          )}
          <div>
            <strong>
              {backupStatus.state === "syncing"
                ? "Backup in progress"
                : backupStatus.state === "waiting"
                  ? "Backup needs attention"
                  : backupStatus.state === "synced"
                    ? "Backup is up to date"
                    : backupStatus.state === "available"
                      ? "Backup is ready"
                      : "Backup is not connected"}
            </strong>
            <p>{backupStatus.message}</p>
          </div>
        </div>
        <p className="setting-description backup-explanation">
          Your diary is always saved on this iPad. iCloud backup includes diary
          information, original recordings, photos and drawings.
        </p>
        <button
          className="backup-setup-action"
          disabled={backupStatus.state === "syncing"}
          onClick={onCheckBackup}
          type="button"
        >
          Check iCloud connection
        </button>
        <button
          className="backup-now-action"
          disabled={
            backupStatus.state === "syncing" || backupStatus.state === "error"
          }
          onClick={onBackupNow}
          type="button"
        >
          {backupStatus.state === "syncing"
            ? "Backing up…"
            : "Back up diary information now"}
        </button>
        <button
          className="backup-restore-action"
          disabled={
            backupStatus.state === "syncing" ||
            !backupStatus.lastSuccessfulBackupAt
          }
          onClick={onRestore}
          type="button"
        >
          Restore diary from iCloud
        </button>
        <details className="backup-details">
          <summary>
            Backup details <ChevronDown aria-hidden="true" />
          </summary>
          <div>
            {backupStatus.lastSuccessfulBackupAt ? (
              <p className="backup-availability-note">
                Last diary information backup:{" "}
                {new Date(
                  backupStatus.lastSuccessfulBackupAt,
                ).toLocaleString()}
              </p>
            ) : (
              <p className="backup-availability-note">
                No successful iCloud backup has been recorded yet.
              </p>
            )}
            <div className="backup-location-details">
              <h3>iCloud storage details</h3>
              <dl>
                <div>
                  <dt>iCloud account</dt>
                  <dd>
                    {backupStatus.accountDescription ??
                      "Account details unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Container</dt>
                  <dd>
                    {backupStatus.containerIdentifier ?? "Not connected"}
                  </dd>
                </div>
                <div>
                  <dt>Database</dt>
                  <dd>
                    {backupStatus.databaseDescription ?? "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Diary record</dt>
                  <dd>
                    {backupStatus.recordIdentifier ?? "Not created yet"}
                  </dd>
                </div>
                <div>
                  <dt>File location</dt>
                  <dd>
                    Stored securely inside CloudKit. It does not appear as a
                    folder in iCloud Drive or the Files app.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </details>
        {backupStatus.failedItems?.length ? (
          <div
            aria-labelledby="backup-waiting-heading"
            className="backup-failed-items"
          >
            <h3 id="backup-waiting-heading">Files still waiting</h3>
            <p>
              These originals remain on this iPad and will be retried the next
              time you back up.
            </p>
            <ul>
              {backupStatus.failedItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <strong>
                    {item.kind === "audio"
                      ? "Voice recording"
                      : item.kind === "photo"
                        ? "Photo"
                        : item.kind === "drawing"
                          ? "Drawing"
                          : "File"}
                  </strong>
                  <code>{item.id}</code>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <h3>Backup preferences</h3>
        <SettingToggle
          checked={settings.automaticBackup}
          description="Automatically back up changes after you finish editing. Failed items retry after the next change or app launch."
          label="Automatic backup"
          onChange={(automaticBackup) =>
            commit({
              type: "settings-update",
              settings: { automaticBackup },
            })
          }
        />
        <SettingToggle
          checked={settings.backupOnWifiOnly}
          description="Wait for Wi-Fi before uploading recordings, drawings and photos."
          label="Use Wi-Fi for large files"
          onChange={(backupOnWifiOnly) =>
            commit({
              type: "settings-update",
              settings: { backupOnWifiOnly },
            })
          }
        />
      </div>
    </div>
  );
}
