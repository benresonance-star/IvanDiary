import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageWorkspace, type PageTool } from "./components/JournalPage";
import {
  EmptySketchbookView,
  FavouritesView,
  SketchbooksView,
} from "./components/LibraryViews";
import {
  Navigation,
  type AppSection,
} from "./components/Navigation";
import { SettingsView } from "./components/SettingsView";
import { ProfilePortraitEditor } from "./components/ProfilePortraitEditor";
import {
  WelcomeScreen,
  type WelcomeCopy,
} from "./components/WelcomeScreen";
import {
  DOCUMENT_SCHEMA_VERSION,
  MAX_PAGES_PER_COLLECTION,
  type AssetRef,
  type Favourite,
  type BackupStatus,
  type JournalSnapshot,
  type Page,
  type SaveHealth,
} from "./domain/models";
import { useJournal } from "./hooks/useJournal";
import { createAppServices } from "./native/composition";
import type { CloudBackupAsset, CloudBackupResult } from "./native/contracts";
import {
  flushNativeDrawingOverlay,
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
  subscribeNativeDrawingChanges,
} from "./native/pencilKit";
import { BrowserJournalRepository } from "./repository/browserJournalRepository";
import { BrowserSketchRepository } from "./repository/browserSketchRepository";
import type { SketchRepository } from "./sketch/types";
import { PROFILE_PORTRAIT_DOCUMENT_ID, WELCOME_DRAWING_DOCUMENT_ID } from "./sketch/specialDocuments";
import { localDateKey } from "./utils/date";
import { createId } from "./utils/id";

const INITIAL_DRAWING_HEALTH: SaveHealth = {
  localDurability: "saved",
  remoteSync: "offline",
  durableRevision: 0,
  pendingOperationCount: 0,
};

const INITIAL_BACKUP_STATUS: BackupStatus = {
  state: "not-configured",
  pendingItemCount: 0,
  message: "This version of the app is not connected to iCloud.",
};

function backupResultStatus(result: CloudBackupResult): BackupStatus {
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
    ...(result.accountDescription ? { accountDescription: result.accountDescription } : {}),
    ...(result.containerIdentifier ? { containerIdentifier: result.containerIdentifier } : {}),
    ...(result.databaseDescription ? { databaseDescription: result.databaseDescription } : {}),
    ...(result.recordIdentifier ? { recordIdentifier: result.recordIdentifier } : {}),
    ...(result.failedItems ? { failedItems: result.failedItems } : {}),
    ...(result.backedUpRevision === undefined ? {} : { backedUpRevision: result.backedUpRevision }),
  };
}

