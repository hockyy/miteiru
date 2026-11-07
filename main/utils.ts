// Async function to read a JSON file and parse its content
import fsPromises from "node:fs/promises";

export async function readJsonFile(filePath) {
  return JSON.parse(await fsPromises.readFile(filePath, 'utf8'));
}
