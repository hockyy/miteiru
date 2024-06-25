import { app, ipcMain } from 'electron';
import { Level } from 'level';
import path from 'path';

class SRSPage {
  static dbPath;
  static db;

  static setup() {
    this.dbPath = path.join(app.getPath('userData'), 'srsDB');
    this.db = new Level(this.dbPath);
  }

  static registerHandler() {
    ipcMain.handle('loadSRSState', async (event, lang) => {
      try {
        const prefix = `${lang}/`;
        const srsState = {};
        const queryOptions = {
          gte: prefix,
          lte: `${prefix}\uFFFF`,
        };

        for await (const [key, value] of this.db.iterator(queryOptions)) {
          const strippedKey = key.substring(prefix.length);
          srsState[strippedKey] = JSON.parse(value);
        }

        return srsState;
      } catch (error) {
        console.error('Error loading SRS state:', error);
        return {};
      }
    });

    ipcMain.handle('updateSRSContent', async (event, char, lang, data) => {
      if (!char) return false;
      try {
        await this.db.put(`${lang}/${char}`, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error('Error updating SRS content:', error);
        return false;
      }
    });
  }
}

export default SRSPage;
