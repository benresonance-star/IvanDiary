import { CircleHelp } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { HELP_TIPS, isHelpTopic, type HelpTopic } from "./helpContent";

type TargetSelection = {
  body?: string;
  element?: HTMLElement;
  title?: string;
  topic: HelpTopic;
};

type ViewportRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function currentViewport(): ViewportRect {
  const viewport = globalThis.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? globalThis.innerWidth;
  const height = viewport?.height ?? globalThis.innerHeight;
  return { bottom: top + height, left, right: left + width, top };
}

export function HelpMode({
  active,
  onActiveChange,
}: {
  active: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const shieldRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TargetSelection>({
    topic: "help-intro",
  });
  const [targetRect, setTargetRect] = useState<DOMRect>();
  const [tipPosition, setTipPosition] = useState({ left: 16, top: 88 });

  const updateTargetRect = useCallback(() => {
    setTargetRect(selection.element?.getBoundingClientRect());
  }, [selection.element]);

  useEffect(() => {
    if (!active) return;
    const update = () => updateTargetRect();
    globalThis.addEventListener("resize", update);
    globalThis.addEventListener("scroll", update, true);
    globalThis.visualViewport?.addEventListener("resize", update);
    globalThis.visualViewport?.addEventListener("scroll", update);
    return () => {
      globalThis.removeEventListener("resize", update);
      globalThis.removeEventListener("scroll", update, true);
      globalThis.visualViewport?.removeEventListener("resize", update);
      globalThis.visualViewport?.removeEventListener("scroll", update);
    };
  }, [active, updateTargetRect]);

  useEffect(() => {
    if (!active) return;
    const blockInactiveControl = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest(".help-mode-button") ||
          target.closest(".help-mode-shield"))
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onActiveChange(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
        return;
      }
      blockInactiveControl(event);
    };
    document.addEventListener("click", blockInactiveControl, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", blockInactiveControl, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, onActiveChange]);

  useLayoutEffect(() => {
    if (!active || !tipRef.current) return;
    const viewport = currentViewport();
    const margin = 16;
    const gap = 12;
    const tipBounds = tipRef.current.getBoundingClientRect();
    const width = Math.min(tipBounds.width, viewport.right - viewport.left - margin * 2);
    let left = viewport.right - width - margin;
    let top = viewport.top + 88;

    if (targetRect) {
      left = targetRect.left + targetRect.width / 2 - width / 2;
      top = targetRect.bottom + gap;
      if (top + tipBounds.height > viewport.bottom - margin) {
        top = targetRect.top - tipBounds.height - gap;
      }
    }

    left = Math.max(
      viewport.left + margin,
      Math.min(left, viewport.right - width - margin),
    );
    top = Math.max(
      viewport.top + margin,
      Math.min(top, viewport.bottom - tipBounds.height - margin),
    );
    setTipPosition({ left, top });
  }, [active, selection.topic, targetRect]);

  const inspectAt = (clientX: number, clientY: number) => {
    const shield = shieldRef.current;
    if (!shield) return;
    shield.style.pointerEvents = "none";
    const underlying = document.elementFromPoint(clientX, clientY);
    shield.style.pointerEvents = "";
    const helpTarget = underlying?.closest<HTMLElement>("[data-help-topic]");
    const topic = helpTarget?.dataset.helpTopic;
    if (!helpTarget || !topic || !isHelpTopic(topic)) {
      setSelection({ topic: "help-intro" });
      setTargetRect(undefined);
      return;
    }
    setSelection({
      body: helpTarget.dataset.helpBody,
      element: helpTarget,
      title: helpTarget.dataset.helpTitle,
      topic,
    });
    setTargetRect(helpTarget.getBoundingClientRect());
  };

  const registeredTip = HELP_TIPS[selection.topic];
  const tip = {
    body: selection.body ?? registeredTip.body,
    title: selection.title ?? registeredTip.title,
  };

  return (
    <>
      {active ? (
        <>
        <button
          aria-label="Choose an item for help"
          className="help-mode-shield"
          onContextMenu={(event) => event.preventDefault()}
          onPointerUp={(event) => inspectAt(event.clientX, event.clientY)}
          ref={shieldRef}
          type="button"
        />
          {targetRect ? (
            <span
              className="help-target-highlight"
              style={{
                height: targetRect.height,
                left: targetRect.left,
                top: targetRect.top,
                width: targetRect.width,
              }}
            />
          ) : null}
          <div
            aria-atomic="true"
            aria-live="polite"
            className="help-tip-card"
            ref={tipRef}
            role="status"
            style={tipPosition}
          >
            <strong>{tip.title}</strong>
            <span>{tip.body}</span>
          </div>
        </>
      ) : null}
      <button
        aria-label={active ? "Finish help" : "Turn on help"}
        aria-pressed={active}
        className={`help-mode-button${active ? " active" : ""}`}
        onClick={() => {
          const nextActive = !active;
          if (nextActive) {
            setSelection({ topic: "help-intro" });
            setTargetRect(undefined);
          }
          onActiveChange(nextActive);
        }}
        ref={buttonRef}
        type="button"
      >
        <CircleHelp aria-hidden="true" />
        {active ? <span>Finish help</span> : null}
      </button>
    </>
  );
}
