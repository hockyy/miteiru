// Reads a JSON file (a packaged build may store it compressed: helpers/assetFiles.ts) and parses it
import {readTextAsset} from "./helpers/assetFiles";

export async function readJsonFile(filePath) {
  return JSON.parse(await readTextAsset(filePath));
}
