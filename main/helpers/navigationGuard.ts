import path from "node:path";

/** URL and path checks that limit what IPC handlers will touch or open. */

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** http(s) links, the only kind handed to the system browser. */
export const isWebUrl = (url: string): boolean => {
  const parsed = parseUrl(url);
  return parsed?.protocol === "https:" || parsed?.protocol === "http:";
};

/** Whether `target` is `root` itself or somewhere below it, after resolving `..` segments. */
export const isInsideDirectory = (root: string, target: unknown): boolean => {
  if (typeof target !== "string" || target === "") return false;
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

/** Synced-lyrics files, the only kind the renderer may write. */
export const isLyricsFilePath = (target: unknown): boolean =>
  typeof target === "string" && path.extname(target).toLowerCase() === ".lrc";
