// Async function to read a JSON file and parse its content
import fs from "fs";

export async function readJsonFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const result = JSON.parse(data);
        resolve(result);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}
