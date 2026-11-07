import path from "node:path";

/** Finder-launched macOS apps do not inherit the shell's Homebrew PATH. */
export const systemMediaToolPaths = (name: string, platform = process.platform): string[] => (
  platform === "darwin"
    // macOS paths, so POSIX joins whatever platform computes them (tests, the Tauri worker's pathe).
    ? [name, path.posix.join("/opt/homebrew/bin", name), path.posix.join("/usr/local/bin", name)]
    : [name]
);
