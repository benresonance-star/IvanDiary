import {
  Edit3,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { TextObject } from "../domain/models";
import {
  adjustCanvasTextScale,
  CANVAS_TEXT_SCALE_MAX,
  CANVAS_TEXT_SCALE_MIN,
} from "./canvasTextScale";
import { ARRANGEABLE_LAYOUT_EVENT } from "./ArrangeablePageObject";

type TextToolbarSection = "look";
type ToolbarPosition = { left: number; top: number };
type PanelPosition = ToolbarPosition;
type ToolbarSide = "left" | "right";

const SECTION_IDS: Record<TextToolbarSection, string> = {
  look: "contextual-text-look",
};

export function ContextualTextEditor({
  object,
  onEdit,
  panelOpen,
  onPanelOpenChange,
  onPreview,
  onUpdate,
}: {
  object: TextObject;
  onEdit: () => void;
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  onPreview?: (next: TextObject) => void;
  onUpdate: (next: TextObject) => void;
}) {
  const [localActiveSection, setLocalActiveSection] = useState<TextToolbarSection>();
  const activeSection = panelOpen === undefined
    ? localActiveSection
    : panelOpen ? "look" : undefined;
  const [outlineWidthDraft, setOutlineWidthDraft] = useState(object.outlineWidth ?? 2);
  const [panelMaxHeight, setPanelMaxHeight] = useState(390);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({ left: 12, top: 84 });
  const [position, setPosition] = useState<ToolbarPosition>({ left: 12, top: 84 });
  const [side, setSide] = useState<ToolbarSide>("right");
  const animationFrameRef = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const widthCommittedRef = useRef(true);
  const colourCommitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingColourRef = useRef<TextObject | undefined>(undefined);
  const onUpdateRef = useRef(onUpdate);
  const rememberedBackgroundColourRef = useRef(object.backgroundColor ?? "#fffaf0");
  const rememberedOutlineColourRef = useRef(object.outlineColor ?? "#3f3528");
  const textScale = object.textScale ?? 1;

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (object.backgroundColor) rememberedBackgroundColourRef.current = object.backgroundColor;
    if (object.outlineColor) rememberedOutlineColourRef.current = object.outlineColor;
  }, [object.backgroundColor, object.id, object.outlineColor]);

  useLayoutEffect(() => {
    const place = () => {
      const primary = primaryRef.current?.getBoundingClientRect();
      const selector = `[data-object-id="${object.id}"]`;
      const anchorElement = document.querySelector<HTMLElement>(selector);
      const canvasElement = anchorElement?.closest<HTMLElement>(".paper-page");
      const anchor = anchorElement?.getBoundingClientRect();
      const canvas = canvasElement?.getBoundingClientRect();
      if (!primary || !anchor || !canvas) return;

      const viewport = globalThis.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const visibleLeft = Math.max(canvas.left, viewportLeft);
      const visibleTop = Math.max(canvas.top, viewportTop);
      const visibleRight = Math.min(
        canvas.right,
        viewportLeft + (viewport?.width ?? globalThis.innerWidth),
      );
      const visibleBottom = Math.min(
        canvas.bottom,
        viewportTop + (viewport?.height ?? globalThis.innerHeight),
      );
      const margin = 12;
      const panelGap = 7;
      const panelWidth = Math.min(380, visibleRight - visibleLeft - margin * 2);
      const candidates: Record<ToolbarSide, number> = {
        left: anchor.left - primary.width - margin,
        right: anchor.right + 36,
      };
      const rightKeepsLookClear =
        candidates.right + primary.width + panelGap + panelWidth <=
        visibleRight - margin;
      const nextSide: ToolbarSide = rightKeepsLookClear ? "right" : "left";
      setSide(nextSide);
      const nextPosition = {
        left: Math.max(
          visibleLeft + margin,
          Math.min(candidates[nextSide], visibleRight - primary.width - margin),
        ),
        top: Math.max(
          visibleTop + margin,
          Math.min(anchor.top, visibleBottom - primary.height - margin),
        ),
      };
      setPosition(nextPosition);
      setPanelMaxHeight(Math.max(88, Math.min(390, visibleBottom - nextPosition.top - margin)));
    };

    const schedulePlace = () => {
      if (animationFrameRef.current !== undefined) return;
      animationFrameRef.current = globalThis.requestAnimationFrame(() => {
        animationFrameRef.current = undefined;
        place();
      });
    };
    place();
    globalThis.addEventListener("resize", schedulePlace);
    globalThis.addEventListener("scroll", schedulePlace, true);
    globalThis.visualViewport?.addEventListener("resize", schedulePlace);
    globalThis.visualViewport?.addEventListener("scroll", schedulePlace);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedulePlace);
    const anchorElement = document.querySelector<HTMLElement>(`[data-object-id="${object.id}"]`);
    anchorElement?.addEventListener(ARRANGEABLE_LAYOUT_EVENT, place);
    if (primaryRef.current) observer?.observe(primaryRef.current);
    if (anchorElement) observer?.observe(anchorElement);
    const canvasElement = anchorElement?.closest<HTMLElement>(".paper-page");
    if (canvasElement) observer?.observe(canvasElement);
    return () => {
      globalThis.removeEventListener("resize", schedulePlace);
      globalThis.removeEventListener("scroll", schedulePlace, true);
      globalThis.visualViewport?.removeEventListener("resize", schedulePlace);
      globalThis.visualViewport?.removeEventListener("scroll", schedulePlace);
      anchorElement?.removeEventListener(ARRANGEABLE_LAYOUT_EVENT, place);
      observer?.disconnect();
      if (animationFrameRef.current !== undefined) {
        globalThis.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [object.frame, object.id, object.position]);

  useLayoutEffect(() => {
    if (!activeSection) return;
    const placePanel = () => {
      const panel = panelRef.current?.getBoundingClientRect();
      const primary = primaryRef.current?.getBoundingClientRect();
      const anchor = document.querySelector<HTMLElement>(
        `[data-object-id="${object.id}"]`,
      );
      const canvas = anchor?.closest<HTMLElement>(".paper-page")?.getBoundingClientRect();
      if (!panel || !primary || !canvas) return;
      const viewport = globalThis.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const visibleLeft = Math.max(canvas.left, viewportLeft) + 12;
      const visibleTop = Math.max(canvas.top, viewportTop) + 12;
      const visibleRight = Math.min(
        canvas.right,
        viewportLeft + (viewport?.width ?? globalThis.innerWidth),
      ) - 12;
      const visibleBottom = Math.min(
        canvas.bottom,
        viewportTop + (viewport?.height ?? globalThis.innerHeight),
      ) - 12;
      const right = primary.right + 7;
      const left = primary.left - panel.width - 7;
      const preferred = side === "right" ? right : left;
      const alternate = side === "right" ? left : right;
      const fits = (candidate: number) =>
        candidate >= visibleLeft && candidate + panel.width <= visibleRight;
      const panelLeft = fits(preferred)
        ? preferred
        : fits(alternate)
          ? alternate
          : Math.max(visibleLeft, Math.min(preferred, visibleRight - panel.width));
      const availableHeight = Math.max(0, visibleBottom - visibleTop);
      const contentHeight = Math.min(
        390,
        availableHeight,
        Math.max(panel.height, panelRef.current?.scrollHeight ?? 0),
      );
      const panelTop = Math.max(
        visibleTop,
        Math.min(primary.top, visibleBottom - contentHeight),
      );
      setPanelPosition({ left: panelLeft, top: panelTop });
      setPanelMaxHeight(contentHeight);
    };
    placePanel();
    globalThis.addEventListener("resize", placePanel);
    globalThis.visualViewport?.addEventListener("resize", placePanel);
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(placePanel);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      globalThis.removeEventListener("resize", placePanel);
      globalThis.visualViewport?.removeEventListener("resize", placePanel);
      observer?.disconnect();
    };
  }, [activeSection, object.id, side]);

  const toggleSection = (section: TextToolbarSection) => {
    const next = activeSection === section ? undefined : section;
    if (panelOpen === undefined) {
      setLocalActiveSection(next);
    }
    onPanelOpenChange?.(Boolean(next));
  };

  useEffect(() => {
    if (!activeSection) return;
    const collapse = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (panelOpen === undefined) {
        setLocalActiveSection(undefined);
      }
      onPanelOpenChange?.(false);
    };
    document.addEventListener("keydown", collapse);
    return () => document.removeEventListener("keydown", collapse);
  }, [activeSection, onPanelOpenChange, panelOpen]);

  useEffect(() => () => onPanelOpenChange?.(false), [onPanelOpenChange]);

  useEffect(() => () => {
    if (colourCommitTimerRef.current) {
      clearTimeout(colourCommitTimerRef.current);
    }
    if (pendingColourRef.current) {
      onUpdateRef.current(pendingColourRef.current);
    }
  }, []);

  const flushPendingColour = () => {
    if (!pendingColourRef.current) return;
    if (colourCommitTimerRef.current) {
      clearTimeout(colourCommitTimerRef.current);
      colourCommitTimerRef.current = undefined;
    }
    const pending = pendingColourRef.current;
    pendingColourRef.current = undefined;
    onUpdateRef.current(pending);
  };

  const commitUpdate = (next: TextObject) => {
    flushPendingColour();
    onUpdate(next);
  };

  const previewColour = (
    field: "color" | "backgroundColor" | "outlineColor",
    colour: string,
  ) => {
    if (field === "backgroundColor") rememberedBackgroundColourRef.current = colour;
    if (field === "outlineColor") rememberedOutlineColourRef.current = colour;
    const source = pendingColourRef.current ?? object;
    const { material: _material, goldFinish: _goldFinish, ...solidObject } = source;
    const base = field === "color" ? solidObject : source;
    if (field === "color") {
      void _material;
      void _goldFinish;
    }
    const next = {
      ...base,
      [field]: colour,
      revision: pendingColourRef.current
        ? source.revision
        : object.revision + 1,
    };
    pendingColourRef.current = next;
    onPreview?.(next);
    if (colourCommitTimerRef.current) {
      clearTimeout(colourCommitTimerRef.current);
    }
    colourCommitTimerRef.current = setTimeout(() => {
      pendingColourRef.current = undefined;
      colourCommitTimerRef.current = undefined;
      onUpdateRef.current(next);
    }, 120);
  };

  const commitOutlineWidth = () => {
    if (widthCommittedRef.current) return;
    widthCommittedRef.current = true;
    commitUpdate({ ...object, outlineWidth: outlineWidthDraft, revision: object.revision + 1 });
  };

  const sectionButton = (
    section: TextToolbarSection,
    label: string,
    icon: ReactNode,
  ) => (
    <button
      aria-controls={SECTION_IDS[section]}
      aria-expanded={activeSection === section}
      aria-pressed={activeSection === section}
      onClick={() => toggleSection(section)}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <aside
        aria-label="Text editing commands"
        className={`contextual-text-toolbar side-${side}`}
        style={position as CSSProperties}
      >
        <div aria-label="Text editing toolbar" className="contextual-text-primary" ref={primaryRef} role="toolbar">
          <button className="contextual-text-edit" onClick={() => {
            flushPendingColour();
            onEdit();
          }} type="button">
            <Edit3 aria-hidden="true" /><span>Edit text</span>
          </button>
          {sectionButton("look", "Look", <Sparkles aria-hidden="true" />)}
        </div>

        {activeSection === "look" ? (
          <section aria-label="Text look options" className="contextual-text-panel contextual-text-look" id={SECTION_IDS.look} ref={panelRef} style={{ ...panelPosition, maxHeight: panelMaxHeight }}>
            <div className="contextual-text-colour-row">
              <label>
                <span>Text colour</span>
                <input aria-label="Text colour" onChange={(event) => previewColour("color", event.target.value)} type="color" value={object.color ?? "#201c17"} />
              </label>
            </div>
            <button
              aria-pressed={object.material === "scripture-gold"}
              className="contextual-text-gold"
              onClick={() => commitUpdate({
                ...object,
                color: object.material === "scripture-gold" ? "#201c17" : "#b8862f",
                material: object.material === "scripture-gold" ? "solid" : "scripture-gold",
                goldFinish: object.goldFinish ?? "raised",
                revision: object.revision + 1,
              })}
              type="button"
            >Scripture Gold</button>
            {object.material === "scripture-gold" ? (
              <div aria-label="Gold text finish" className="contextual-text-segments" role="group">
                {(["smooth", "raised", "sparkle"] as const).map((finish) => (
                  <button aria-pressed={(object.goldFinish ?? "raised") === finish} key={finish} onClick={() => commitUpdate({ ...object, goldFinish: finish, revision: object.revision + 1 })} type="button">
                    {finish[0]!.toUpperCase() + finish.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
            <div aria-label="Text size" className="contextual-text-size" role="group">
              <span>Text size</span>
              <button
                aria-label="Decrease text size"
                disabled={textScale <= CANVAS_TEXT_SCALE_MIN}
                onClick={() => commitUpdate({ ...object, textScale: adjustCanvasTextScale(textScale, -1), revision: object.revision + 1 })}
                type="button"
              ><Minus aria-hidden="true" /></button>
              <output aria-label="Current text size">{Math.round(textScale * 100)}%</output>
              <button
                aria-label="Increase text size"
                disabled={textScale >= CANVAS_TEXT_SCALE_MAX}
                onClick={() => commitUpdate({ ...object, textScale: adjustCanvasTextScale(textScale, 1), revision: object.revision + 1 })}
                type="button"
              ><Plus aria-hidden="true" /></button>
            </div>
            <div aria-label="Text position" className="contextual-text-position" role="group">
              <span>Text position</span>
              {(["top", "center"] as const).map((verticalAlign) => (
                <button
                  aria-pressed={(object.verticalAlign ?? "center") === verticalAlign}
                  key={verticalAlign}
                  onClick={() => commitUpdate({ ...object, verticalAlign, revision: object.revision + 1 })}
                  type="button"
                >
                  {verticalAlign === "top" ? "Top" : "Centre"}
                </button>
              ))}
            </div>
            <div aria-label="Text structure" className="contextual-text-segments" role="group">
              {([["title", "Title"], ["heading", "Heading"], ["body", "Main Text"]] as const).map(([role, label]) => (
                <button aria-pressed={(object.role ?? "body") === role} key={role} onClick={() => commitUpdate({ ...object, role, revision: object.revision + 1 })} type="button">{label}</button>
              ))}
            </div>
            <div aria-label="Text background" className="contextual-text-look-row" role="group">
              <span>Background</span>
              <label className="setting-switch">
                <input aria-label="Text background" checked={Boolean(object.backgroundColor)} onChange={(event) => commitUpdate({ ...object, backgroundColor: event.target.checked ? rememberedBackgroundColourRef.current : undefined, revision: object.revision + 1 })} type="checkbox" />
                <span aria-hidden="true" className="setting-switch-track"><span /></span>
              </label>
              {object.backgroundColor ? <input aria-label="Text background colour" onChange={(event) => previewColour("backgroundColor", event.target.value)} type="color" value={object.backgroundColor} /> : null}
            </div>
            <div aria-label="Text outline" className="contextual-text-look-row" role="group">
              <span>Outline</span>
              <label className="setting-switch">
                <input aria-label="Text outline" checked={Boolean(object.outlineColor)} onChange={(event) => commitUpdate({ ...object, outlineColor: event.target.checked ? rememberedOutlineColourRef.current : undefined, outlineWidth: object.outlineWidth ?? 2, revision: object.revision + 1 })} type="checkbox" />
                <span aria-hidden="true" className="setting-switch-track"><span /></span>
              </label>
              {object.outlineColor ? <input aria-label="Text outline colour" onChange={(event) => previewColour("outlineColor", event.target.value)} type="color" value={object.outlineColor} /> : null}
            </div>
            {object.outlineColor ? (
              <label className="contextual-text-outline-width">
                <span>Outline thickness</span><output>{outlineWidthDraft}</output>
                <input aria-label="Text outline thickness" max="12" min="1" onBlur={commitOutlineWidth} onChange={(event) => { widthCommittedRef.current = false; setOutlineWidthDraft(Number(event.target.value)); }} onKeyUp={commitOutlineWidth} onPointerUp={commitOutlineWidth} type="range" value={outlineWidthDraft} />
              </label>
            ) : null}
          </section>
        ) : null}
        <span aria-live="polite" className="visually-hidden">
          {activeSection ? `${activeSection} text options open` : "Text options collapsed"}
        </span>
      </aside>
    </>,
    document.body,
  );
}
