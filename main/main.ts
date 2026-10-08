import {app, session} from 'electron';
import {createWindow} from './helpers';
import fs from "node:fs";
import path from "path";
import {registerPrivilegedSchemes, setupMiteiruProtocol} from "./miteiruProtocol";
import {setupAppProtocol} from "./appProtocol";
import {registerCommonHandlers} from "./handler/common";
import {notifyLiveCaptionsLanguageChange} from "./handler/common/liveCaptionsHandlers";
import {registerStartupHandlers} from "./handler/startup";
import Japanese from "./handler/japanese";
import Chinese from "./handler/chinese";
import Vietnamese from "./handler/vietnamese";
import Learning from "./handler/learning";
import {registerAnalyzerHandlers} from "./handler/languages/analyzerHandlers";
import {startAnalyzerServer, AnalyzerServerHandle} from "./handler/languages/analyzerServer";
import {DEFAULT_MECAB_COMMAND} from "./helpers/mecabCommand";
import {getStore} from "./handler/common/storeHandlers";
import {
  applyYouTubeEmbedRequestHeaders,
  YOUTUBE_EMBED_REQUEST_URLS
} from "./youtubeEmbedHeaders";


const isProd: boolean = process.env.NODE_ENV === 'production';
registerPrivilegedSchemes();

function registerYouTubeHeaderWorkaround() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {urls: YOUTUBE_EMBED_REQUEST_URLS},
    (details, callback) => {
      callback({
        requestHeaders: applyYouTubeEmbedRequestHeaders(
          details.requestHeaders || {},
          details.resourceType
        )
      });
    }
  );
}

if (!isProd) {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();
  if (isProd) setupAppProtocol(path.join(app.getAppPath(), 'app'));
  setupMiteiruProtocol();
  registerYouTubeHeaderWorkaround();
  const appDataDirectory = app.getPath('userData');
  let tokenizerCommand = ''
  let mecabCommand = DEFAULT_MECAB_COMMAND;
  let analyzerServer: AnalyzerServerHandle | null = null;
  const packageJsonPath = path.join(app.getAppPath(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

  const setTokenizer = (value) => {
    tokenizerCommand = value;
    notifyLiveCaptionsLanguageChange();
  }
  const getTokenizer = () => tokenizerCommand;
  const setMecabCommand = (value: string) => {
    mecabCommand = value;
  };
  const getMecabCommand = () => mecabCommand;
  const getToneType = async () => {
    const store = await getStore();
    return store.get('toneType', 'num') as string;
  };

  const mainWindow = await createWindow('main', {
    title: isProd ? 'Miteiru' : 'Miteiru (dev)',
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'images/logo.png')
  })

  registerCommonHandlers(getTokenizer, packageJson, appDataDirectory);
  registerStartupHandlers(setTokenizer, appDataDirectory, setMecabCommand);
  registerAnalyzerHandlers({getTokenizer, getToneType, getMecabCommand});
  Japanese.registerHandlers();
  Chinese.registerHandlers();
  Vietnamese.registerHandlers();
  Japanese.preloadKuromoji();

  Learning.setup();
  Learning.registerHandler();

  // The analyzer server is optional; failing to start it must not leave the window blank.
  try {
    analyzerServer = await startAnalyzerServer({
      appDataDirectory,
      version: packageJson.version,
      getTokenizer,
      getToneType,
      getMecabCommand
    });
    console.log(`[AnalyzerServer] Listening on ${analyzerServer.registration.host}:${analyzerServer.registration.port}`);
  } catch (error) {
    console.error("[AnalyzerServer] Failed to start:", error);
  }

  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
  }
  app.on('before-quit', () => {
    analyzerServer?.close().catch((error) => {
      console.error("[AnalyzerServer] Failed to close:", error);
    });
    analyzerServer = null;
  });
})();

app.on('window-all-closed', () => {
  app.quit();
});
