import { useEffect } from "react";
import { ThumbsUp } from "lucide-react";

export function FavouriteConfirmation({
  message,
  onDone,
}: {
  message?: string;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, 1_800);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div aria-live="polite" className="favourite-confirmation" role="status">
      <ThumbsUp aria-hidden="true" />
      <strong>{message}</strong>
    </div>
  );
}
