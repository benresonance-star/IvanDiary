import { Network } from "@capacitor/network";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { reconcileCloudRestore } from "../domain/cloudRestore";
import type {
  AssetRef,
  BackupHistoryEntry,
  BackupHistoryReason,
  BackupHistoryStatus,
  BackupStatus,
  JournalSnapshot,
} from "../domain/models";
import type { JournalServices } from "../native/composition";
import type {
  CloudBackupAsset,
  CloudBackupPlugin,
} from "../native/contracts";
import {
  flushNativeDrawingOverlay,
  getNativeDrawingPreview,
  hasNativePencilKit,
} from "../native/pencilKit";
import {
  PROFILE_PORTRAIT_DOCUMENT_ID,
  WELCOME_DRAWING_DOCUMENT_ID,
} from "../sketch/specialDocuments";
import {
  backupContentToken,
  backupContentFingerprint,
  backupResultStatus,
  confirmCloudDataDeletion,
  historyAfterCreation,
  INITIAL_BACKUP_STATUS,
} from "./backupSyncHelpers";

const STATUS_CHECK_ERROR: BackupStatus = {
  state: "error",
  pendingItemCount: 1,
  message:
    "The iCloud connection could not be checked. Your diary remains saved on this iPad.",
};

export async function collectCloudBackupAssets(
  snapshot: JournalSnapshot,
): Promise<CloudBackupAsset[]> {
  const assets = new Map<string, CloudBackupAsset>();
  const addAsset = (asset: AssetRef, kind: "audio" | "photo") => {
    if (asset.localUri.startsWith("demo://")) {
      return;
    }
    assets.set(asset.id, {
      id: asset.id,
      kind,
      localUri: asset.localUri,
      mimeType: asset.mimeType,
      checksum: asset.checksum,
    });
  };

  for (const page of snapshot.pages) {
    for (const object of page.objects) {
      if (object.type === "voice") {
        addAsset(object.asset, "audio");
      }
      if (object.type === "photo") {
        addAsset(object.asset, "photo");
      }
    }
  }
  for (const word of snapshot.settings.myWords) {
    if (word.sample) {
      addAsset(word.sample, "audio");
    }
  }
  for (const page of snapshot.myStory?.pages ?? []) {
    for (const photo of page.photos) {
      addAsset(photo.asset, "photo");
    }
    for (const recording of page.recordings) {
      addAsset(recording.asset, "audio");
    }
  }

  if (hasNativePencilKit()) {
    const drawingIDs = new Set([
      ...snapshot.pages.map((page) => page.drawingDocumentId),
      ...(snapshot.myStory?.pages.map((page) => page.drawingDocumentId) ?? []),
      PROFILE_PORTRAIT_DOCUMENT_ID,
      WELCOME_DRAWING_DOCUMENT_ID,
    ]);
    await Promise.all(
      [...drawingIDs].map(async (documentId) => {
        const preview = await getNativeDrawingPreview(documentId);
        if (preview.available) {
          assets.set(`drawing-${documentId}`, {
            id: `drawing-${documentId}`,
            kind: "drawing",
            drawingDocumentId: documentId,
            mimeType: "application/x-pencilkit-drawing",
          });
        }
      }),
    );
  }
  return [...assets.values()];
}

type UseBackupSyncOptions = {
  newJournalPending?: boolean;
  backup: CloudBackupPlugin;
  drawingBackupTick: number;
  drawingBackupTickRef: RefObject<number>;
  replace: (restored: JournalSnapshot) => Promise<void>;
  runtime: JournalServices["runtime"];
  snapshot: JournalSnapshot | undefined;
};

