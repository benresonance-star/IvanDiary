import { describe, expect, it } from "vitest";

import { createInitialJournalSnapshot } from "../domain/initialState";
import {
  DOCUMENT_SCHEMA_VERSION,
  type Page,
  type DocumentOperation,
  type JournalSnapshot,
  type Sketchbook,
  type TextObject,
} from "../domain/models";
import { BrowserJournalRepository } from "./browserJournalRepository";
import { developmentDatabase } from "./developmentDatabase";

describe("BrowserJournalRepository", () => {
  it("commits snapshot and operation atomically, then recovers from the log", async () => {
    const journalId = "repository-test-journal";
    const seedFactory = () => ({
      ...createInitialJournalSnapshot(
        new Date("2026-08-03T09:00:00.000Z"),
      ),
      id: journalId,
    });
    const repository = new BrowserJournalRepository(journalId, seedFactory);
    const loaded = await repository.load();
    const page = loaded.snapshot.pages[0]!;
    const object: TextObject = {
      id: "repository-text",
      type: "text",
      pageId: page.id,
      position: { x: 0.2, y: 0.5 },
      createdAt: "2026-08-03T10:00:00.000Z",
      revision: 0,
      text: "Stored before interruption",
      textScale: 1,
    };
    const operation: DocumentOperation = {
      id: "repository-operation",
      type: "page-object-add",
      journalId,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: "2026-08-03T10:00:00.000Z",
      pageId: page.id,
      object,
    };

    const committed = await repository.commit(operation);
    expect(committed.snapshot.revision).toBe(1);
    expect(committed.health.localDurability).toBe("saved");

    const replayed = await repository.commit(operation);
    expect(replayed.snapshot.revision).toBe(1);
    expect(
      replayed.snapshot.pages[0]?.objects.filter(
        (candidate) => candidate.id === object.id,
      ),
    ).toHaveLength(1);

    const instance = await developmentDatabase();
    await instance.put("journalSnapshots", {
      id: journalId,
      schemaVersion: 99,
    } as unknown as JournalSnapshot);

    const recovered = await repository.load();
    expect(recovered.recoveredFromOperationLog).toBe(true);
    expect(recovered.snapshot.revision).toBe(1);
    expect(recovered.snapshot.pages[0]?.objects).toContainEqual(object);
  });

  it("checkpoints long operation histories into a fresh recovery baseline", async () => {
    const journalId = "repository-checkpoint-test-journal";
    const repository = new BrowserJournalRepository(journalId, () => ({
      ...createInitialJournalSnapshot(
        new Date("2026-08-03T09:00:00.000Z"),
      ),
      id: journalId,
    }));
    await repository.load();

    for (let revision = 0; revision < 100; revision += 1) {
      const committed = await repository.commit({
        id: `checkpoint-operation-${revision}`,
        type: "settings-update",
        journalId,
        baseRevision: revision,
        resultingRevision: revision + 1,
        createdAt: new Date(
          Date.UTC(2026, 7, 3, 10, 0, revision),
        ).toISOString(),
        settings: { welcomeMessage: `Revision ${revision + 1}` },
      });
      if (revision === 99) {
        expect(committed.health.pendingOperationCount).toBe(0);
      }
    }

    const instance = await developmentDatabase();
    expect(
      await instance.countFromIndex(
        "journalOperations",
        "by-journal",
        journalId,
      ),
    ).toBe(0);
    await instance.put("journalSnapshots", {
      id: journalId,
      schemaVersion: 99,
    } as unknown as JournalSnapshot);

    const recovered = await repository.load();
    expect(recovered.recoveredFromOperationLog).toBe(true);
    expect(recovered.snapshot.revision).toBe(100);
    expect(recovered.snapshot.settings.welcomeMessage).toBe("Revision 100");
  });

  it("persists a new page and its journal-day order together", async () => {
    const journalId = "repository-page-test-journal";
    const repository = new BrowserJournalRepository(journalId, () => ({
      ...createInitialJournalSnapshot(
        new Date("2026-08-03T09:00:00.000Z"),
      ),
      id: journalId,
    }));
    const loaded = await repository.load();
    const day = loaded.snapshot.days[0]!;
    const page: Page = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: "repository-second-page",
      journalDayId: day.id,
      paperStyle: "warm-journal",
      drawingDocumentId: "repository-second-drawing",
      objects: [],
      revision: 0,
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
    };

    await repository.commit({
      id: "repository-create-page",
      type: "page-create",
      journalId,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: page.createdAt,
      journalDayId: day.id,
      page,
    });

    const reopened = await repository.load();
    expect(reopened.snapshot.pages).toContainEqual(page);
    expect(reopened.snapshot.days[0]?.pageIds).toEqual([
      ...day.pageIds,
      page.id,
    ]);
  });

  it("persists a sketchbook and its first page atomically", async () => {
    const journalId = "repository-sketchbook-test-journal";
    const repository = new BrowserJournalRepository(journalId, () => ({
      ...createInitialJournalSnapshot(
        new Date("2026-08-03T09:00:00.000Z"),
      ),
      id: journalId,
    }));
    await repository.load();
    const page: Page = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: "repository-sketch-page",
      sketchbookId: "repository-sketchbook",
      paperStyle: "sketch-paper",
      drawingDocumentId: "repository-sketch-drawing",
      objects: [],
      revision: 0,
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
    };
    const sketchbook: Sketchbook = {
      id: "repository-sketchbook",
      name: "Animals",
      pageIds: [page.id],
      favourite: false,
      revision: 0,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };

    await repository.commit({
      id: "repository-create-sketchbook",
      type: "sketchbook-create-with-page",
      journalId,
      baseRevision: 0,
      resultingRevision: 1,
      createdAt: page.createdAt,
      sketchbook,
      page,
    });

    const reopened = await repository.load();
    expect(reopened.snapshot.sketchbooks).toContainEqual(sketchbook);
    expect(reopened.snapshot.pages).toContainEqual(page);
  });
});
