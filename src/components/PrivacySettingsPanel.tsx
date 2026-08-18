import { ShieldCheck, Trash2 } from "lucide-react";

export function PrivacySettingsPanel({
  deletingCloudData,
  onDeleteCloudData,
}: {
  deletingCloudData: boolean;
  onDeleteCloudData: () => void;
}) {
  return (
    <div
      aria-labelledby="settings-tab-privacy"
      className="setting-group privacy-setting-group"
      id="settings-panel-privacy"
      role="tabpanel"
    >
      <ShieldCheck aria-hidden="true" />
      <div>
        <h2>Privacy</h2>
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
          text. Ivan&apos;s Diary does not contain advertising or third-party
          tracking.
        </p>
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
