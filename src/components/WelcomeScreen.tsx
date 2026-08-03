import { useCallback, useEffect, useRef, useState } from "react";

export type WelcomeCopy = {
  greeting: string;
  tagline: string;
  message: string;
};

export function WelcomeScreen({
  copy,
  onDismiss,
  reducedMotion,
}: {
  copy: WelcomeCopy;
  onDismiss: () => void;
  reducedMotion: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const dismissRef = useRef(onDismiss);
  const finishTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  const dismiss = useCallback(() => {
    if (reducedMotion) {
      dismissRef.current();
      return;
    }
    setLeaving(true);
    window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(
      () => dismissRef.current(),
      350,
    );
  }, [reducedMotion]);

  useEffect(() => {
    const leaveTimer = window.setTimeout(
      () => {
        if (reducedMotion) {
          dismissRef.current();
        } else {
          setLeaving(true);
        }
      },
      reducedMotion ? 3000 : 2650,
    );
    if (!reducedMotion) {
      finishTimerRef.current = window.setTimeout(
        () => dismissRef.current(),
        3000,
      );
    }
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimerRef.current);
    };
  }, [reducedMotion]);

  const accessibleText = [copy.greeting, copy.tagline, copy.message]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-label={`${accessibleText}. Open diary`}
      className={`welcome-screen${leaving ? " leaving" : ""}`}
      data-reduced-motion={reducedMotion}
      onClick={dismiss}
      type="button"
    >
      <span aria-hidden="true" className="welcome-content">
        <strong>{copy.greeting}</strong>
        <span>{copy.tagline}</span>
        {copy.message ? <q>{copy.message}</q> : null}
        <small>Tap to continue</small>
      </span>
    </button>
  );
}
