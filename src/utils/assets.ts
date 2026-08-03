import type { AssetRef } from "../domain/models";
import { createId } from "./id";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export async function browserFileToAsset(file: File): Promise<AssetRef> {
  const data = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", data);
  return {
    id: createId(),
    localUri: await readAsDataUrl(file),
    mimeType: file.type || "application/octet-stream",
    byteLength: file.size,
    checksum: bytesToHex(new Uint8Array(hash)),
  };
}
