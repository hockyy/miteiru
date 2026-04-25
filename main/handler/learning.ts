import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';
import * as fsPromises from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {LearningStateType} from "../../renderer/components/types";

const TERM_IMAGES_KEY_PREFIX = 'termImages/';
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];

function safeTermFolder(term: string): string {
  return createHash('sha256').update(term).digest('hex').slice(0, 16);
}

class Learning {
  static dbPath: string;
  static db: Level;

  static setup() {
    // Define the path to the database
    this.dbPath = path.join(app.getPath('userData'), 'learningStateDB');
    this.db = new Level(this.dbPath);
  }

  static registerHandler() {
    ipcMain.handle('loadLearningState', async (_event, lang) => {
      if (!lang) return;
      try {
        const prefix = `${lang}/`; // Define the prefix for keys
        const learningState = {};

        // Define the range for the query
        const queryOptions = {
          gte: prefix, // Start of the range: include the prefix
          lte: `${prefix}\uFFFF`, // End of the range: highest value that still matches the prefix
        };

        const promises = []
        // Efficiently iterate over keys within the specified range
        for await (const [key, value] of this.db.iterator(queryOptions)) {
          const strippedKey = key.substring(prefix.length);
          let parsedValue: { level: any; updTime: any; };

          try {
            parsedValue = JSON.parse(value);
            if (typeof parsedValue.level !== 'number' || typeof parsedValue.updTime !== 'number') {
              throw new Error('Invalid format');
            }
          } catch {
            // If parsing fails, assume it's an old format (number)
            parsedValue = {
              level: parseInt(value, 10),
              updTime: Date.now()
            };
            await this.db.put(key, JSON.stringify(parsedValue));
          }
          learningState[strippedKey] = parsedValue;
        }
        await Promise.all(promises);
        return learningState;
      } catch (error) {
        console.error('Error loading learning state:', error);
        return {};
      }
    });

    // Handler to update a specific content's learning state
    ipcMain.handle('updateContent', async (_event, content, lang, data) => {
      if (!content) return true;
      try {
        const promises = []
        await this.db.put(`${lang}/${content}`, JSON.stringify(data));
        await Promise.all(promises);
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    // Handler to update a batch of contents' learning states
    ipcMain.handle('updateContentBatch', async (_event, contents: LearningStateType, lang) => {
      if (!contents) return true;
      try {
        const promises = [];
        for (const [key, value] of Object.entries(contents)) {
          const goUpdate = async () => {
            await this.db.put(`${lang}/${key}`, JSON.stringify(value));
          }
          this.db.get(`${lang}/${key}`).then(async val => {
            const parsedVal = JSON.parse(val);
            if (parsedVal.updTime < value.updTime) await goUpdate();
          }).catch(async () => {
            await goUpdate();
          })
        }
        await Promise.all(promises);
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    // Term images: save image to appdata and store ref in db
    ipcMain.handle('saveTermImage', async (_event, term: string, lang: string, imageBase64: string, ext: string) => {
      if (!term || !lang || !imageBase64) return null;
      try {
        const userData = app.getPath('userData');
        const safeFolder = safeTermFolder(term);
        const imageId = randomUUID();
        const normalizedExt = IMAGE_EXTS.includes(ext?.toLowerCase()) ? ext.toLowerCase() : 'png';
        const filename = `${imageId}.${normalizedExt}`;
        const dirPath = path.join(userData, 'termImages', lang, safeFolder);
        await fsPromises.mkdir(dirPath, { recursive: true });
        const filePath = path.join(dirPath, filename);
        await fsPromises.writeFile(filePath, Buffer.from(imageBase64, 'base64'));
        const entry = { id: imageId, filename, addedAt: Date.now() };
        const dbKey = `${TERM_IMAGES_KEY_PREFIX}${lang}/${term}`;
        let existing: { images: Array<{ id: string; filename: string; addedAt: number }> } = { images: [] };
        try {
          const raw = await this.db.get(dbKey);
          existing = JSON.parse(raw);
        } catch { /* key doesn't exist */ }
        existing.images = existing.images || [];
        existing.images.push(entry);
        await this.db.put(dbKey, JSON.stringify(existing));
        return { ...entry, path: filePath };
      } catch (error) {
        console.error('Error saving term image:', error);
        return null;
      }
    });

    ipcMain.handle('loadTermImages', async (_event, term: string, lang: string) => {
      if (!term || !lang) return [];
      try {
        const dbKey = `${TERM_IMAGES_KEY_PREFIX}${lang}/${term}`;
        const raw = await this.db.get(dbKey);
        const data = JSON.parse(raw);
        return data?.images || [];
      } catch {
        return [];
      }
    });

    ipcMain.handle('deleteTermImage', async (_event, term: string, lang: string, imageId: string) => {
      if (!term || !lang || !imageId) return false;
      try {
        const dbKey = `${TERM_IMAGES_KEY_PREFIX}${lang}/${term}`;
        const raw = await this.db.get(dbKey);
        const data = JSON.parse(raw);
        const images = (data?.images || []).filter((img: { id: string }) => img.id !== imageId);
        const userData = app.getPath('userData');
        const safeFolder = safeTermFolder(term);
        const entry = (data?.images || []).find((img: { id: string }) => img.id === imageId);
        if (entry?.filename) {
          const filePath = path.join(userData, 'termImages', lang, safeFolder, entry.filename);
          await fsPromises.unlink(filePath).catch(() => {});
        }
        if (images.length === 0) {
          await this.db.del(dbKey);
        } else {
          await this.db.put(dbKey, JSON.stringify({ ...data, images }));
        }
        return true;
      } catch (error) {
        console.error('Error deleting term image:', error);
        return false;
      }
    });

    ipcMain.handle('getTermImageAsDataUrl', async (_event, term: string, lang: string, imageId: string) => {
      if (!term || !lang || !imageId) return null;
      try {
        const dbKey = `${TERM_IMAGES_KEY_PREFIX}${lang}/${term}`;
        const raw = await this.db.get(dbKey);
        const data = JSON.parse(raw);
        const entry = (data?.images || []).find((img: { id: string }) => img.id === imageId);
        if (!entry?.filename) return null;
        const userData = app.getPath('userData');
        const safeFolder = safeTermFolder(term);
        const filePath = path.join(userData, 'termImages', lang, safeFolder, entry.filename);
        const buffer = await fsPromises.readFile(filePath);
        const ext = path.extname(entry.filename).toLowerCase().slice(1);
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/webp';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      } catch (error) {
        console.error('Error reading term image:', error);
        return null;
      }
    });
  }
}

export default Learning;