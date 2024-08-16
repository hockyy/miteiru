export const findPositionDeltaInFolder = async (path: string, delta: number = 1): Promise<string> => {
  return await window.electronAPI.findPositionDeltaInFolder(path, delta);
};