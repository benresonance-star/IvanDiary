import { Download, ShieldCheck, Trash2 } from "lucide-react";

export function PrivacySettingsPanel({
  deletingCloudData,
  exportState,
  exportMessage,
  onDeleteCloudData,
  onExportDiary,
  embedded = false,
}: {
  deletingCloudData: boolean;
  exportState: "idle" | "exporting" | "complete" | "warning" | "error";
  exportMessage?: string;
  onDeleteCloudData: () => void;
  onExportDiary: () => void;
  embedded?: boolean;
}) {
  return (
    <div
      aria-labelledby={embedded ? "backup-section-privacy-heading" : "settings-tab-privacy"}
      className="setting-group privacy-setting-group"
      id={embedded ? "backup-section-privacy-content" : "settings-panel-privacy"}
      role={embedded ? "region" : "tabpanel"}
    >
      <ShieldCheck aria-hidden="true" />
      <div>
        <h2>Privacy &amp; Export</h2>
        <p className="setting-description">
          Your diary is stored on this iPad. If you turn on iCloud Sync or
          choose Back up now, the latest diary, recovery history, recordings,
          photos and drawings are stored in your private iCloud database so
          they can be recovered on another iPad using your Apple ID.
        </p>
        <h3>Microphone and speech</h3>
        <p>
          The microphone is used only when you choose voice entry or make a
          recording. Apple Speech may process voice entry to produce editable
          text. The iPad App does not contain advertising or third-party
          tracking.
        </p>
        <h3>Export my diary</h3>
        <p>
          Save a readable PDF and a complete portable archive containing the
          diary structure and all available original photos, voice recordings,
          links and drawings. Exporting does not change or delete the diary.
        </p>
        <button
          className="backup-export-action"
          disabled={exportState === "exporting"}
          onClick={onExportDiary}
          type="button"
        >
          <Download aria-hidden="true" />
          {exportState === "exporting" ? "Preparing complete diary…" : "Export my complete diary"}
        </button>
        {exportState === "complete" ? (
          <div className="settings-result-alert success" role="status">
            <strong>Export complete</strong>
            <p>The complete diary was exported.</p>
          </div>
        ) : null}
        {exportState === "warning" ? (
          <div className="settings-result-alert warning" role="alert">
            <strong>Export completed with missing files</strong>
            <p>{exportMessage}</p>
          </div>
        ) : null}
        {exportState === "error" ? (
          <div className="settings-result-alert error" role="alert">
            <strong>Export failed</strong>
            <p>{exportMessage}</p>
          </div>
        ) : null}
        <h3>Sharing and retention</h3>
        <p>
          Pages leave the app only when you choose Share. iCloud keeps the
          latest synced diary, the last five recovery days and one weekly
          recovery point for up to twelve weeks. Deleting the app does not
          automatically delete its private iCloud records.
        </p>
        <h3>Delete iCloud data</h3>
        <p>
          This permanently removes the latest cloud backup and every recovery
          point. It does not erase the diary currently saved on this iPad. You
          will be shown two warnings and must confirm both before anything is
          deleted.
        </p>
        <button
          className="backup-delete-cloud-action"
          disabled={deletingCloudData}
          onClick={onDeleteCloudData}
          type="button"
        >
          <Trash2 aria-hidden="true" />
          {deletingCloudData ? "Deleting iCloud data…" : "Delete my iCloud diary and history"}
        </button>
        <p className="backup-availability-note">
          A public Privacy Policy and support contact must also be supplied on
          the App Store product page before release.
        </p>
      </div>
    </div>
  );
}
