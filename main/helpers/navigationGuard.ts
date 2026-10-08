import path from "node:path";

/**
 * URL and path checks that keep content from outside Miteiru (for example a link in the embedded
 * YouTube player) from loading inside an app window, where it would get the preload bridge, and
 * that limit what IPC handlers will touch on disk.
 */

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

// The dev server only exists in development; a packaged app must not treat localhost as itself.
const allowsDevServer = () => process.env.NODE_ENV !== "production";

/** Miteiru's own pages: app:// in production, plus the localhost dev server in development. */
export const isAppUrl = (url: string): boolean => {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol === "app:") return true;
  return allowsDevServer()
    && parsed.protocol === "http:"
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
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
