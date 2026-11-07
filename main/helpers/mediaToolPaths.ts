import path from "node:path";

/** Finder-launched macOS apps do not inherit the shell's Homebrew PATH. */
export const systemMediaToolPaths = (name: string, platform = process.platform): string[] => (
  platform === "darwin"
    // macOS paths, so POSIX joins whatever platform computes them (tests, the Tauri worker's pathe).
    ? [name, path.posix.join("/opt/homebrew/bin", name), path.posix.join("/usr/local/bin", name)]
    : [name]
);

/** yt-dlp's download for each OS: Windows keeps Miteiru's own link; macOS and Linux get yt-dlp's own builds. */
export const ytDlpDownloadLink = (platform: string = process.platform): string => {
  if (platform === "darwin") return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
  if (platform === "linux") return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
  return "https://github.com/hockyy/miteiru/releases/download/assets/yt-dlp.exe";
};
