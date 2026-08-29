/**
 * YouTube's embedded player requires a real http(s) Referer that is *not*
 * youtube.com itself.
 *
 * - No Referer → error 153 (configuration / unidentified embedder)
 * - Referer or Origin of youtube.com → error 152 (invalid embed host)
 *
 * Electron pages loaded from `app://` / `file://` drop Referer before the
 * request leaves, so the previous workaround filled in youtube.com and
 * triggered 152. Use the public app homepage instead.
 */
export const YOUTUBE_EMBED_APP_ORIGIN = "https://miteiru.hocky.id";
export const YOUTUBE_EMBED_APP_REFERER = `${YOUTUBE_EMBED_APP_ORIGIN}/`;

export const YOUTUBE_EMBED_REQUEST_URLS = [
  "*://youtube.com/*",
  "*://*.youtube.com/*",
  "*://*.youtube-nocookie.com/*",
];

type HeaderMap = Record<string, string | string[]>;

const YOUTUBE_EMBED_HOSTS = new Set([
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);

const findHeaderKey = (headers: HeaderMap, name: string) => {
  const target = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === target);
};

const getHeader = (headers: HeaderMap, name: string) => {
  const key = findHeaderKey(headers, name);
  if (!key) return undefined;
  const value = headers[key];
  return Array.isArray(value) ? value[0] : value;
};

const deleteHeader = (headers: HeaderMap, name: string) => {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      delete headers[key];
    }
  }
};

const isYouTubeHost = (hostname: string) => {
  if (!hostname) return false;
  if (YOUTUBE_EMBED_HOSTS.has(hostname)) return true;
  return [...YOUTUBE_EMBED_HOSTS].some((host) => hostname.endsWith(`.${host}`));
};

export const isValidYouTubeEmbedReferer = (referer: string | undefined) => {
  if (!referer) return false;
  try {
    const url = new URL(referer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return !isYouTubeHost(url.hostname.replace(/^www\./, "").toLowerCase());
  } catch {
    return false;
  }
};

/**
 * Rewrite headers for youtube.com / youtube-nocookie.com requests.
 *
 * The iframe document (`subFrame`) is what YouTube uses to identify the
 * embedder, so invalid youtube.com Referer/Origin values are replaced there.
 * Later player XHRs already carry youtube.com as Referer from inside the
 * iframe; those are left alone unless Referer is missing entirely.
 */
export const applyYouTubeEmbedRequestHeaders = (
  requestHeaders: HeaderMap,
  resourceType?: string
): HeaderMap => {
  const headers: HeaderMap = {...requestHeaders};
  const referer = getHeader(headers, "Referer");
  const isEmbedDocument = resourceType === "subFrame";
  const shouldReplaceReferer = isEmbedDocument
    ? !isValidYouTubeEmbedReferer(referer)
    : !referer;

  if (shouldReplaceReferer) {
    deleteHeader(headers, "Referer");
    headers.Referer = YOUTUBE_EMBED_APP_REFERER;
  }

  if (isEmbedDocument) {
    const origin = getHeader(headers, "Origin");
    if (!isValidYouTubeEmbedReferer(origin)) {
      deleteHeader(headers, "Origin");
      headers.Origin = YOUTUBE_EMBED_APP_ORIGIN;
    }
  }

  return headers;
};
