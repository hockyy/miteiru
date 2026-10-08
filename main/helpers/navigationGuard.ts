/**
 * URL checks that keep content from outside Miteiru (for example a link in the embedded YouTube
 * player) from loading inside an app window, where it would get the preload bridge.
 */

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/** Miteiru's own pages: app:// in production and the localhost dev server. */
export const isAppUrl = (url: string): boolean => {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol === "app:") return true;
  return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
};

/** http(s) links, the only kind handed to the system browser. */
export const isWebUrl = (url: string): boolean => {
  const parsed = parseUrl(url);
  return parsed?.protocol === "https:" || parsed?.protocol === "http:";
};
