import type { BackupStatus, JournalSnapshot } from "../domain/models";
import type { CloudBackupResult } from "../native/contracts";

export const INITIAL_BACKUP_STATUS: BackupStatus = {
  state: "not-configured",
  pendingItemCount: 0,
  message: "This version of the app is not connected to iCloud.",
};

export function backupResultStatus(result: CloudBackupResult): BackupStatus {
  return {
    state:
      result.state === "synced"
        ? "synced"
        : result.state === "available"
          ? "available"
          : result.state === "waiting"
            ? "waiting"
            : "error",
    pendingItemCount:
      result.state === "waiting" ? (result.failedItemCount ?? 1) : 0,
    message: result.message,
    ...(result.lastSuccessfulBackupAt
      ? { lastSuccessfulBackupAt: result.lastSuccessfulBackupAt }
      : {}),
    ...(result.accountDescription
      ? { accountDescription: result.accountDescription }
      : {}),
    ...(result.containerIdentifier
      ? { containerIdentifier: result.containerIdentifier }
      : {}),
    ...(result.databaseDescription
      ? { databaseDescription: result.databaseDescription }
      : {}),
    ...(result.recordIdentifier
      ? { recordIdentifier: result.recordIdentifier }
      : {}),
    ...(result.failedItems ? { failedItems: result.failedItems } : {}),
    ...(result.backedUpRevision === undefined
      ? {}
      : { backedUpRevision: result.backedUpRevision }),
  };
}

export function backupContentToken(snapshot: JournalSnapshot): string {
  const recordableSettings = Object.fromEntries(
    Object.entries(snapshot.settings).filter(
      ([key]) => key !== "lastSettingsTab",
    ),
  );
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    id: snapshot.id,
    days: snapshot.days,
    pages: snapshot.pages,
    sketchbooks: snapshot.sketchbooks,
    favourites: snapshot.favourites,
    settings: recordableSettings,
  });
}
