import fs from "node:fs";

export const DEFAULT_MECAB_COMMAND = "mecab";

/**
 * MeCab binary to run: the path chosen on the home screen when it exists,
 * otherwise `mecab` from PATH (so PATH installs keep working with the default path).
 */
export const resolveMecabCommand = (
  configuredPath?: string,
  exists: (candidate: string) => boolean = fs.existsSync
): string => {
  const candidate = configuredPath?.trim();
  return candidate && exists(candidate) ? candidate : DEFAULT_MECAB_COMMAND;
};
