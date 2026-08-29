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
  onKeepThisIPad,
  onSaveLocalCopy,
  onUseICloud,
  settings,
  embedded = false,
}: {
  backupStatus: BackupStatus;
  commit: (operation: DocumentOperationInput) => void;
  onBackupNow: () => void;
  onCheckBackup: () => void;
  onKeepThisIPad: () => void;
  onSaveLocalCopy: () => void;
  onUseICloud: () => void;
  settings: JournalSettings;
  embedded?: boolean;
}) {
  const backupAvailable =
    backupStatus.state === "synced" || backupStatus.state === "available";

  return (
    <div
      aria-labelledby={embedded ? "backup-section-sync-heading" : "settings-tab-backup"}
      className="setting-group backup-setting-group"
      id={embedded ? "backup-section-sync-content" : "settings-panel-backup"}
      role={embedded ? "region" : "tabpanel"}
    >
      {backupAvailable ? (
        <Cloud aria-hidden="true" />
      ) : (
        <CloudOff aria-hidden="true" />
      )}
      <div>
        <h2>iCloud Sync</h2>
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
        {backupStatus.conflictDetected ? (
          <section aria-labelledby="icloud-conflict-heading" className="backup-conflict-card">
            <h3 id="icloud-conflict-heading">Two different diaries were found</h3>
            <p>
              The iCloud diary was last saved by {backupStatus.backupDeviceName ?? "another iPad"}.
              Choose which diary should become current. Nothing has been overwritten.
            </p>
            <div className="backup-conflict-actions">
              <button onClick={onUseICloud} type="button">Use the iCloud diary</button>
              <button onClick={onKeepThisIPad} type="button">Keep this iPad’s diary</button>
              <button onClick={onSaveLocalCopy} type="button">Save this iPad as a recovery point</button>
            </div>
            <p className="backup-availability-note">
              A safety recovery point is created before either diary replaces the other.
            </p>
          </section>
        ) : null}
        <p className="setting-description backup-explanation">
          Your diary is always saved on this iPad. iCloud Sync keeps the latest diary
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
        <p className="backup-availability-note">To restore an earlier version, open History below.</p>
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
                  <dt>Latest backup made by</dt>
                  <dd>{backupStatus.backupDeviceName ?? "This iPad or an older app version"}</dd>
                </div>
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
