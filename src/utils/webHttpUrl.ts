export function webHttpUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
