import {
  BookOpen,
  NotebookTabs,
  Settings,
  Star,
  UserRound,
} from "lucide-react";

export type AppSection =
  | "diary"
  | "sketchbooks"
  | "favourites"
  | "settings";

const NAVIGATION_ITEMS = [
  { id: "diary", label: "Diary", Icon: BookOpen },
  { id: "sketchbooks", label: "Sketchbooks", Icon: NotebookTabs },
  { id: "favourites", label: "Favourites", Icon: Star },
  { id: "settings", label: "Settings", Icon: Settings },
] as const;

export function Navigation({
  activeSection,
  onSectionChange,
}: {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
}) {
  return (
    <aside className="side-navigation" aria-label="Main navigation">
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
      <div className="ivan-profile">
        <span className="profile-picture">
          <UserRound aria-hidden="true" />
        </span>
        <strong>Ivan</strong>
      </div>
    </aside>
  );
}