function backupContentToken(snapshot: JournalSnapshot): string {
  const recordableSettings = Object.fromEntries(
    Object.entries(snapshot.settings).filter(([key]) => key !== "lastSettingsTab"),
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

async function collectDiaryEntryDates(
  snapshot: JournalSnapshot,
  sketchRepository: SketchRepository,
): Promise<Set<string>> {
  const dates = new Set<string>();
  const checkNative = hasNativePencilKit();

  for (const day of snapshot.days) {
    for (const pageId of day.pageIds) {
      const pageCandidate = snapshot.pages.find(
        (pageItem) => pageItem.id === pageId,
      );
      if (!pageCandidate) {
        continue;
      }
      if (pageCandidate.objects.length > 0) {
        dates.add(day.date);
        break;
      }
      const sketch = await sketchRepository.load(
        pageCandidate.drawingDocumentId,
      );
      if (sketch.strokes.length > 0) {
        dates.add(day.date);
        break;
      }
      if (checkNative) {
        try {
          const preview = await getNativeDrawingPreview(
            pageCandidate.drawingDocumentId,
          );
          if (preview.available) {
            dates.add(day.date);
            break;
          }
        } catch {
          // Ignore preview lookup failures while scanning the calendar.
        }
      }
    }
  }

  return dates;
}

async function collectCloudBackupAssets(snapshot: JournalSnapshot): Promise<CloudBackupAsset[]> {
  const assets = new Map<string, CloudBackupAsset>();
  const addAsset = (asset: AssetRef, kind: "audio" | "photo") => {
    if (asset.localUri.startsWith("demo://")) return;
    assets.set(asset.id, { id: asset.id, kind, localUri: asset.localUri, mimeType: asset.mimeType, checksum: asset.checksum });
  };
  for (const page of snapshot.pages) {
    for (const object of page.objects) {
      if (object.type === "voice") addAsset(object.asset, "audio");
      if (object.type === "photo") addAsset(object.asset, "photo");
    }
  }
  for (const word of snapshot.settings.myWords) {
    if (word.sample) addAsset(word.sample, "audio");
  }
  const drawingIDs = new Set([
    ...snapshot.pages.map((page) => page.drawingDocumentId),
    PROFILE_PORTRAIT_DOCUMENT_ID,
    WELCOME_DRAWING_DOCUMENT_ID,
  ]);
  await Promise.all([...drawingIDs].map(async (documentId) => {
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
  }));
  return [...assets.values()];
}

function combinedHealth(
  journal: SaveHealth,
  drawing: SaveHealth,
): SaveHealth {
  const localDurability =
    journal.localDurability === "error" ||
    drawing.localDurability === "error"
      ? "error"
      : journal.localDurability === "saving" ||
          drawing.localDurability === "saving"
        ? "saving"
        : "saved";

  return {
    localDurability,
    remoteSync: "offline",
    durableRevision: Math.min(
      journal.durableRevision,
      drawing.durableRevision,
    ),
    pendingOperationCount:
      journal.pendingOperationCount + drawing.pendingOperationCount,
    message: journal.message ?? drawing.message,
  };
}

export default function App() {
  const journalRepository = useMemo(
    () => new BrowserJournalRepository(),
    [],
  );
  const sketchRepository = useMemo(() => new BrowserSketchRepository(), []);
  const services = useMemo(() => createAppServices(), []);
  const { audio, backup, files, transcription } = services;
  const { clearMessage, commit, health, message, replace, snapshot } =
    useJournal(journalRepository);
  const [activeSection, setActiveSection] =
    useState<AppSection>("diary");
  const [activeDayId, setActiveDayId] = useState<string>();
  const [drawingHealth, setDrawingHealth] = useState<SaveHealth>(
    INITIAL_DRAWING_HEALTH,
  );
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(
    INITIAL_BACKUP_STATUS,
  );
  const [activeDiaryPageId, setActiveDiaryPageId] = useState<string>();
  const [activePageTool, setActivePageTool] = useState<PageTool>("view");
  const [activeSketchbookId, setActiveSketchbookId] = useState<string>();
  const [activeSketchbookPageId, setActiveSketchbookPageId] =
    useState<string>();
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomePreview, setWelcomePreview] = useState<WelcomeCopy>();
  const [portraitEditorOpen, setPortraitEditorOpen] = useState(false);
  const [entryDates, setEntryDates] = useState<Set<string>>(() => new Set());
  const [entryDatesTick, setEntryDatesTick] = useState(0);
  const [drawingBackupTick, setDrawingBackupTick] = useState(0);
  const flushEntryDatesOnTickRef = useRef(false);
  const todayOpeningRef = useRef<string | undefined>(undefined);
  const lastBackedRevisionRef = useRef<number | undefined>(undefined);
  const lastBackedContentTokenRef = useRef<string | undefined>(undefined);
  const drawingBackupTickRef = useRef(0);
  const lastBackedDrawingTickRef = useRef(0);

  const refreshBackupStatus = async () => {
    try {
      const result = await backup.status();
      setBackupStatus(backupResultStatus(result));
    } catch {
      setBackupStatus({
        state: "error",
        pendingItemCount: 1,
        message: "The iCloud connection could not be checked. Your diary remains saved on this iPad.",
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    void backup.status().then((result) => {
      if (!cancelled) setBackupStatus(backupResultStatus(result));
    }).catch(() => {
      if (!cancelled) {
        setBackupStatus({
          state: "error",
          pendingItemCount: 1,
          message: "The iCloud connection could not be checked. Your diary remains saved on this iPad.",
        });
      }
    });
    return () => { cancelled = true; };
  }, [backup]);

  useEffect(() => {
    if (!hasNativePencilKit()) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void subscribeNativeDrawingChanges().then((remove) => {
      if (cancelled) remove();
      else unsubscribe = remove;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const backUpJournalInformation = useCallback(async () => {
    if (!snapshot) return;
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
      const failedItemCount = assetResult.failedItemCount ?? cloudAssets.length;
      const successfulAt = assetResult.lastSuccessfulBackupAt ?? result.lastSuccessfulBackupAt;
      setBackupStatus({
        state: failedItemCount === 0 ? "synced" : "waiting",
        pendingItemCount: failedItemCount,
        message: assetResult.message,
        ...(successfulAt
          ? { lastSuccessfulBackupAt: successfulAt }
          : {}),
        ...(assetResult.accountDescription ? { accountDescription: assetResult.accountDescription } : {}),
        ...(assetResult.containerIdentifier ? { containerIdentifier: assetResult.containerIdentifier } : {}),
        ...(assetResult.databaseDescription ? { databaseDescription: assetResult.databaseDescription } : {}),
        ...(assetResult.recordIdentifier ? { recordIdentifier: assetResult.recordIdentifier } : {}),
        ...(assetResult.failedItems ? { failedItems: assetResult.failedItems } : {}),
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
        message: "iCloud backup failed. Your diary remains safely stored on this iPad.",
      }));
    }
  }, [backup, snapshot]);

  const restoreFromCloud = async () => {
    if (!globalThis.confirm("Restore the iCloud diary on this iPad? The current local diary will be replaced after the cloud copy is downloaded.")) return;
    setBackupStatus((current) => ({ ...current, state: "syncing", message: "Restoring the iCloud diary…" }));
    try {
      const restored = await backup.restore();
      const parsed = JSON.parse(restored.snapshotJson) as JournalSnapshot;
      const updateAsset = (asset: AssetRef): AssetRef => {
        const restoredUri = restored.restoredAssetUris[asset.id];
        return restoredUri ? { ...asset, localUri: restoredUri } : asset;
      };
      const reconciled: JournalSnapshot = {
        ...parsed,
        pages: parsed.pages.map((page) => ({
          ...page,
          objects: page.objects.map((object) => object.type === "voice" || object.type === "photo"
            ? { ...object, asset: updateAsset(object.asset) }
            : object),
        })),
        settings: {
          ...parsed.settings,
          myWords: parsed.settings.myWords.map((word) => word.sample ? { ...word, sample: updateAsset(word.sample) } : word),
        },
      };
      await replace(reconciled);
      setBackupStatus((current) => ({ ...current, state: "synced", pendingItemCount: 0, message: "The iCloud diary was restored on this iPad.", ...(restored.backedUpAt ? { lastSuccessfulBackupAt: restored.backedUpAt } : {}) }));
    } catch {
      setBackupStatus((current) => ({ ...current, state: "error", message: "The iCloud diary could not be restored. The local diary was left unchanged." }));
    }
  };

  useEffect(() => {
    if (
      !snapshot?.settings.automaticBackup ||
      backupStatus.state === "not-configured" ||
      backupStatus.state === "syncing" ||
      backupStatus.state === "error"
    ) return;
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
    if (!snapshotNeedsBackup && !drawingNeedsBackup) return;
    const timer = setTimeout(() => void backUpJournalInformation(), 5_000);
    return () => clearTimeout(timer);
  }, [backUpJournalInformation, backupStatus, drawingBackupTick, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async (flushOverlay: boolean) => {
      // Never flush on ordinary toolbar/draw traffic — that races PencilKit and
      // freezes the Capacitor bridge. Only flush when the calendar opens.
      if (flushOverlay && hasNativePencilKit()) {
        try {
          await flushNativeDrawingOverlay();
        } catch {
          // Overlay may not be open; fall through to stored previews.
        }
      }
      if (cancelled) {
        return;
      }
      const dates = await collectDiaryEntryDates(snapshot, sketchRepository);
      if (!cancelled) {
        setEntryDates(dates);
      }
    };

    const flushForCalendar = flushEntryDatesOnTickRef.current;
    flushEntryDatesOnTickRef.current = false;
    void refresh(flushForCalendar);

    const handleNativeUpdate = () => {
      drawingBackupTickRef.current += 1;
      setDrawingBackupTick(drawingBackupTickRef.current);
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void refresh(false);
      }, 400);
    };
    globalThis.addEventListener(
      NATIVE_DRAWING_UPDATED_EVENT,
      handleNativeUpdate,
    );

    return () => {
      cancelled = true;
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      globalThis.removeEventListener(
        NATIVE_DRAWING_UPDATED_EVENT,
        handleNativeUpdate,
      );
    };
  }, [entryDatesTick, sketchRepository, snapshot]);

  useEffect(() => {
    if (!snapshot || activeDayId) return;
    const today = localDateKey(new Date());
    const existing = snapshot.days.find((candidate) => candidate.date === today);
    if (existing?.pageIds[0]) {
      return;
    }
    if (todayOpeningRef.current === today) return;
    todayOpeningRef.current = today;
    const openToday = async () => {
      const timestamp = new Date().toISOString();
      const dayId = existing?.id ?? `day-${today}`;
      if (!existing) {
        const dayCreated = await commit({
          type: "journal-day-create",
          day: {
            id: dayId,
            date: today,
            pageIds: [],
            favourite: false,
            revision: 0,
          },
        });
        if (!dayCreated) {
          todayOpeningRef.current = undefined;
          return;
        }
      }
      const pageId = createId();
      const pageCreated = await commit({
        type: "page-create",
        journalDayId: dayId,
        page: {
          schemaVersion: DOCUMENT_SCHEMA_VERSION,
          id: pageId,
          journalDayId: dayId,
          paperStyle: "warm-journal",
          drawingDocumentId: createId(),
          objects: [],
          revision: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      if (pageCreated) {
        setActiveDayId(dayId);
        setActiveDiaryPageId(pageId);
      } else {
        todayOpeningRef.current = undefined;
      }
    };
    void openToday();
  }, [activeDayId, commit, snapshot]);

  if (!snapshot) {
    return (
      <main className="opening-screen">
        <div className="opening-book" aria-hidden="true" />
        <h1>Opening Ivan’s Diary…</h1>
        {health.localDurability === "error" ? (
          <p role="alert">
            {health.message ?? "The diary could not be opened safely."}
          </p>
        ) : null}
      </main>
    );
  }

  const day =
    snapshot.days.find((candidate) => candidate.id === activeDayId) ??
    snapshot.days.find((candidate) => candidate.date === localDateKey(new Date())) ??
    snapshot.days[0];
  const dayPages = day
    ? day.pageIds.flatMap((pageId) => {
        const candidate = snapshot.pages.find((page) => page.id === pageId);
        return candidate ? [candidate] : [];
      })
    : [];
  const page =
    dayPages.find((candidate) => candidate.id === activeDiaryPageId) ??
    dayPages[0];
  const activeSketchbook = snapshot.sketchbooks.find(
    (sketchbook) => sketchbook.id === activeSketchbookId,
  );
  const sketchbookPages = activeSketchbook
    ? activeSketchbook.pageIds.flatMap((pageId) => {
        const candidate = snapshot.pages.find(
          (pageCandidate) => pageCandidate.id === pageId,
        );
        return candidate ? [candidate] : [];
      })
    : [];
  const sketchbookPage =
    sketchbookPages.find(
      (candidate) => candidate.id === activeSketchbookPageId,
    ) ?? sketchbookPages[0];

  const createDiaryPage = async () => {
    if (!day || !page || dayPages.length >= MAX_PAGES_PER_COLLECTION) {
      return false;
    }
    const timestamp = new Date().toISOString();
    const newPage: Page = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: createId(),
      journalDayId: day.id,
      paperStyle: page.paperStyle,
      drawingDocumentId: createId(),
      objects: [],
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const saved = await commit({
      type: "page-create",
      journalDayId: day.id,
      page: newPage,
    });
    if (saved) {
      setActiveDiaryPageId(newPage.id);
    }
    return saved;
  };

  const openDiaryDate = async (dateKey: string) => {
    if (dateKey > localDateKey(new Date())) {
      return;
    }
    const existing = snapshot.days.find(
      (candidate) => candidate.date === dateKey,
    );
    if (existing) {
      setActiveDayId(existing.id);
      setActiveDiaryPageId(existing.pageIds[0]);
      setActiveSection("diary");
      return;
    }

    const timestamp = new Date().toISOString();
    const dayId = `day-${dateKey}`;
    const pageId = createId();
    const paperStyle = page?.paperStyle ?? "warm-journal";
    const dayCreated = await commit({
      type: "journal-day-create",
      day: {
        id: dayId,
        date: dateKey,
        pageIds: [],
        favourite: false,
        revision: 0,
      },
    });
    if (!dayCreated) {
      return;
    }
    const pageCreated = await commit({
      type: "page-create",
      journalDayId: dayId,
      page: {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        id: pageId,
        journalDayId: dayId,
        paperStyle,
        drawingDocumentId: createId(),
        objects: [],
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    if (pageCreated) {
      setActiveDayId(dayId);
      setActiveDiaryPageId(pageId);
      setActiveSection("diary");
    }
  };

  const createSketchbook = async (name: string): Promise<boolean> => {
    const timestamp = new Date().toISOString();
    const sketchbookId = createId();
    const pageId = createId();
    const firstPage: Page = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: pageId,
      sketchbookId,
      paperStyle: "sketch-paper",
      drawingDocumentId: createId(),
      objects: [],
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const saved = await commit({
      type: "sketchbook-create-with-page",
      sketchbook: {
        id: sketchbookId,
        name,
        pageIds: [pageId],
        favourite: false,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      page: firstPage,
    });
    if (saved) {
      setActiveSketchbookId(sketchbookId);
      setActiveSketchbookPageId(pageId);
    }
    return saved;
  };

  const addSketchbookPage = async (): Promise<boolean> => {
    if (
      !activeSketchbook ||
      activeSketchbook.pageIds.length >= MAX_PAGES_PER_COLLECTION
    ) {
      return false;
    }
    const timestamp = new Date().toISOString();
    const newPage: Page = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: createId(),
      sketchbookId: activeSketchbook.id,
      paperStyle: sketchbookPage?.paperStyle ?? "sketch-paper",
      drawingDocumentId: createId(),
      objects: [],
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const saved = await commit({
      type: "sketchbook-page-create",
      sketchbookId: activeSketchbook.id,
      page: newPage,
    });
    if (saved) {
      setActiveSketchbookPageId(newPage.id);
    }
    return saved;
  };

  const trashPageAssets = async (deletedPage: Page) => {
    const assetIds = deletedPage.objects.flatMap((object) =>
      object.type === "photo" || object.type === "voice"
        ? [object.asset.id]
        : [],
    );
    await Promise.allSettled(
      [...new Set(assetIds)].map((assetId) =>
        files.removeToTrash({ assetId }),
      ),
    );
  };

  const deleteDiaryPage = async (pageId: string): Promise<boolean> => {
    if (!day || day.pageIds.length <= 1) return false;
    const deletedPage = snapshot.pages.find((candidate) => candidate.id === pageId);
    if (!deletedPage || deletedPage.journalDayId !== day.id) return false;
    const index = day.pageIds.indexOf(pageId);
    const nextPageId = day.pageIds[index + 1] ?? day.pageIds[index - 1];
    const saved = await commit({ type: "page-delete", pageId });
    if (saved) {
      setActiveDiaryPageId(nextPageId);
      await trashPageAssets(deletedPage);
    }
    return saved;
  };

  const deleteSketchbookPage = async (pageId: string): Promise<boolean> => {
    if (!activeSketchbook || activeSketchbook.pageIds.length <= 1) return false;
    const deletedPage = snapshot.pages.find((candidate) => candidate.id === pageId);
    if (!deletedPage || deletedPage.sketchbookId !== activeSketchbook.id) return false;
    const index = activeSketchbook.pageIds.indexOf(pageId);
    const nextPageId = activeSketchbook.pageIds[index + 1] ?? activeSketchbook.pageIds[index - 1];
    const saved = await commit({ type: "page-delete", pageId });
    if (saved) {
      setActiveSketchbookPageId(nextPageId);
      await trashPageAssets(deletedPage);
    }
    return saved;
  };

  const deleteSketchbook = async (sketchbookId: string): Promise<boolean> => {
    const sketchbook = snapshot.sketchbooks.find(
      (candidate) => candidate.id === sketchbookId,
    );
    if (!sketchbook) return false;
    const deletedPages = snapshot.pages.filter((page) =>
      sketchbook.pageIds.includes(page.id),
    );
    const saved = await commit({ type: "sketchbook-delete", sketchbookId });
    if (saved) {
      await Promise.allSettled(deletedPages.map(trashPageAssets));
    }
    return saved;
  };

  const openFavourite = (favourite: Favourite) => {
    switch (favourite.targetType) {
      case "journal-day": {
        const favouriteDay = snapshot.days.find(
          (candidate) => candidate.id === favourite.targetId,
        );
        if (favouriteDay) {
          setActiveDayId(favouriteDay.id);
          setActiveDiaryPageId(favouriteDay.pageIds[0]);
          setActiveSection("diary");
        }
        break;
      }
      case "page": {
        const favouritePage = snapshot.pages.find(
          (candidate) => candidate.id === favourite.targetId,
        );
        if (favouritePage?.journalDayId) {
          setActiveDayId(favouritePage.journalDayId);
          setActiveDiaryPageId(favouritePage.id);
          setActiveSection("diary");
        } else if (favouritePage?.sketchbookId) {
          setActiveSketchbookId(favouritePage.sketchbookId);
          setActiveSketchbookPageId(favouritePage.id);
          setActiveSection("sketchbooks");
        }
        break;
      }
      case "sketchbook":
        setActiveSketchbookId(favourite.targetId);
        setActiveSketchbookPageId(undefined);
        setActiveSection("sketchbooks");
        break;
      default: {
        const exhaustiveFavourite: never = favourite.targetType;
        throw new Error(
          `Unsupported favourite target: ${exhaustiveFavourite}`,
        );
      }
    }
  };

  let content;
  switch (activeSection) {
    case "diary":
      content =
        day && page ? (
          <PageWorkspace
            audio={audio}
            commit={commit}
            files={files}
            context={{
              kind: "diary",
              date: day.date,
              favourite: day.favourite,
              journalDayId: day.id,
            }}
            displayName={snapshot.settings.displayName}
            entryDates={entryDates}
            health={combinedHealth(health, drawingHealth)}
            key={page.id}
            onAddPage={createDiaryPage}
            onDrawingHealthChange={setDrawingHealth}
            onDeletePage={deleteDiaryPage}
            onRefreshEntryDates={() => {
              flushEntryDatesOnTickRef.current = true;
              setEntryDatesTick((current) => current + 1);
            }}
            onReorderPages={(pageIds) =>
              commit({
                type: "journal-pages-reorder",
                journalDayId: day.id,
                pageIds,
              })
            }
            onSelectDate={(dateKey) => void openDiaryDate(dateKey)}
            onSelectPage={setActiveDiaryPageId}
            onToolChange={setActivePageTool}
            page={page}
            pages={dayPages}
            penColor={snapshot.settings.penColor}
            fingerDrawingEnabled={snapshot.settings.fingerDrawingEnabled}
            favouritePenColours={snapshot.settings.favouritePenColours}
            penNib={snapshot.settings.penNib}
            penNibProfiles={snapshot.settings.penNibProfiles}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            myWords={snapshot.settings.myWords}
            recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
            sketchRepository={sketchRepository}
            tool={activePageTool}
            transcription={transcription}
          />
        ) : (
          <section className="empty-library">
            <h1>Today’s page is not ready.</h1>
          </section>
        );
      break;
    case "sketchbooks":
      content =
        activeSketchbook && sketchbookPage ? (
          <PageWorkspace
            audio={audio}
            commit={commit}
            files={files}
            context={{
              kind: "sketchbook",
              favourite: snapshot.favourites.some(
                (favourite) =>
                  favourite.targetType === "page" &&
                  favourite.targetId === sketchbookPage.id,
              ),
              onBack: () => {
                setActiveSketchbookId(undefined);
                setActiveSketchbookPageId(undefined);
              },
              sketchbook: activeSketchbook,
            }}
            displayName={snapshot.settings.displayName}
            health={combinedHealth(health, drawingHealth)}
            key={sketchbookPage.id}
            onAddPage={addSketchbookPage}
            onDrawingHealthChange={setDrawingHealth}
            onDeletePage={deleteSketchbookPage}
            onReorderPages={(pageIds) =>
              commit({
                type: "sketchbook-pages-reorder",
                sketchbookId: activeSketchbook.id,
                pageIds,
              })
            }
            onSelectPage={setActiveSketchbookPageId}
            onToolChange={setActivePageTool}
            page={sketchbookPage}
            pages={sketchbookPages}
            penColor={snapshot.settings.penColor}
            fingerDrawingEnabled={snapshot.settings.fingerDrawingEnabled}
            favouritePenColours={snapshot.settings.favouritePenColours}
            penNib={snapshot.settings.penNib}
            penNibProfiles={snapshot.settings.penNibProfiles}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            myWords={snapshot.settings.myWords}
            recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
            sketchRepository={sketchRepository}
            tool={activePageTool}
            transcription={transcription}
          />
        ) : activeSketchbook ? (
          <EmptySketchbookView
            onAddPage={() => void addSketchbookPage()}
            onBack={() => {
              setActiveSketchbookId(undefined);
              setActiveSketchbookPageId(undefined);
            }}
            sketchbook={activeSketchbook}
          />
        ) : (
          <SketchbooksView
            audio={audio}
            commit={commit}
            files={files}
            onCreateSketchbook={createSketchbook}
            onDeleteSketchbook={deleteSketchbook}
            onOpenSketchbook={(sketchbookId) => {
              setActiveSketchbookId(sketchbookId);
              setActiveSketchbookPageId(undefined);
            }}
            onRenameSketchbook={(sketchbookId, name) =>
              commit({
                type: "sketchbook-rename",
                sketchbookId,
                name,
              })
            }
            onReorderSketchbooks={(sketchbookIds) =>
              commit({
                type: "sketchbooks-reorder",
                sketchbookIds,
              })
            }
            sketchRepository={sketchRepository}
            snapshot={snapshot}
            transcription={transcription}
          />
        );
      break;
    case "favourites":
      content = (
        <FavouritesView
          commit={commit}
          onOpenFavourite={openFavourite}
          sketchRepository={sketchRepository}
          snapshot={snapshot}
        />
      );
      break;
    case "settings":
      content = (
        <SettingsView
          audio={audio}
          backupStatus={backupStatus}
          commit={commit}
          files={files}
          key={snapshot.settings.lastSettingsTab}
          onEditPortrait={() => setPortraitEditorOpen(true)}
          onBackupNow={() => void backUpJournalInformation()}
          onCheckBackup={() => void refreshBackupStatus()}
          onPreviewWelcome={setWelcomePreview}
          onRestore={() => void restoreFromCloud()}
          sketchRepository={sketchRepository}
          settings={snapshot.settings}
        />
      );
      break;
    default: {
      const exhaustiveSection: never = activeSection;
      throw new Error(`Unsupported app section: ${exhaustiveSection}`);
    }
  }

  return (
    <main
      className="app-shell"
      data-contrast={snapshot.settings.contrast}
      data-reduced-motion={snapshot.settings.reducedMotion}
      data-text-scale={snapshot.settings.textScale}
    >
      <Navigation
        activeSection={activeSection}
        displayName={snapshot.settings.displayName}
        onProfileSelect={() => setActiveSection("settings")}
        onBackupWarningSelect={() => {
          void commit({
            type: "settings-update",
            settings: { lastSettingsTab: "backup" },
          });
          setActiveSection("settings");
        }}
        backupStatus={backupStatus}
        onSectionChange={setActiveSection}
        sketchRepository={sketchRepository}
      />
      {content}
      {portraitEditorOpen ? (
        <ProfilePortraitEditor
          initialPenSettings={{
            color: snapshot.settings.penColor,
            nib: snapshot.settings.penNib,
            profiles: snapshot.settings.penNibProfiles,
            width: snapshot.settings.penWidth,
            opacity: snapshot.settings.penOpacity,
            fingerDrawing: snapshot.settings.fingerDrawingEnabled,
            favouriteColours: snapshot.settings.favouritePenColours,
          }}
          onPenSettingsChange={(penSettings) => {
            void commit({
              type: "settings-update",
              settings: {
                penColor: penSettings.color,
                penNib: penSettings.nib ?? "pen",
                ...(penSettings.profiles ? { penNibProfiles: penSettings.profiles } : {}),
                penWidth: penSettings.width,
                penOpacity: penSettings.opacity,
                fingerDrawingEnabled: penSettings.fingerDrawing !== false,
              },
            });
          }}
          onReturn={() => setPortraitEditorOpen(false)}
          sketchRepository={sketchRepository}
        />
      ) : null}
      {welcomeVisible || welcomePreview ? (
        <WelcomeScreen
          copy={
            welcomePreview ?? {
              greeting: snapshot.settings.welcomeGreeting,
              tagline: snapshot.settings.welcomeTagline,
              message: snapshot.settings.welcomeMessage,
            }
          }
          editing={Boolean(welcomePreview)}
          onDismiss={() => {
            if (welcomePreview) {
              setWelcomePreview(undefined);
            } else {
              setWelcomeVisible(false);
            }
          }}
          onPenSettingsChange={(penSettings) => {
            void commit({
              type: "settings-update",
              settings: {
                penColor: penSettings.color,
                penNib: penSettings.nib ?? "pen",
                ...(penSettings.profiles ? { penNibProfiles: penSettings.profiles } : {}),
                penWidth: penSettings.width,
                penOpacity: penSettings.opacity,
                fingerDrawingEnabled: penSettings.fingerDrawing !== false,
              },
            });
          }}
          onReturnToSettings={() => setWelcomePreview(undefined)}
          penColor={snapshot.settings.penColor}
          fingerDrawingEnabled={snapshot.settings.fingerDrawingEnabled}
          favouritePenColours={snapshot.settings.favouritePenColours}
          penNib={snapshot.settings.penNib}
          penNibProfiles={snapshot.settings.penNibProfiles}
          penOpacity={snapshot.settings.penOpacity}
          penWidth={snapshot.settings.penWidth}
          reducedMotion={snapshot.settings.reducedMotion}
          sketchRepository={sketchRepository}
        />
      ) : null}
      {message ? (
        <button
          className="notice global-notice"
          onClick={clearMessage}
          type="button"
        >
          {message}
        </button>
      ) : null}
    </main>
  );
}
