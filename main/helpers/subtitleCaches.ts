import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export const NORMALIZED_SUBTITLE_PREFIX = "miteiru_normalized_";

export type FileIdentity = {
  mtimeMs: number;
  size: number;
};

export class FileIdentityCache<T> {
  private readonly entries = new Map<string, {identity: FileIdentity; value: T}>();

  get(key: string, identity: FileIdentity): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.identity.mtimeMs !== identity.mtimeMs || entry.identity.size !== identity.size) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, identity: FileIdentity, value: T) {
    this.entries.set(key, {identity, value});
  }
}

export const isNormalizedSubtitlePath = (filePath: string) => (
  path.basename(filePath).startsWith(NORMALIZED_SUBTITLE_PREFIX)
);

export const normalizedSubtitleOutputPath = (sourcePath: string, tmpDir = os.tmpdir()) => {
  const hash = crypto
    .createHash("sha1")
    .update(path.normalize(sourcePath))
    .digest("hex")
    .slice(0, 16);
  return path.join(tmpDir, `${NORMALIZED_SUBTITLE_PREFIX}${hash}.srt`);
};

export const identityFromStat = (stat: {mtimeMs: number; size: number}): FileIdentity => ({
  mtimeMs: stat.mtimeMs,
  size: stat.size
});
