import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getNativeDrawingPreview,
  hasNativePencilKit,
  NATIVE_DRAWING_UPDATED_EVENT,
} from "../native/pencilKit";
import { PROFILE_PORTRAIT_DOCUMENT_ID } from "../sketch/specialDocuments";
import type { SketchRepository } from "../sketch/types";
import { SketchThumbnail } from "./SketchThumbnail";

export function ProfilePortrait({
  className = "",
  sketchRepository,
}: {
  className?: string;
  sketchRepository: SketchRepository;
}) {
  const [hasPortrait, setHasPortrait] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const inspectPortrait = async () => {
      const available = await (async () => {
        try {
          const sketch = await sketchRepository.load(PROFILE_PORTRAIT_DOCUMENT_ID);
          if (sketch.strokes.length > 0) return true;
          if (hasNativePencilKit()) {
            return (await getNativeDrawingPreview(PROFILE_PORTRAIT_DOCUMENT_ID)).available;
          }
          return false;
        } catch {
          return false;
        }
      })();
      if (!cancelled) setHasPortrait(available);
    };
    const handleNativeUpdate = (event: Event) => {
      const update = event as CustomEvent<{ documentId?: string }>;
      if (update.detail?.documentId === PROFILE_PORTRAIT_DOCUMENT_ID) {
        void inspectPortrait();
      }
    };
    const unsubscribe = sketchRepository.subscribe?.(
      PROFILE_PORTRAIT_DOCUMENT_ID,
      () => void inspectPortrait(),
    );
    globalThis.addEventListener(NATIVE_DRAWING_UPDATED_EVENT, handleNativeUpdate);
    void inspectPortrait();
    return () => {
      cancelled = true;
      unsubscribe?.();
      globalThis.removeEventListener(NATIVE_DRAWING_UPDATED_EVENT, handleNativeUpdate);
    };
  }, [sketchRepository]);

  return (
    <span aria-hidden="true" className={`profile-portrait ${className}`.trim()}>
      {hasPortrait ? null : <UserRound className="profile-portrait-fallback" />}
      <SketchThumbnail
        documentId={PROFILE_PORTRAIT_DOCUMENT_ID}
        repository={sketchRepository}
      />
    </span>
  );
}
