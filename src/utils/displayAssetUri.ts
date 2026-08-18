import { Capacitor } from "@capacitor/core";

export function displayAssetUri(uri: string): string {
  return uri.startsWith("file://") ? Capacitor.convertFileSrc(uri) : uri;
}
