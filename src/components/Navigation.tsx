import {
  BookOpen,
  CloudAlert,
  NotebookTabs,
  Settings,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { SketchRepository } from "../sketch/types";
import type { BackupStatus } from "../domain/models";
import { ProfilePortrait } from "./ProfilePortrait";

export type AppSection =
  | "diary"
  | "sketchbooks"
  | "favourites"
  | "settings";

const NAVIGATION_ITEMS = [
  { id: "diary", label: "My Journal", Icon: BookOpen },
  { id: "sketchbooks", label: "My Sketchbooks", Icon: NotebookTabs },
  { id: "favourites", label: "My Favourites", Icon: ThumbsUp },
  { id: "settings", label: "My Settings", Icon: Settings },
] as const;

export function Navigation({
  activeSection,
  displayName,
  menuOpen,
  menuOpening,
  onMenuClose,
  onMenuOpen,
  onSectionChange,
  backupStatus,
  sketchRepository,
}: {
  activeSection: AppSection;
  displayName: string;
  menuOpen: boolean;
  menuOpening: boolean;
  onMenuClose: () => void;
  onMenuOpen: () => void;
  onSectionChange: (section: AppSection) => void;
  backupStatus: BackupStatus;
  sketchRepository: SketchRepository;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const backupNeedsAttention =
    backupStatus.state === "error" ||
    (backupStatus.state === "waiting" && backupStatus.pendingItemCount > 0);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onMenuClose();
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        popoverRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    globalThis.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector<HTMLButtonElement>('[aria-current="page"]')
        ?.focus();
    });
    return () => globalThis.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen, onMenuClose]);

  const selectSection = (section: AppSection) => {
    onSectionChange(section);
    onMenuClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className="profile-navigation">
      <button
        aria-controls="profile-navigation-popover"
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        aria-label={`${displayName} navigation`}
        className="ivan-profile"
        disabled={menuOpening}
        onClick={menuOpen ? onMenuClose : onMenuOpen}
        ref={triggerRef}
        type="button"
      >
        <ProfilePortrait sketchRepository={sketchRepository} />
        <strong>{displayName}</strong>
      </button>
      {menuOpen ? (
        <>
          <button
            aria-label="Close navigation"
            className="profile-navigation-backdrop"
            onClick={() => {
              onMenuClose();
              triggerRef.current?.focus();
            }}
            type="button"
          />
          <div
            aria-label={`${displayName} navigation`}
            aria-modal="true"
            className="profile-navigation-popover"
            id="profile-navigation-popover"
            ref={popoverRef}
            role="dialog"
          >
            <strong className="profile-navigation-full-name">
              {displayName}
            </strong>
            <nav aria-label="Journal sections">
              {NAVIGATION_ITEMS.map(({ id, label, Icon }) => (
                <button
                  aria-current={activeSection === id ? "page" : undefined}
                  className={
                    activeSection === id
                      ? "navigation-button selected"
                      : "navigation-button"
                  }
                  key={id}
                  onClick={() => selectSection(id)}
                  type="button"
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  {id === "settings" && backupNeedsAttention ? (
                    <span className="settings-warning">
                      <CloudAlert aria-hidden="true" />
                      {backupStatus.state === "waiting"
                        ? "Backup incomplete"
                        : "Backup issue"}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}
