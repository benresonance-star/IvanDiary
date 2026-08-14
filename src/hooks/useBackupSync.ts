import { Network } from "@capacitor/network";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { reconcileCloudRestore } from "../domain/cloudRestore";
import type {
  AssetRef,
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
  backupResultStatus,
  INITIAL_BACKUP_STATUS,
} from "./backupSyncHelpers";

const STATUS_CHECK_ERROR: BackupStatus = {
  state: "error",
  pendingItemCount: 1,
  message:
    "The iCloud connection could not be checked. Your diary remains saved on this iPad.",
};

async function collectCloudBackupAssets(
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

  const drawingIDs = new Set([
    ...snapshot.pages.map((page) => page.drawingDocumentId),
    PROFILE_PORTRAIT_DOCUMENT_ID,
    WELCOME_DRAWING_DOCUMENT_ID,
  ]);
  await Promise.all(
    [...drawingIDs].map(async (documentId) => {
      try {
        const preview = await getNativeDrawingPreview(documentId);
        if (preview.available) {
          assets.set(`drawing-${documentId}`, {
            id: `drawing-${documentId}`,
            kind: "drawing",
            drawingDocumentId: documentId,
            mimeType: "application/x-pencilkit-drawing",
          });
        }
      } catch {
        // A missing native drawing has nothing to upload.
      }
    }),
  );
  return [...assets.values()];
}

type UseBackupSyncOptions = {
  backup: CloudBackupPlugin;
  drawingBackupTick: number;
  drawingBackupTickRef: RefObject<number>;
  replace: (restored: JournalSnapshot) => Promise<void>;
  runtime: JournalServices["runtime"];
  snapshot: JournalSnapshot | undefined;
};

export function useBackupSync({
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

  const backUpJournalInformation = useCallback(async () => {
    if (!snapshot) {
      return;
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
        try {
          await flushNativeDrawingOverlay();
        } catch {
          // The overlay may already be closed; stored drawing files remain valid.
        }
      }
      const result = await backup.backupSnapshot({
        snapshotJson: JSON.stringify(snapshot),
        revision: snapshot.revision,
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
      }
    } catch {
      setBackupStatus((current) => ({
        ...current,
        state: "error",
        message:
          "iCloud backup failed. Your diary remains safely stored on this iPad.",
      }));
    }
  }, [backup, drawingBackupTickRef, runtime, snapshot]);

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
    if (
      !globalThis.confirm(
        "Restore the iCloud diary on this iPad? The current local diary will be replaced after the cloud copy is downloaded.",
      )
    ) {
      return;
    }
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
    } catch {
      setBackupStatus((current) => ({
        ...current,
        state: "error",
        message:
          "The iCloud diary could not be restored. The local diary was left unchanged.",
      }));
    }
  }, [backup, replace]);

  useEffect(() => {
    if (
      !snapshot?.settings.automaticBackup ||
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
  }, [backUpJournalInformation, backupStatus, drawingBackupTick, snapshot]);

  return {
    backupStatus,
    backUpJournalInformation,
    refreshBackupStatus,
    restoreFromCloud,
  };
}
