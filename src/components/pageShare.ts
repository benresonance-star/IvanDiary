import type { Page, TranscriptObject, VoiceRecordingObject } from "../domain/models";
import type { PageShareLink } from "../native/contracts";
import { webHttpUrl } from "../utils/webHttpUrl";
import { defaultObjectFrame } from "./arrangeGeometry";

export type PageShareContext =
  | { kind: "diary"; date: string }
  | { kind: "sketchbook"; sketchbook: { name: string } };

export function pageShareTitle({
  displayName,
  context,
}: {
  displayName: string;
  context: PageShareContext;
}): string {
  if (context.kind === "sketchbook") {
    return `${displayName} ${context.sketchbook.name}`.trim();
  }
  const date = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${context.date}T12:00:00`));
  return `${displayName} ${date}`.trim();
}

export function shareFileStem(title: string): string {
  const cleaned = title
    .replace(/[<>:"\\/|?*]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return cleaned.slice(0, 80) || "Journal-page";
}

export function pageShareRecordings(page: Page): {
  audioUris: string[];
  transcripts: string[];
  hasRecordings: boolean;
} {
  const transcriptsByRecording = new Map(
    page.objects
      .filter(
        (object): object is TranscriptObject => object.type === "transcript",
      )
      .map((transcript) => [transcript.recordingId, transcript] as const),
  );
  const recordings = page.objects.filter(
    (object): object is VoiceRecordingObject => object.type === "voice",
  );
  return {
    hasRecordings: recordings.length > 0,
    audioUris: recordings
      .map((recording) => recording.asset.localUri)
      .filter((uri) => uri.startsWith("file:")),
    transcripts: recordings.map((recording) => {
      const transcript = transcriptsByRecording.get(recording.id);
      return (
        transcript?.editedText?.trim() ||
        transcript?.rawText.trim() ||
        "No written text for this recording"
      );
    }),
  };
}

export function pageShareLinks(page: Page): PageShareLink[] {
  return page.objects.flatMap((object) => {
    if (object.type !== "link") {
      return [];
    }
    const url = webHttpUrl(object.url);
    if (!url) {
      return [];
    }
    const frame = defaultObjectFrame(object);
    const hostname = new URL(url).hostname;
    const title = object.title.trim() || hostname;
    return [
      {
        url,
        title,
        x: object.position.x,
        y: object.position.y,
        width: frame.width,
        height: frame.height,
      },
    ];
  });
}

export function paperShareRect(
  paper: HTMLElement | null,
): { x: number; y: number; width: number; height: number } | undefined {
  const rect = paper?.getBoundingClientRect();
  if (!rect || rect.width < 8 || rect.height < 8) {
    return undefined;
  }
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function controlShareRect(
  control: HTMLElement | null,
): { x: number; y: number; width: number; height: number } {
  const rect = control?.getBoundingClientRect();
  if (!rect) {
    return { x: 24, y: 24, width: 56, height: 56 };
  }
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, 44),
    height: Math.max(rect.height, 44),
  };
}

export async function waitForShareCapture(
  paper: HTMLElement | null,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
    window.setTimeout(finish, 120);
  });
  const started = Date.now();
  while (Date.now() - started < 400) {
    const preview = paper?.querySelector<HTMLImageElement>(
      ".native-sketch-preview",
    );
    if (preview?.complete && preview.naturalWidth > 0) {
      return;
    }
    if (preview && !preview.complete) {
      await new Promise<void>((resolve) => {
        const finish = () => resolve();
        preview.addEventListener("load", finish, { once: true });
        preview.addEventListener("error", finish, { once: true });
        window.setTimeout(finish, 250);
      });
      return;
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, 40);
    });
  }
}

export async function withShareTimeout<T>(
  operation: Promise<T>,
  milliseconds = 8_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Share timed out."));
    }, milliseconds);
    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
