import { useEffect, useMemo, useRef, useState } from "react";

import { PageWorkspace } from "./components/JournalPage";
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
import {
  WelcomeScreen,
  type WelcomeCopy,
} from "./components/WelcomeScreen";
import {
  DOCUMENT_SCHEMA_VERSION,
  type Favourite,
  type JournalSnapshot,
  type Page,
  type SaveHealth,
} from "./domain/models";
import { useJournal } from "./hooks/useJournal";
import { createAppServices } from "./native/composition";
import {
  flushNativeDrawingOverlay,
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
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
  const { audio, transcription } = services;
  const { clearMessage, commit, health, message, snapshot } =
    useJournal(journalRepository);
  const [activeSection, setActiveSection] =
    useState<AppSection>("diary");
  const [activeDayId, setActiveDayId] = useState<string>();
  const [drawingHealth, setDrawingHealth] = useState<SaveHealth>(
    INITIAL_DRAWING_HEALTH,
  );
  const [activeDiaryPageId, setActiveDiaryPageId] = useState<string>();
  const [activeSketchbookId, setActiveSketchbookId] = useState<string>();
  const [activeSketchbookPageId, setActiveSketchbookPageId] =
    useState<string>();
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomePreview, setWelcomePreview] = useState<WelcomeCopy>();
  const [entryDates, setEntryDates] = useState<Set<string>>(() => new Set());
  const [entryDatesTick, setEntryDatesTick] = useState(0);
  const flushEntryDatesOnTickRef = useRef(false);

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
    if (!day || !page) {
      return;
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
    if (!activeSketchbook) {
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
            context={{
              kind: "diary",
              date: day.date,
              favourite: day.favourite,
              journalDayId: day.id,
            }}
            entryDates={entryDates}
            health={combinedHealth(health, drawingHealth)}
            key={page.id}
            onAddPage={() => void createDiaryPage()}
            onDrawingHealthChange={setDrawingHealth}
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
            page={page}
            pages={dayPages}
            penColor={snapshot.settings.penColor}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            simpleMode={snapshot.settings.simpleMode}
            sketchRepository={sketchRepository}
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
            health={combinedHealth(health, drawingHealth)}
            key={sketchbookPage.id}
            onAddPage={() => void addSketchbookPage()}
            onDrawingHealthChange={setDrawingHealth}
            onReorderPages={(pageIds) =>
              commit({
                type: "sketchbook-pages-reorder",
                sketchbookId: activeSketchbook.id,
                pageIds,
              })
            }
            onSelectPage={setActiveSketchbookPageId}
            page={sketchbookPage}
            pages={sketchbookPages}
            penColor={snapshot.settings.penColor}
            penOpacity={snapshot.settings.penOpacity}
            penWidth={snapshot.settings.penWidth}
            simpleMode={snapshot.settings.simpleMode}
            sketchRepository={sketchRepository}
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
            onCreateSketchbook={createSketchbook}
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
          onOpenFavourite={openFavourite}
          sketchRepository={sketchRepository}
          snapshot={snapshot}
        />
      );
      break;
    case "settings":
      content = (
        <SettingsView
          commit={commit}
          onPreviewWelcome={setWelcomePreview}
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
        onSectionChange={setActiveSection}
      />
      {content}
      {welcomeVisible || welcomePreview ? (
        <WelcomeScreen
          copy={
            welcomePreview ?? {
              greeting: snapshot.settings.welcomeGreeting,
              tagline: snapshot.settings.welcomeTagline,
              message: snapshot.settings.welcomeMessage,
            }
          }
          onDismiss={() => {
            if (welcomePreview) {
              setWelcomePreview(undefined);
            } else {
              setWelcomeVisible(false);
            }
          }}
          reducedMotion={snapshot.settings.reducedMotion}
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
