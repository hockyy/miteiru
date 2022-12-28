import {app, ipcMain, protocol} from 'electron';
import serve from 'electron-serve';
import {createWindow} from './helpers';
import {requestHandler, scheme} from "./protocol";
import {kanjiAnywhere, setup as setupJmdict} from 'jmdict-simplified-node';


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

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
  });
  ipcMain.handle('query', async (event, query) => {
    return await kanjiAnywhere(db, query, 1)
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
