import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { PageWorkspace, type PageTool } from "./components/JournalPage";
import {
  EmptySketchbookView,
  FavouritesView,
  SketchbooksView,
  StoriesView,
} from "./components/LibraryViews";
import {
  Navigation,
  type AppSection,
} from "./components/Navigation";
import { NewDeviceRecoveryDialog } from "./components/NewDeviceRecoveryDialog";
import { RestoreCompleteDialog } from "./components/RestoreCompleteDialog";
import { HelpMode } from "./components/HelpMode";
import {
  WelcomeScreen,
  type WelcomeCopy,
} from "./components/WelcomeScreen";
import {
  DOCUMENT_SCHEMA_VERSION,
  MAX_PAGES_PER_COLLECTION,
  type Favourite,
  type JournalSnapshot,
  type MyStoryPage,
  type Page,
  type SaveHealth,
} from "./domain/models";
import { useBackupSync } from "./hooks/useBackupSync";
import { useJournal } from "./hooks/useJournal";
import { nativeDrawingOverlayCoordinator } from "./hooks/nativeDrawingOverlayCoordinator";
import { createAppServices } from "./native/composition";
import { setLandscapeLocked } from "./native/orientation";
import {
  deleteNativeDrawing,
  flushNativeDrawingOverlay,
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
  subscribeNativeDrawingChanges,
} from "./native/pencilKit";
import { createJournalRepository } from "./repository/nativeJournalRepository";
import { BrowserSketchRepository } from "./repository/browserSketchRepository";
import type { SketchRepository } from "./sketch/types";
import { localDateKey } from "./utils/date";
import { createId } from "./utils/id";

const INITIAL_DRAWING_HEALTH: SaveHealth = {
  localDurability: "saved",
  remoteSync: "offline",
  durableRevision: 0,
  pendingOperationCount: 0,
};

const RESTORE_COMPLETE_KEY = "ivan-diary-restore-complete";

export function workspacePageTool(
  activeTool: PageTool,
  welcomeVisible: boolean,
  welcomePreviewVisible: boolean,
): PageTool {
  return welcomeVisible || welcomePreviewVisible ? "view" : activeTool;
}

const SettingsView = lazy(() =>
  import("./components/SettingsView").then((module) => ({ default: module.SettingsView })),
);
const MyStoryWorkspace = lazy(() =>
  import("./components/MyStoryWorkspace").then((module) => ({ default: module.MyStoryWorkspace })),
);
const ProfilePortraitEditor = lazy(() =>
  import("./components/ProfilePortraitEditor").then((module) => ({ default: module.ProfilePortraitEditor })),
);

function reloadAfterRestore(): void {
  globalThis.sessionStorage?.setItem(RESTORE_COMPLETE_KEY, "true");
  globalThis.location.reload();
}

