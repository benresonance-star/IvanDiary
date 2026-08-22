import type { JournalSnapshot, Page } from "../domain/models";

function pageText(page: Page): string[] {
  const lines: string[] = [];
  for (const object of page.objects) {
    if (object.type === "text" && object.text.trim()) {
      lines.push(object.text.trim());
    } else if (object.type === "transcript") {
      const transcript = object.editedText?.trim() || object.rawText.trim();
      if (transcript) lines.push(`Transcript: ${transcript}`);
    } else if (object.type === "link") {
      lines.push(`Link: ${object.title || object.url} — ${object.url}`);
    } else if (object.type === "photo") {
      lines.push(`Photo: ${object.altText || object.asset.id}`);
    } else if (object.type === "voice") {
      lines.push(`Voice recording: ${object.asset.id}`);
    }
  }
  lines.push(`Drawing: ${page.drawingDocumentId}`);
  return lines;
}

export function readableDiaryText(snapshot: JournalSnapshot): string {
  const lines = [
    "iPad App — Complete Diary Export",
    `Exported: ${new Date().toLocaleString()}`,
    `Name: ${snapshot.settings.displayName}`,
    "",
    "WELCOME",
    snapshot.settings.welcomeGreeting,
    snapshot.settings.welcomeTagline,
    snapshot.settings.welcomeMessage || "No additional welcome message.",
    "Drawing: welcome-screen-drawing",
    "Portrait drawing: profile-portrait-drawing",
  ];

  for (const day of [...snapshot.days].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push("", `JOURNAL — ${day.date}`);
    day.pageIds.forEach((pageId, index) => {
      const page = snapshot.pages.find((candidate) => candidate.id === pageId);
      if (!page) return;
      lines.push(`Page ${index + 1}`, ...pageText(page));
    });
  }

  for (const sketchbook of snapshot.sketchbooks) {
    lines.push("", `SKETCHBOOK — ${sketchbook.name}`);
    sketchbook.pageIds.forEach((pageId, index) => {
      const page = snapshot.pages.find((candidate) => candidate.id === pageId);
      if (!page) return;
      lines.push(`Page ${index + 1}`, ...pageText(page));
    });
  }

  for (const story of snapshot.stories) {
    lines.push("", `STORY — ${story.name}`);
    story.pages.forEach((page, index) => {
      lines.push(`Page ${index + 1}`);
      for (const block of page.textBlocks) {
        if (block.text.trim()) lines.push(block.text.trim());
      }
      for (const link of page.links) lines.push(`Link: ${link.title || link.url} — ${link.url}`);
      for (const photo of page.photos) lines.push(`Photo: ${photo.altText || photo.asset.id}`);
      for (const recording of page.recordings) lines.push(`Voice recording: ${recording.asset.id}`);
      lines.push(`Drawing: ${page.drawingDocumentId}`);
    });
  }

  lines.push(
    "",
    "ABOUT THIS EXPORT",
    "The PDF is a readable index of the diary. The accompanying TAR archive contains diary.json and all available original photos, voice recordings, and PencilKit drawings. Links and page structure are preserved in diary.json.",
  );
  return lines.join("\n");
}
