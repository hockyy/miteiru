import path from "node:path";
import {resolveMiteiruFilePath} from "../miteiruProtocol";

/** Normalize renderer video paths (`/C:/...`, `miteiru://`, mixed slashes) to a filesystem path. */
export function normalizeLocalMediaPath(filePath: string): string {
  if (!filePath) {
    return filePath;
  }
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  if (filePath.startsWith("miteiru://")) {
    return resolveMiteiruFilePath(filePath);
  }
  const withoutUriSlash = process.platform === "win32" && /^\/[A-Za-z]:[\\/]/.test(filePath)
    ? filePath.slice(1)
    : filePath;
  return path.normalize(withoutUriSlash);
}