async function collectDiaryEntryDates(
  snapshot: JournalSnapshot,
  sketchRepository: SketchRepository,
  nativeDrawingIds: ReadonlySet<string>,
): Promise<Set<string>> {
  const dates = new Set<string>();

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
      if (nativeDrawingIds.has(pageCandidate.drawingDocumentId)) {
        dates.add(day.date);
        break;
      }
    }
  }

  return dates;
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
    () => createJournalRepository(),
    [],
  );
  const sketchRepository = useMemo(() => new BrowserSketchRepository(), []);
  const services = useMemo(() => createAppServices(), []);
  const { audio, backup, files, lifecycle, runtime, share, transcription } = services;
  const { acknowledgeNewJournal, clearMessage, commit, flush, health, isNewJournal, message, replace, snapshot } =
    useJournal(journalRepository);
  const [activeSection, setActiveSection] =
    useState<AppSection>("diary");
  const [activeDayId, setActiveDayId] = useState<string>();
  const [drawingHealth, setDrawingHealth] = useState<SaveHealth>(
    INITIAL_DRAWING_HEALTH,
  );
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [activeDiaryPageId, setActiveDiaryPageId] = useState<string>();
  const [activeStoryPageId, setActiveStoryPageId] = useState<string>();
  const [activeStoryId, setActiveStoryId] = useState<string>();
  const [lastViewedStoryId, setLastViewedStoryId] = useState<string>();

  useEffect(() => {
    const standardAppAppearance =
      snapshot?.settings.standardAppAppearance ?? true;
    void setLandscapeLocked(standardAppAppearance).catch(
      () => undefined,
    );
  }, [snapshot?.settings.standardAppAppearance]);
  const [activePageTool, setActivePageTool] = useState<PageTool>("pen");
  const [activeSketchbookId, setActiveSketchbookId] = useState<string>();
  const [activeSketchbookPageId, setActiveSketchbookPageId] =
    useState<string>();
  const [lastViewedSketchbookId, setLastViewedSketchbookId] =
    useState<string>();
  const [lastViewedFavouriteId, setLastViewedFavouriteId] =
    useState<string>();
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [navigationMenuOpening, setNavigationMenuOpening] = useState(false);
  const [helpModeActive, setHelpModeActive] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomePreview, setWelcomePreview] = useState<WelcomeCopy>();
  const visibleWorkspaceTool = workspacePageTool(
    activePageTool,
    welcomeVisible,
    Boolean(welcomePreview),
  );
  const [portraitEditorOpen, setPortraitEditorOpen] = useState(false);
  const [restoreCompleteVisible, setRestoreCompleteVisible] = useState(
    () => globalThis.sessionStorage?.getItem(RESTORE_COMPLETE_KEY) === "true",
  );
  const [entryDates, setEntryDates] = useState<Set<string>>(() => new Set());
  const [entryDatesTick, setEntryDatesTick] = useState(0);
  const [drawingBackupTick, setDrawingBackupTick] = useState(0);
  const flushEntryDatesOnTickRef = useRef(false);
  const todayOpeningRef = useRef<string | undefined>(undefined);
  const drawingBackupTickRef = useRef(0);
  const nativeDrawingIdsRef = useRef<Set<string>>(new Set());
  const nativeDrawingScanReadyRef = useRef(false);
  const {
    backupStatus,
    backUpJournalInformation,
    createHistoryEntry,
    deleteCloudData,
    deleteHistoryEntry,
    historyStatus,
    keepThisIPadAfterConflict,
    refreshBackupStatus,
    refreshBackupHistory,
    restoreFromCloud,
    saveLocalConflictCopy,
    restoreICloudAfterConflict,
    restoreHistoryEntry,
  } = useBackupSync({
    newJournalPending: isNewJournal !== false,
    backup,
    drawingBackupTick,
    drawingBackupTickRef,
    replace,
    runtime,
    snapshot,
  });

  useEffect(() => {
    if (
      isNewJournal === true &&
      backupStatus.state === "available" &&
      !backupStatus.lastSuccessfulBackupAt
    ) {
      acknowledgeNewJournal();
    }
  }, [acknowledgeNewJournal, backupStatus.lastSuccessfulBackupAt, backupStatus.state, isNewJournal]);

  useEffect(() => {
    const handleBlockedDatabase = () => setStorageBlocked(true);
    globalThis.addEventListener(
      "journal-database-blocked",
      handleBlockedDatabase,
    );
    return () =>
      globalThis.removeEventListener(
        "journal-database-blocked",
        handleBlockedDatabase,
      );
  }, []);

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

  useEffect(() => {
    const flushForBackground = (event: Event) => {
      if (
        event.type === "visibilitychange" &&
        document.visibilityState !== "hidden"
      ) {
        return;
      }
      void Promise.allSettled([
        flush(),
        lifecycle.flushRequested(),
        ...(hasNativePencilKit() ? [flushNativeDrawingOverlay()] : []),
      ]);
    };
    document.addEventListener("visibilitychange", flushForBackground);
    globalThis.addEventListener("pagehide", flushForBackground);
    return () => {
      document.removeEventListener("visibilitychange", flushForBackground);
      globalThis.removeEventListener("pagehide", flushForBackground);
    };
  }, [flush, lifecycle]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async (flushOverlay: boolean, rescanNative: boolean) => {
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
      if (rescanNative && hasNativePencilKit()) {
        const drawingIds = new Set<string>();
        for (const page of snapshot.pages) {
          try {
            const preview = await getNativeDrawingPreview(page.drawingDocumentId);
            if (preview.available) drawingIds.add(page.drawingDocumentId);
          } catch {
            // Keep scanning; one damaged preview must not hide other diary dates.
          }
        }
        nativeDrawingIdsRef.current = drawingIds;
        nativeDrawingScanReadyRef.current = true;
      }
      const dates = await collectDiaryEntryDates(
        snapshot,
        sketchRepository,
        nativeDrawingIdsRef.current,
      );
      if (!cancelled) {
        setEntryDates(dates);
      }
    };

    const flushForCalendar = flushEntryDatesOnTickRef.current;
    flushEntryDatesOnTickRef.current = false;
    const needsInitialNativeScan = !nativeDrawingScanReadyRef.current;
    void refresh(flushForCalendar, flushForCalendar || needsInitialNativeScan);

    const handleNativeUpdate = (event: Event) => {
      drawingBackupTickRef.current += 1;
      setDrawingBackupTick(drawingBackupTickRef.current);
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        const documentId = (event as CustomEvent<{ documentId?: string }>).detail?.documentId;
        if (!documentId) {
          void refresh(false, true);
          return;
        }
        void getNativeDrawingPreview(documentId)
          .then((preview) => {
            const next = new Set(nativeDrawingIdsRef.current);
            if (preview.available) next.add(documentId);
            else next.delete(documentId);
            nativeDrawingIdsRef.current = next;
          })
          .catch(() => undefined)
          .then(() => refresh(false, false));
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
  const activeStory = snapshot.stories.find((story) => story.id === activeStoryId);
  const storyPages = activeStory?.pages ?? [];
  const storyPage =
    storyPages.find((candidate) => candidate.id === activeStoryPageId) ??
    storyPages[0];
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

  const createStoryPage = async (): Promise<boolean> => {
    if (!activeStory) return false;
    if (storyPages.length >= MAX_PAGES_PER_COLLECTION) {
      return false;
    }
    const timestamp = new Date().toISOString();
    const newPage: MyStoryPage = {
      id: createId(),
      drawingDocumentId: createId(),
      splitRatio: storyPage?.splitRatio ?? 0.5,
      textSide: storyPage?.textSide ?? "left",
      textBackgroundColor: storyPage?.textBackgroundColor ?? "#fffaf0",
      textColor:
        storyPage?.textColor ??
        activeStory.defaultTextColor ??
        "#171410",
      textBlocks: [],
      photos: [],
      links: [],
      recordings: [],
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const saved = await commit({
      type: "my-story-page-create",
      storyId: activeStory.id,
      page: newPage,
    });
    if (saved) {
      setActiveStoryPageId(newPage.id);
    }
    return saved;
  };

  const trashStoryPageAssets = async (deletedPage: MyStoryPage) => {
    await Promise.allSettled([
      ...deletedPage.photos.map((photo) =>
        files.removeToTrash({ assetId: photo.asset.id }),
      ),
      ...deletedPage.recordings.map((recording) =>
        files.removeToTrash({ assetId: recording.asset.id }),
      ),
      ...(sketchRepository.remove
        ? [sketchRepository.remove(deletedPage.drawingDocumentId)]
        : []),
      ...(hasNativePencilKit()
        ? [deleteNativeDrawing(deletedPage.drawingDocumentId)]
        : []),
    ]);
  };

  const deleteStoryPage = async (pageId: string): Promise<boolean> => {
    if (!activeStory) return false;
    if (storyPages.length <= 1) return false;
    const deletedPage = storyPages.find((candidate) => candidate.id === pageId);
    if (!deletedPage) return false;
    const index = storyPages.indexOf(deletedPage);
    const nextPageId =
      storyPages[index + 1]?.id ?? storyPages[index - 1]?.id;
    const saved = await commit({ type: "my-story-page-delete", storyId: activeStory.id, pageId });
    if (saved) {
      setActiveStoryPageId(nextPageId);
      await trashStoryPageAssets(deletedPage);
    }
    return saved;
  };

  const createStory = async (name: string): Promise<boolean> => {
    const timestamp = new Date().toISOString();
    const storyId = createId();
    const page: MyStoryPage = {
      id: createId(), drawingDocumentId: createId(), splitRatio: 0.5,
      textSide: "left", textBackgroundColor: "#fffaf0", textColor: "#171410",
      textBlocks: [], photos: [], links: [], recordings: [], revision: 0,
      createdAt: timestamp, updatedAt: timestamp,
    };
    return (await commit({ type: "story-create", story: {
      id: storyId, name, favourite: false, defaultTextColor: "#171410",
      pages: [page], revision: 0, createdAt: timestamp, updatedAt: timestamp,
    } })) !== false;
  };

  const deleteStory = async (storyId: string): Promise<boolean> => {
    const story = snapshot.stories.find((candidate) => candidate.id === storyId);
    if (!story) return false;
    const saved = await commit({ type: "story-delete", storyId });
    if (saved) await Promise.allSettled(story.pages.map(trashStoryPageAssets));
    return saved !== false;
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
      setLastViewedSketchbookId(sketchbookId);
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
      [
        ...[...new Set(assetIds)].map((assetId) =>
          files.removeToTrash({ assetId }),
        ),
        ...(sketchRepository.remove
          ? [sketchRepository.remove(deletedPage.drawingDocumentId)]
          : []),
        ...(hasNativePencilKit()
          ? [deleteNativeDrawing(deletedPage.drawingDocumentId)]
          : []),
      ],
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
    setLastViewedFavouriteId(favourite.id);
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
          setLastViewedSketchbookId(favouritePage.sketchbookId);
          setActiveSection("sketchbooks");
        }
        break;
      }
      case "sketchbook":
        setActiveSketchbookId(favourite.targetId);
        setActiveSketchbookPageId(undefined);
        setLastViewedSketchbookId(favourite.targetId);
        setActiveSection("sketchbooks");
        break;
      case "story":
        setActiveStoryId(favourite.targetId);
        setActiveStoryPageId(undefined);
        setLastViewedStoryId(favourite.targetId);
        setActiveSection("story");
        break;
      default: {
        const exhaustiveFavourite: never = favourite.targetType;
        throw new Error(
          `Unsupported favourite target: ${exhaustiveFavourite}`,
        );
      }
    }
  };

  const openSection = (section: AppSection) => {
    if (section === "sketchbooks") {
      setActiveSketchbookId(undefined);
      setActiveSketchbookPageId(undefined);
    }
    if (section === "story") {
      setActiveStoryId(undefined);
      setActiveStoryPageId(undefined);
    }
    setActiveSection(section);
  };

  const openNavigationMenu = async () => {
    setNavigationMenuOpening(true);
    const hidden = await nativeDrawingOverlayCoordinator.suspendAndWait();
    setNavigationMenuOpening(false);
    if (hidden) {
      setNavigationMenuOpen(true);
    }
  };

  const closeNavigationMenu = () => {
    setNavigationMenuOpen(false);
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
              favourite:
                snapshot.favourites.some(
                  (favourite) =>
                    favourite.targetType === "page" &&
                    favourite.targetId === page.id,
                ) ||
                (day.pageIds[0] === page.id && day.favourite),
              journalDayId: day.id,
              isFirstPage: day.pageIds[0] === page.id,
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
            fingerErasingEnabled={snapshot.settings.fingerErasingEnabled}
            twoFingerUndoEnabled={snapshot.settings.twoFingerUndoEnabled}
            favouritePenColours={snapshot.settings.favouritePenColours}
            penNib={snapshot.settings.penNib}
            penNibProfiles={snapshot.settings.penNibProfiles}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            myWords={snapshot.settings.myWords}
            navigationObscured={
              navigationMenuOpen || navigationMenuOpening || helpModeActive
            }
            shapeEditingObscured={navigationMenuOpen || navigationMenuOpening}
            recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
            textEditorPreference={snapshot.settings.textEditorPreference}
            share={share}
            sketchRepository={sketchRepository}
            tool={visibleWorkspaceTool}
            transcription={transcription}
          />
        ) : (
          <section className="empty-library">
            <h1>Today’s page is not ready.</h1>
          </section>
        );
      break;
    case "story":
      content = activeStory && storyPage ? (
        <MyStoryWorkspace
          audio={audio}
          commit={commit}
          defaultTextColor={
            activeStory.defaultTextColor
          }
          displayName={snapshot.settings.displayName}
          favouritePenColours={snapshot.settings.favouritePenColours}
          files={files}
          fingerDrawingEnabled={snapshot.settings.fingerDrawingEnabled}
          fingerErasingEnabled={snapshot.settings.fingerErasingEnabled}
          twoFingerUndoEnabled={snapshot.settings.twoFingerUndoEnabled}
          health={combinedHealth(health, drawingHealth)}
          key={storyPage.id}
          myWords={snapshot.settings.myWords}
          navigationObscured={
            navigationMenuOpen || navigationMenuOpening || helpModeActive
          }
          shapeEditingObscured={navigationMenuOpen || navigationMenuOpening}
          onAddPage={createStoryPage}
          onBack={() => {
            setActiveStoryId(undefined);
            setActiveStoryPageId(undefined);
          }}
          onDeletePage={deleteStoryPage}
          onDrawingHealthChange={setDrawingHealth}
          onReorderPages={(pageIds) =>
            commit({ type: "my-story-pages-reorder", storyId: activeStory.id, pageIds })
          }
          onSelectPage={setActiveStoryPageId}
          onToolChange={setActivePageTool}
          page={storyPage}
          pages={storyPages}
          penColor={snapshot.settings.penColor}
          penNib={snapshot.settings.penNib}
          penNibProfiles={snapshot.settings.penNibProfiles}
          penOpacity={snapshot.settings.penOpacity}
          penWidth={snapshot.settings.penWidth}
          recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
          share={share}
          sketchRepository={sketchRepository}
          textEditorPreference={snapshot.settings.textEditorPreference}
          tool={visibleWorkspaceTool}
          transcription={transcription}
          storyName={activeStory.name}
        />
      ) : (
        <StoriesView
          commit={commit}
          lastViewedStoryId={lastViewedStoryId}
          onCreateStory={createStory}
          onDeleteStory={deleteStory}
          onOpenStory={(storyId) => {
            setActiveStoryId(storyId);
            setActiveStoryPageId(undefined);
            setLastViewedStoryId(storyId);
          }}
          onRenameStory={(storyId, name) => commit({ type: "story-rename", storyId, name }) as Promise<boolean>}
          onReorderStories={(storyIds) => commit({ type: "stories-reorder", storyIds }) as Promise<boolean>}
          sketchRepository={sketchRepository}
          snapshot={snapshot}
        />
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
            fingerErasingEnabled={snapshot.settings.fingerErasingEnabled}
            twoFingerUndoEnabled={snapshot.settings.twoFingerUndoEnabled}
            favouritePenColours={snapshot.settings.favouritePenColours}
            penNib={snapshot.settings.penNib}
            penNibProfiles={snapshot.settings.penNibProfiles}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            myWords={snapshot.settings.myWords}
            navigationObscured={
              navigationMenuOpen || navigationMenuOpening || helpModeActive
            }
            shapeEditingObscured={navigationMenuOpen || navigationMenuOpening}
            recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
            textEditorPreference={snapshot.settings.textEditorPreference}
            share={share}
            sketchRepository={sketchRepository}
            tool={visibleWorkspaceTool}
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
            lastViewedSketchbookId={lastViewedSketchbookId}
            onCreateSketchbook={createSketchbook}
            onDeleteSketchbook={deleteSketchbook}
            onOpenSketchbook={(sketchbookId) => {
              setActiveSketchbookId(sketchbookId);
              setActiveSketchbookPageId(undefined);
              setLastViewedSketchbookId(sketchbookId);
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
          lastViewedFavouriteId={lastViewedFavouriteId}
          onOpenFavourite={openFavourite}
          onReorderFavourites={(favouriteIds) =>
            commit({
              type: "favourites-reorder",
              favouriteIds,
            })
          }
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
          historyStatus={historyStatus}
          key={snapshot.settings.lastSettingsTab}
          onEditPortrait={() => setPortraitEditorOpen(true)}
          onBackupNow={() => void backUpJournalInformation()}
          onCheckBackup={() => void refreshBackupStatus()}
          onKeepThisIPad={() => void keepThisIPadAfterConflict()}
          onSaveLocalCopy={() => void saveLocalConflictCopy()}
          onUseICloud={() => {
            void restoreICloudAfterConflict().then((restored) => {
              if (restored) reloadAfterRestore();
            });
          }}
          onCreateHistory={() => void createHistoryEntry("manual")}
          onDeleteHistory={(entry) => void deleteHistoryEntry(entry)}
          onDeleteCloudData={() => void deleteCloudData()}
          onPreviewWelcome={setWelcomePreview}
          onRefreshHistory={() => void refreshBackupHistory()}
          onRestoreHistory={(entry) => {
            void restoreHistoryEntry(entry).then((restored) => {
              if (restored) reloadAfterRestore();
            });
          }}
          sketchRepository={sketchRepository}
          settings={snapshot.settings}
          share={share}
          transcription={transcription}
          snapshot={snapshot}
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
        backupStatus={backupStatus}
        displayName={snapshot.settings.displayName}
        menuOpen={navigationMenuOpen}
        menuOpening={navigationMenuOpening}
        onMenuClose={closeNavigationMenu}
        onMenuOpen={() => void openNavigationMenu()}
        onSectionChange={openSection}
        sketchRepository={sketchRepository}
      />
      {welcomeVisible || welcomePreview ? null : (
        <HelpMode
          active={helpModeActive}
          onActiveChange={(active) => {
            if (active) {
              closeNavigationMenu();
            }
            setHelpModeActive(active);
          }}
        />
      )}
      {storageBlocked ? (
        <div className="storage-blocked-warning" role="alert">
          <strong>The diary cannot finish opening its saved storage.</strong>
          <span>Close other diary windows, then reopen this app.</span>
          <button onClick={() => globalThis.location.reload()} type="button">
            Reopen my diary
          </button>
        </div>
      ) : null}
      {restoreCompleteVisible ? (
        <RestoreCompleteDialog
          onDismiss={() => {
            globalThis.sessionStorage?.removeItem(RESTORE_COMPLETE_KEY);
            setRestoreCompleteVisible(false);
          }}
        />
      ) : null}
      {isNewJournal === true &&
      backupStatus.lastSuccessfulBackupAt ? (
        <NewDeviceRecoveryDialog
          busy={
            backupStatus.state === "syncing" ||
            historyStatus.state === "restoring"
          }
          entries={historyStatus.entries}
          message={
            backupStatus.state === "error"
              ? backupStatus.message
              : historyStatus.state === "error"
                ? historyStatus.message
                : undefined
          }
          onRestoreHistory={(entry) => {
            void restoreHistoryEntry(entry, { newDevice: true }).then(
              (restored) => {
                if (restored) acknowledgeNewJournal();
                if (restored) reloadAfterRestore();
              },
            );
          }}
          onRestoreLatest={() => {
            void restoreFromCloud().then((restored) => {
              if (restored) acknowledgeNewJournal();
              if (restored) reloadAfterRestore();
            });
          }}
          onStartNew={() => {
            acknowledgeNewJournal();
          }}
        />
      ) : null}
      <Suspense fallback={<div aria-busy="true" aria-label="Opening section" role="status" />}>
        {content}
      </Suspense>
      {portraitEditorOpen ? (
        <ProfilePortraitEditor
          initialPenSettings={{
            color: snapshot.settings.penColor,
            nib: snapshot.settings.penNib,
            profiles: snapshot.settings.penNibProfiles,
            width: snapshot.settings.penWidth,
            opacity: snapshot.settings.penOpacity,
            fingerDrawing: snapshot.settings.fingerDrawingEnabled,
            fingerErasing: snapshot.settings.fingerErasingEnabled,
            favouriteColours: snapshot.settings.favouritePenColours,
          }}
          interactionObscured={helpModeActive}
          twoFingerUndoEnabled={snapshot.settings.twoFingerUndoEnabled}
          onPenSettingsChange={(penSettings) => {
            void commit({
              type: "settings-update",
              settings: {
                penColor: penSettings.color,
                penNib: penSettings.nib ?? "pen",
                ...(penSettings.profiles ? { penNibProfiles: penSettings.profiles } : {}),
                ...(penSettings.favouriteColours
                  ? { favouritePenColours: [...penSettings.favouriteColours] }
                  : {}),
                penWidth: penSettings.width,
                penOpacity: penSettings.opacity,
                fingerDrawingEnabled: penSettings.fingerDrawing !== false,
                fingerErasingEnabled: penSettings.fingerErasing === true,
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
          interactionObscured={helpModeActive}
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
                ...(penSettings.favouriteColours
                  ? { favouritePenColours: [...penSettings.favouriteColours] }
                  : {}),
                penWidth: penSettings.width,
                penOpacity: penSettings.opacity,
                fingerDrawingEnabled: penSettings.fingerDrawing !== false,
                fingerErasingEnabled: penSettings.fingerErasing === true,
              },
            });
          }}
          onReturnToSettings={() => setWelcomePreview(undefined)}
          penColor={snapshot.settings.penColor}
          fingerDrawingEnabled={snapshot.settings.fingerDrawingEnabled}
          fingerErasingEnabled={snapshot.settings.fingerErasingEnabled}
          twoFingerUndoEnabled={snapshot.settings.twoFingerUndoEnabled}
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
