import path from "node:path";

/** Normalize renderer video paths (`/C:/...`, mixed slashes) to a filesystem path. */
export function normalizeLocalMediaPath(filePath: string): string {
  if (!filePath) {
    return filePath;
  }
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  const withoutUriSlash = process.platform === "win32" && /^\/[A-Za-z]:[\\/]/.test(filePath)
    ? filePath.slice(1)
    : filePath;
  return path.normalize(withoutUriSlash);
}
