import {app, ipcMain, protocol} from 'electron';
import serve from 'electron-serve';
import {createWindow} from './helpers';
import {requestHandler, scheme} from "./protocol";
import {getTags, kanjiAnywhere, setup as setupJmdict} from 'jmdict-simplified-node';
import {match} from "assert";


const isProd: boolean = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({directory: 'app'});
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();

  const jmdictPromise =
      setupJmdict('my-jmdict-simplified-db', '/Users/hocky/project/jmdict-eng-3.2.0-alpha.1.json');
  const {db} = await jmdictPromise;
  const tags = await getTags(db);

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
  });
  ipcMain.handle('query', async (event, query) => {
    let matches = await kanjiAnywhere(db, query, 10);
    // Swap the exact match to front
    matches = matches.sort((a, b) => {
          // Get smallest kanji length in a and b, compare it
          const smallestA = Math.min(...a.kanji.map(val => val.text.length))
          const smallestB = Math.min(...b.kanji.map(val => val.text.length))
          if (smallestA !== smallestB) return smallestA - smallestB;
          return a.kanji.length - b.kanji.length
        }
    )
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].kanji.map(val => val.text).includes(query)) {
        [matches[i], matches[0]] = [matches[0], matches[i]]
        break;
      }
    }
    return matches
  })

  ipcMain.handle('tags', (event) => {
    return tags;
  })

  protocol.registerFileProtocol(scheme, requestHandler); /* eng-disable PROTOCOL_HANDLER_JS_CHECK */
  if (isProd) {

    await mainWindow.loadURL('app://./home.html');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
    mainWindow.webContents.openDevTools();
  }
})();

app.on('window-all-closed', () => {
  app.quit();
});
