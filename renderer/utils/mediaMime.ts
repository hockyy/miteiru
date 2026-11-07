const mediaMimeTypes: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogg: "video/ogg",
  ogv: "video/ogg",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  ts: "video/mp2t",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export const mediaMimeForPath = (filePath: string): string => (
  mediaMimeTypes[filePath.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream"
);

/** Video.js rejects QuickTime's MIME type before Chromium can inspect its MP4-compatible data. */
export const playbackMimeForPath = (filePath: string): string => {
  const mime = mediaMimeForPath(filePath);
  if (mime === "video/quicktime") return "video/mp4";
  // Keep trying Chromium's container detection for formats without a supported source MIME.
  if (["video/x-msvideo", "video/mp2t", "application/octet-stream"].includes(mime)) return "video/webm";
  return mime;
};
