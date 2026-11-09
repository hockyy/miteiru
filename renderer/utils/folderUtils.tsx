export const findPositionDeltaInFolder = async (path: string, delta: number = 1): Promise<string> => {
  return await window.miteiru.findPositionDeltaInFolder(path, delta);
};