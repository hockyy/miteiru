import {app, ipcMain, protocol} from 'electron';
import serve from 'electron-serve';
import {createWindow} from './helpers';
import {requestHandler, scheme} from "./protocol";
import {
  kanjiBeginning,
  getTags,
  readingBeginning,
  kanjiAnywhere,
  readingAnywhere,
  setup as setupJmdict
} from 'jmdict-simplified-node';
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
    let matches = []
    matches = matches.concat(await readingBeginning(db, query, 10));
    matches = matches.concat(await kanjiBeginning(db, query));
    matches = matches.concat(await readingAnywhere(db, query, 10));
    matches = matches.concat(await kanjiAnywhere(db, query));
    const ids = matches.map(o => o.id)
    matches = matches.filter(({id}, index) => !ids.includes(id, index + 1))
    // Swap the exact match to front
    matches = matches.sort((a, b) => {
          // Get smallest kanji length in a and b, compare it
          const smallestA = (a.kanji[0].text.length)
          const smallestB = (b.kanji[0].text.length)
          if (smallestA !== smallestB) return smallestA - smallestB;
          const isVerbA = +(!tags[a.sense[0].partOfSpeech[0]].includes("verb"));
          const isVerbB = +(!tags[b.sense[0].partOfSpeech[0]].includes("verb"));
          if (isVerbA !== isVerbB) return isVerbA - isVerbB;
          const isNounA = +(!tags[a.sense[0].partOfSpeech[0]].includes("noun"));
          const isNounB = +(!tags[b.sense[0].partOfSpeech[0]].includes("noun"));
          if (isNounA !== isNounB) return isNounA - isNounB;
          if (a.kanji.length !== b.kanji.length) return a.kanji.length - b.kanji.length
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
