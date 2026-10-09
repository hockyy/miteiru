import {NORMALIZED_SUBTITLE_PREFIX} from "./constants";

export const findPositionDeltaInFolder = async (path: string, delta: number = 1): Promise<string> => {
  return await window.electronAPI.findPositionDeltaInFolder(path, delta);
};

/** Whether a subtitle path is Miteiru's UTF-8 copy in the temp folder rather than the user's file. */
export const isTempSubtitleCopy = (path: string): boolean =>
  (path.split(/[\\/]/).pop() ?? "").startsWith(NORMALIZED_SUBTITLE_PREFIX);