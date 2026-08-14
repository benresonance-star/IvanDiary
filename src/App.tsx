import { useEffect, useMemo, useRef, useState } from "react";

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
  type Favourite,
  type JournalSnapshot,
  type Page,
  type SaveHealth,
} from "./domain/models";
import { useBackupSync } from "./hooks/useBackupSync";
import { useJournal } from "./hooks/useJournal";
import { nativeDrawingOverlayCoordinator } from "./hooks/nativeDrawingOverlayCoordinator";
import { createAppServices } from "./native/composition";
import {
  deleteNativeDrawing,
  flushNativeDrawingOverlay,
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
  subscribeNativeDrawingChanges,
} from "./native/pencilKit";
import { BrowserJournalRepository } from "./repository/browserJournalRepository";
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
  const { audio, backup, files, lifecycle, runtime, share, transcription } = services;
  const { clearMessage, commit, flush, health, message, replace, snapshot } =
    useJournal(journalRepository);
  const [activeSection, setActiveSection] =
    useState<AppSection>("diary");
  const [activeDayId, setActiveDayId] = useState<string>();
  const [drawingHealth, setDrawingHealth] = useState<SaveHealth>(
    INITIAL_DRAWING_HEALTH,
  );
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [activeDiaryPageId, setActiveDiaryPageId] = useState<string>();
  const [activePageTool, setActivePageTool] = useState<PageTool>("view");
  const [activeSketchbookId, setActiveSketchbookId] = useState<string>();
  const [activeSketchbookPageId, setActiveSketchbookPageId] =
    useState<string>();
  const [lastViewedSketchbookId, setLastViewedSketchbookId] =
    useState<string>();
  const [lastViewedFavouriteId, setLastViewedFavouriteId] =
    useState<string>();
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [navigationMenuOpening, setNavigationMenuOpening] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomePreview, setWelcomePreview] = useState<WelcomeCopy>();
  const [portraitEditorOpen, setPortraitEditorOpen] = useState(false);
  const [entryDates, setEntryDates] = useState<Set<string>>(() => new Set());
  const [entryDatesTick, setEntryDatesTick] = useState(0);
  const [drawingBackupTick, setDrawingBackupTick] = useState(0);
  const flushEntryDatesOnTickRef = useRef(false);
  const todayOpeningRef = useRef<string | undefined>(undefined);
  const drawingBackupTickRef = useRef(0);
  const {
    backupStatus,
    backUpJournalInformation,
    refreshBackupStatus,
    restoreFromCloud,
  } = useBackupSync({
    backup,
    drawingBackupTick,
    drawingBackupTickRef,
    replace,
    runtime,
    snapshot,
  });

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
            favouritePenColours={snapshot.settings.favouritePenColours}
            penNib={snapshot.settings.penNib}
            penNibProfiles={snapshot.settings.penNibProfiles}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            myWords={snapshot.settings.myWords}
            navigationObscured={navigationMenuOpen || navigationMenuOpening}
            recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
            share={share}
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
            navigationObscured={navigationMenuOpen || navigationMenuOpening}
            recordingLimitMinutes={snapshot.settings.recordingLimitMinutes}
            share={share}
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
          key={snapshot.settings.lastSettingsTab}
          onEditPortrait={() => setPortraitEditorOpen(true)}
          onBackupNow={() => void backUpJournalInformation()}
          onCheckBackup={() => void refreshBackupStatus()}
          onPreviewWelcome={setWelcomePreview}
          onRestore={() => void restoreFromCloud()}
          sketchRepository={sketchRepository}
          settings={snapshot.settings}
          transcription={transcription}
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
      {storageBlocked ? (
        <div className="storage-blocked-warning" role="alert">
          <strong>The diary cannot finish opening its saved storage.</strong>
          <span>Close other diary windows, then reopen this app.</span>
          <button onClick={() => globalThis.location.reload()} type="button">
            Reopen my diary
          </button>
        </div>
      ) : null}
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
