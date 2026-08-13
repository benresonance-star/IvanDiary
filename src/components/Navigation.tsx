import {
  BookOpen,
  CloudAlert,
  NotebookTabs,
  ThumbsUp,
} from "lucide-react";
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
  { id: "sketchbooks", label: "My Sketches", Icon: NotebookTabs },
  { id: "favourites", label: "My Favourites", Icon: ThumbsUp },
] as const;

export function Navigation({
  activeSection,
  displayName,
  onProfileSelect,
  onSectionChange,
  onBackupWarningSelect,
  backupStatus,
  sketchRepository,
}: {
  activeSection: AppSection;
  displayName: string;
  onProfileSelect: () => void;
  onSectionChange: (section: AppSection) => void;
  onBackupWarningSelect: () => void;
  backupStatus: BackupStatus;
  sketchRepository: SketchRepository;
}) {
  const backupNeedsAttention =
    backupStatus.state === "error" ||
    (backupStatus.state === "waiting" && backupStatus.pendingItemCount > 0);
  return (
    <aside className="side-navigation" aria-label="Main navigation">
      <button
        aria-label={`${displayName} profile and settings`}
        className="ivan-profile"
        onClick={onProfileSelect}
        type="button"
      >
        <ProfilePortrait sketchRepository={sketchRepository} />
        <strong>{displayName}</strong>
      </button>
      <nav>
        {NAVIGATION_ITEMS.map(({ id, label, Icon }) => (
          <button
            aria-current={activeSection === id ? "page" : undefined}
            className={
              activeSection === id
                ? "navigation-button selected"
                : "navigation-button"
            }
            key={id}
            onClick={() => onSectionChange(id)}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {backupNeedsAttention ? <button
        className={`backup-navigation-warning ${backupStatus.state}`}
        onClick={onBackupWarningSelect}
        type="button"
      >
        <CloudAlert aria-hidden="true" />
        <span>
          <strong>{backupStatus.state === "waiting" ? "Backup incomplete" : "Backup issue"}</strong>
          <small>{backupStatus.state === "waiting" && backupStatus.pendingItemCount > 0 ? `${backupStatus.pendingItemCount} files waiting` : "Only saved on this iPad"}</small>
        </span>
      </button> : null}
    </aside>
  );
}
