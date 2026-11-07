import path from "node:path";

/** Finder-launched macOS apps do not inherit the shell's Homebrew PATH. */
export const systemMediaToolPaths = (name: string, platform = process.platform): string[] => (
  platform === "darwin"
    ? [name, path.join("/opt/homebrew/bin", name), path.join("/usr/local/bin", name)]
    : [name]
);
