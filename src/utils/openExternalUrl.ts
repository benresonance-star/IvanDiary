import { Capacitor, registerPlugin } from "@capacitor/core";

import { webHttpUrl } from "./webHttpUrl";

type UrlOpener = {
  openUrl(options: { url: string }): Promise<{ opened: boolean }>;
};

let nativeOpener: UrlOpener | undefined;

function browse(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}

async function openOnIos(href: string): Promise<void> {
  try {
    nativeOpener ??= registerPlugin<UrlOpener>("AppLifecycle");
    await nativeOpener.openUrl({ url: href });
  } catch {
    browse(href);
  }
}

export function openExternalUrl(url: string): void {
  const href = webHttpUrl(url);
  if (!href) {
    return;
  }
  if (Capacitor.getPlatform() === "ios") {
    void openOnIos(href);
    return;
  }
  browse(href);
}
