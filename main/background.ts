import {app} from 'electron';
import serve from 'electron-serve';
import {createWindow} from './helpers';
import fs from "node:fs";
import path from "path";
import {registerCommonHandlers} from "./handler/common";
import {registerStartupHandlers} from "./handler/startup";
import Japanese from "./handler/japanese";
import Chinese from "./handler/chinese";
import Learning from "./handler/learning";


const isProd: boolean = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({directory: 'app'});
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();
  const appDataDirectory = app.getPath('userData');
  let tokenizerCommand = 'mecab'
  const packageJsonPath = path.join(app.getAppPath(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

  const setTokenizer = (value) => {
    tokenizerCommand = value;
  }
  const getTokenizer = () => tokenizerCommand;

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'images/logo.png')
  })

  registerCommonHandlers(getTokenizer, packageJson, appDataDirectory);
  registerStartupHandlers(setTokenizer, appDataDirectory);
  Japanese.registerHandlers();
  Chinese.registerHandlers();
  Japanese.registerKuromoji();
  Chinese.registerJieba();
  Chinese.registerCantoJieba();

  Learning.setup();
  Learning.registerHandler();

  if (isProd) {
    await mainWindow.loadURL('app://./miteiruHome.html');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/miteiruHome`);
  }
})();

app.on('window-all-closed', () => {
  app.quit();
});
