import { useEffect, useState } from "react";
import { Share, X, Plus } from "lucide-react";

type Platform = "ios" | "android";

export function InstallHint({ slug, workshopName }: { slug: string; workshopName: string }) {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>("android");

  const storageKey = `a2hs-dismissed:${slug}`;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    setPlatform(isIos ? "ios" : "android");
    setVisible(true);
  }, [storageKey]);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div className="app-card relative bg-brand-soft p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-sm font-semibold">Add {workshopName} to your home screen</p>
      {platform === "ios" ? (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-muted-foreground">
          In Safari, tap <Share className="inline h-3.5 w-3.5" /> Share, then
          <span className="font-medium text-foreground">Add to Home Screen</span>.
        </p>
      ) : (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-muted-foreground">
          In Chrome, tap the <span className="font-medium text-foreground">⋮</span> menu, then
          <Plus className="inline h-3.5 w-3.5" />
          <span className="font-medium text-foreground">Add to Home screen</span>.
        </p>
      )}
    </div>
  );
}
