import { Capacitor, registerPlugin } from "@capacitor/core";

import type { AppOrientationPlugin } from "./contracts";

const appOrientation = registerPlugin<AppOrientationPlugin>("AppOrientation");

export async function setLandscapeLocked(locked: boolean): Promise<void> {
  if (
    Capacitor.getPlatform() !== "ios" ||
    !Capacitor.isPluginAvailable("AppOrientation")
  ) {
    return;
  }
  await appOrientation.setLandscapeLocked({ locked });
}
