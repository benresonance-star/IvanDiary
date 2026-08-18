import { CheckCircle2 } from "lucide-react";

export function RestoreCompleteDialog({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="dialog-backdrop restore-complete-backdrop">
      <section aria-labelledby="restore-complete-heading" aria-modal="true" className="restore-complete-dialog" role="dialog">
        <CheckCircle2 aria-hidden="true" />
        <h2 id="restore-complete-heading">Diary restored</h2>
        <p>Your Journal, Sketchbooks, My Story and available files have been restored from iCloud.</p>
        <button onClick={onDismiss} type="button">Done</button>
      </section>
    </div>
  );
}