export function useBackupSync({
  newJournalPending = false,
  backup,
  drawingBackupTick,
  drawingBackupTickRef,
  replace,
  runtime,
  snapshot,
}: UseBackupSyncOptions) {
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(
    INITIAL_BACKUP_STATUS,
  );
  const [historyStatus, setHistoryStatus] = useState<BackupHistoryStatus>({
    state: "idle",
    entries: [],
  });
  const lastBackedRevisionRef = useRef<number | undefined>(undefined);
  const lastBackedContentTokenRef = useRef<string | undefined>(undefined);
  const lastBackedDrawingTickRef = useRef(0);

  const refreshBackupStatus = useCallback(async () => {
    try {
      const result = await backup.status();
      setBackupStatus(backupResultStatus(result));
    } catch {
      setBackupStatus(STATUS_CHECK_ERROR);
    }
  }, [backup]);

  const refreshBackupHistory = useCallback(async () => {
    setHistoryStatus((current) => ({ ...current, state: "loading", message: undefined }));
    try {
      const result = await backup.listHistory();
      setHistoryStatus({ state: "idle", entries: result.entries });
    } catch {
      setHistoryStatus((current) => ({
        ...current,
        state: "error",
        message: "Backup history could not be loaded. Your diary was not changed.",
      }));
    }
  }, [backup]);

  const createHistoryEntry = useCallback(async (
    reason: BackupHistoryReason,
  ): Promise<BackupHistoryEntry | undefined> => {
    if (!snapshot) return undefined;
    setHistoryStatus((current) => ({ ...current, state: "creating", message: undefined }));
    try {
      if (hasNativePencilKit()) await flushNativeDrawingOverlay();
      const now = new Date();
      const entryDay = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const result = await backup.createHistory({
        snapshotJson: JSON.stringify(snapshot),
        revision: snapshot.revision,
        entryDay,
        timeZoneIdentifier: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reason,
        assets: await collectCloudBackupAssets(snapshot),
      });
      setHistoryStatus((current) => ({
        state: "idle",
        entries: historyAfterCreation(
          current.entries,
          result.entry,
          reason === "before-restore",
        ),
        message: "Recovery point created.",
      }));
      return result.entry;
    } catch (error) {
      const detail = error instanceof Error && error.message
        ? ` ${error.message}`
        : "";
      setHistoryStatus((current) => ({
        ...current,
        state: "error",
        message: `A recovery point could not be created. Existing history is unchanged.${detail}`,
      }));
      return undefined;
    }
  }, [backup, snapshot]);

  useEffect(() => {
    let cancelled = false;
    void backup
      .status()
      .then((result) => {
        if (!cancelled) {
          setBackupStatus(backupResultStatus(result));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackupStatus(STATUS_CHECK_ERROR);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [backup]);

  useEffect(() => {
    let cancelled = false;
    void backup.listHistory().then((result) => {
      if (!cancelled) setHistoryStatus({ state: "idle", entries: result.entries });
    }).catch(() => {
      // The iCloud status card remains the source of connection errors.
    });
    return () => { cancelled = true; };
  }, [backup]);

  const backUpJournalInformation = useCallback(async (
    options: { allowOtherDeviceOverwrite?: boolean } = {},
  ) => {
    if (!snapshot) {
      return;
    }

    let expectedCloudFingerprint: string | undefined;
    if (!options.allowOtherDeviceOverwrite) {
      try {
        const cloud = await backup.status();
        expectedCloudFingerprint = cloud.contentFingerprint;
        const localFingerprint = backupContentFingerprint(snapshot);
        const differentDevice = Boolean(
          cloud.lastSuccessfulBackupAt &&
          ((cloud.backupDeviceIdentifier && cloud.currentDeviceIdentifier
            && cloud.backupDeviceIdentifier !== cloud.currentDeviceIdentifier) ||
            (!cloud.backupDeviceIdentifier && cloud.backupDeviceName
              && cloud.currentDeviceName
              && cloud.backupDeviceName !== cloud.currentDeviceName)),
        );
        if (
          differentDevice &&
          (!cloud.contentFingerprint || cloud.contentFingerprint !== localFingerprint)
        ) {
          setBackupStatus({
            ...backupResultStatus(cloud),
            conflictDetected: true,
            message: `iCloud contains a different diary saved by ${cloud.backupDeviceName ?? "another iPad"}. Nothing was overwritten.`,
          });
          return;
        }
      } catch {
        setBackupStatus(STATUS_CHECK_ERROR);
        return;
      }
    }
    if (snapshot.settings.backupOnWifiOnly && runtime === "native") {
      let networkStatus: Awaited<ReturnType<typeof Network.getStatus>>;
      try {
        networkStatus = await Network.getStatus();
      } catch {
        setBackupStatus((current) => ({
          ...current,
          state: "error",
          pendingItemCount: 1,
          message:
            "The network connection could not be checked. Your diary remains saved on this iPad.",
        }));
        return;
      }
      if (networkStatus.connectionType !== "wifi") {
        setBackupStatus((current) => ({
          ...current,
          state: "waiting",
          pendingItemCount: 1,
          message: "Waiting for Wi-Fi. Your diary remains saved on this iPad.",
        }));
        return;
      }
    }

    setBackupStatus((current) => ({
      ...current,
      state: "syncing",
      message: "Backing up diary information…",
    }));
    try {
      if (hasNativePencilKit()) {
        await flushNativeDrawingOverlay();
      }
      const result = await backup.backupSnapshot({
        snapshotJson: JSON.stringify(snapshot),
        revision: snapshot.revision,
        contentFingerprint: backupContentFingerprint(snapshot),
        ...(expectedCloudFingerprint
          ? { expectedCloudFingerprint }
          : {}),
      });
      const cloudAssets = await collectCloudBackupAssets(snapshot);
      const assetResult = await backup.backupAssets({ assets: cloudAssets });
      const failedItemCount =
        assetResult.failedItemCount ?? cloudAssets.length;
      const successfulAt =
        assetResult.lastSuccessfulBackupAt ?? result.lastSuccessfulBackupAt;
      setBackupStatus({
        state: failedItemCount === 0 ? "synced" : "waiting",
        pendingItemCount: failedItemCount,
        message: assetResult.message,
        ...(successfulAt
          ? { lastSuccessfulBackupAt: successfulAt }
          : {}),
        ...(assetResult.accountDescription
          ? { accountDescription: assetResult.accountDescription }
          : {}),
        ...(assetResult.containerIdentifier
          ? { containerIdentifier: assetResult.containerIdentifier }
          : {}),
        ...(assetResult.databaseDescription
          ? { databaseDescription: assetResult.databaseDescription }
          : {}),
        ...(assetResult.recordIdentifier
          ? { recordIdentifier: assetResult.recordIdentifier }
          : {}),
        ...(assetResult.failedItems
          ? { failedItems: assetResult.failedItems }
          : {}),
        backedUpRevision: snapshot.revision,
      });
      if (failedItemCount === 0) {
        lastBackedRevisionRef.current = snapshot.revision;
        lastBackedContentTokenRef.current = backupContentToken(snapshot);
        lastBackedDrawingTickRef.current = drawingBackupTickRef.current;
        if (!options.allowOtherDeviceOverwrite) {
          await createHistoryEntry("automatic");
        }
      }
    } catch {
      setBackupStatus((current) => ({
        ...current,
        state: "error",
        message:
          "iCloud backup failed. Your diary remains safely stored on this iPad.",
      }));
    }
  }, [backup, createHistoryEntry, drawingBackupTickRef, runtime, snapshot]);

  const keepThisIPadAfterConflict = useCallback(async () => {
    const safetyEntry = await createHistoryEntry("before-restore");
    if (!safetyEntry) return false;
    await backUpJournalInformation({ allowOtherDeviceOverwrite: true });
    return true;
  }, [backUpJournalInformation, createHistoryEntry]);

  const saveLocalConflictCopy = useCallback(async () => {
    const saved = await createHistoryEntry("before-restore");
    if (saved) {
      setBackupStatus((current) => ({
        ...current,
        message: "This iPad was saved as a recovery point. The latest iCloud diary was not overwritten.",
      }));
    }
    return Boolean(saved);
  }, [createHistoryEntry]);

  useEffect(() => {
    if (
      runtime !== "native" ||
      !snapshot?.settings.backupOnWifiOnly ||
      !backupStatus.message.startsWith("Waiting for Wi-Fi")
    ) {
      return;
    }
    let removeListener: (() => Promise<void>) | undefined;
    let cancelled = false;
    void Network.addListener("networkStatusChange", (status) => {
      if (status.connectionType === "wifi") {
        void backUpJournalInformation();
      }
    }).then((handle) => {
      if (cancelled) {
        void handle.remove();
      } else {
        removeListener = handle.remove;
      }
    });
    return () => {
      cancelled = true;
      if (removeListener) {
        void removeListener();
      }
    };
  }, [
    backUpJournalInformation,
    backupStatus.message,
    runtime,
    snapshot?.settings.backupOnWifiOnly,
  ]);

  const restoreFromCloud = useCallback(async () => {
    setBackupStatus((current) => ({
      ...current,
      state: "syncing",
      message: "Restoring the iCloud diary…",
    }));
    try {
      const restored = await backup.restore();
      const reconciled = reconcileCloudRestore(
        JSON.parse(restored.snapshotJson),
        restored.restoredAssetUris,
      );
      await replace(reconciled);
      setBackupStatus((current) => ({
        ...current,
        state: "synced",
        pendingItemCount: 0,
        message: "The iCloud diary was restored on this iPad.",
        ...(restored.backedUpAt
          ? { lastSuccessfulBackupAt: restored.backedUpAt }
          : {}),
      }));
      return true;
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      setBackupStatus((current) => ({
        ...current,
        state: "error",
        message:
          `The iCloud diary could not be restored. The local diary was left unchanged.${detail}`,
      }));
      return false;
    }
  }, [backup, replace]);

  const restoreICloudAfterConflict = useCallback(async () => {
    const safetyEntry = await createHistoryEntry("before-restore");
    if (!safetyEntry) return false;
    return restoreFromCloud();
  }, [createHistoryEntry, restoreFromCloud]);

  const restoreHistoryEntry = useCallback(async (
    entry: BackupHistoryEntry,
    options: { newDevice?: boolean } = {},
  ): Promise<boolean> => {
    if (!snapshot) return false;
    if (!options.newDevice && !globalThis.confirm(
      `Restore the recovery point from ${new Date(entry.capturedAt).toLocaleString()}? A safety recovery point will be created first.`,
    )) return false;
    if (!options.newDevice) {
      const safetyEntry = await createHistoryEntry("before-restore");
      if (!safetyEntry) return false;
    }
    setHistoryStatus((current) => ({ ...current, state: "restoring", message: "Restoring recovery point…" }));
    try {
      const restored = await backup.restoreHistory({ id: entry.id });
      const reconciled = reconcileCloudRestore(JSON.parse(restored.snapshotJson), restored.restoredAssetUris);
      await replace({
        ...reconciled,
        settings: {
          ...reconciled.settings,
          automaticBackup: snapshot.settings.automaticBackup,
          backupOnWifiOnly: snapshot.settings.backupOnWifiOnly,
          lastSettingsTab: "backup",
        },
        revision: Math.max(snapshot.revision, reconciled.revision) + 1,
      });
      setHistoryStatus((current) => ({ ...current, state: "idle", message: "The recovery point was restored." }));
      return true;
    } catch {
      setHistoryStatus((current) => ({ ...current, state: "error", message: "The recovery point could not be restored. The current diary was left unchanged." }));
      return false;
    }
  }, [backup, createHistoryEntry, replace, snapshot]);

  const deleteHistoryEntry = useCallback(async (entry: BackupHistoryEntry) => {
    if (!globalThis.confirm(`Delete the recovery point from ${new Date(entry.capturedAt).toLocaleString()}?`)) return;
    try {
      await backup.deleteHistory({ id: entry.id });
      setHistoryStatus((current) => ({ ...current, entries: current.entries.filter((candidate) => candidate.id !== entry.id) }));
    } catch {
      setHistoryStatus((current) => ({ ...current, state: "error", message: "The recovery point could not be deleted." }));
    }
  }, [backup]);

  const deleteCloudData = useCallback(async (): Promise<boolean> => {
    if (!confirmCloudDataDeletion(globalThis.confirm)) return false;
    setBackupStatus((current) => ({
      ...current,
      state: "syncing",
      message: "Deleting iCloud diary information…",
    }));
    try {
      await backup.deleteCloudData();
      setHistoryStatus({ state: "idle", entries: [] });
      setBackupStatus({
        state: "available",
        pendingItemCount: 0,
        message: "The iCloud diary and recovery history were deleted. The diary on this iPad is unchanged.",
      });
      return true;
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      setBackupStatus((current) => ({
        ...current,
        state: "error",
        message: `The iCloud diary could not be completely deleted. Try again.${detail}`,
      }));
      return false;
    }
  }, [backup]);

  useEffect(() => {
    if (
      !snapshot?.settings.automaticBackup ||
      (newJournalPending &&
        !(
          backupStatus.state === "available" &&
          !backupStatus.lastSuccessfulBackupAt
        )) ||
      backupStatus.state === "not-configured" ||
      backupStatus.state === "syncing" ||
      backupStatus.state === "error" ||
      backupStatus.message.startsWith("Waiting for Wi-Fi")
    ) {
      return;
    }
    const backedRevision = backupStatus.backedUpRevision ?? -1;
    const contentToken = backupContentToken(snapshot);
    if (
      lastBackedContentTokenRef.current === undefined &&
      backedRevision >= snapshot.revision
    ) {
      lastBackedContentTokenRef.current = contentToken;
    }
    const snapshotNeedsBackup =
      lastBackedContentTokenRef.current === undefined
        ? snapshot.revision > backedRevision &&
          lastBackedRevisionRef.current !== snapshot.revision
        : contentToken !== lastBackedContentTokenRef.current;
    const drawingNeedsBackup =
      drawingBackupTick > lastBackedDrawingTickRef.current;
    if (!snapshotNeedsBackup && !drawingNeedsBackup) {
      return;
    }
    const timer = setTimeout(() => void backUpJournalInformation(), 5_000);
    return () => clearTimeout(timer);
  }, [backUpJournalInformation, backupStatus, drawingBackupTick, newJournalPending, snapshot]);

  return {
    backupStatus,
    backUpJournalInformation,
    createHistoryEntry,
    deleteCloudData,
    deleteHistoryEntry,
    historyStatus,
    keepThisIPadAfterConflict,
    refreshBackupStatus,
    refreshBackupHistory,
    restoreHistoryEntry,
    restoreFromCloud,
    saveLocalConflictCopy,
    restoreICloudAfterConflict,
  };
}
