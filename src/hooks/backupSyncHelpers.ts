import type {
  BackupHistoryEntry,
  BackupStatus,
  JournalSnapshot,
} from "../domain/models";
import type { CloudBackupResult } from "../native/contracts";

export const INITIAL_BACKUP_STATUS: BackupStatus = {
  state: "not-configured",
  pendingItemCount: 0,
  message: "This version of the app is not connected to iCloud.",
};

export function confirmCloudDataDeletion(
  confirmAction: (message: string) => boolean,
): boolean {
  if (!confirmAction(
    "Warning: this will permanently delete your latest diary backup and every recovery point from iCloud. The diary saved on this iPad will remain. Do you want to continue?",
  )) {
    return false;
  }
  return confirmAction(
    "Final warning: your iCloud diary and recovery history cannot be recovered after deletion. Delete all iCloud diary data now?",
  );
}

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
    ...(result.backupDeviceName
      ? { backupDeviceName: result.backupDeviceName }
      : {}),
    ...(result.backupDeviceIdentifier
      ? { backupDeviceIdentifier: result.backupDeviceIdentifier }
      : {}),
    ...(result.currentDeviceName
      ? { currentDeviceName: result.currentDeviceName }
      : {}),
    ...(result.currentDeviceIdentifier
      ? { currentDeviceIdentifier: result.currentDeviceIdentifier }
      : {}),
    ...(result.contentFingerprint
      ? { contentFingerprint: result.contentFingerprint }
      : {}),
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
    myStory: snapshot.myStory,
    settings: recordableSettings,
  }, (key, value) => key === "localUri" ? undefined : value);
}

export function backupContentFingerprint(snapshot: JournalSnapshot): string {
  const content = backupContentToken(snapshot);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function historyAfterCreation(
  entries: BackupHistoryEntry[],
  created: BackupHistoryEntry,
  preserveSameDay = false,
): BackupHistoryEntry[] {
  return [
    created,
    ...entries.filter(
      (entry) =>
        entry.id !== created.id &&
        (preserveSameDay || entry.entryDay !== created.entryDay),
    ),
  ];
}
