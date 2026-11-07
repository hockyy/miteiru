/**
 * A self-check for CI on each OS. With MITEIRU_SMOKE_TEST=<results.json> the app checks the backend
 * worker, the store, the analyzer API, libmpv drawing under the page and a YouTube embed, writes the
 * results there and exits (code 1 if a step failed). .github/workflows/desktop-check.yml runs it.
 */
import {Channel, invoke} from '@tauri-apps/api/core';

interface StepResult {
  ok: boolean;
  ms: number;
  value?: unknown;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))
]);

const decodeBase64 = (text: string) => new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)));

/** mpv reports a property after it is first read; read twice with a pause. */
const playerProperty = async (name: string) => {
  await invoke('player_get', {name});
  await sleep(300);
  return invoke<string | null>('player_get', {name});
};

/**
 * mpv's test pattern (lavfi) needs libavdevice, which media-kit's macOS libmpv lacks; elsewhere the
 * player reads raw RGB noise from /dev/urandom instead.
 */
const checkPlayer = async (platform: string) => {
  await invoke('player_open', {options: {'sub-visibility': 'no', mute: 'yes'}});
  // A see-through page, so a screenshot shows mpv's picture under the webview.
  document.documentElement.classList.add('miteiru-native-video');
  document.getElementById('__next')?.style.setProperty('visibility', 'hidden');
  const viewport = {x: 0, y: 0, width: innerWidth, height: innerHeight};
  await invoke('player_set_rect', {rect: viewport, viewport});
  if (platform === 'win32') {
    await invoke('player_command', {args: ['loadfile', 'av://lavfi:testsrc2=size=1280x720:rate=30']});
  } else {
    const raw = {
      'demuxer': 'rawvideo',
      'demuxer-rawvideo-w': '640',
      'demuxer-rawvideo-h': '360',
      'demuxer-rawvideo-mp-format': 'rgb24',
      'demuxer-rawvideo-fps': '30'
    };
    for (const [name, value] of Object.entries(raw)) await invoke('player_set', {name, value});
    await invoke('player_command', {args: ['loadfile', '/dev/urandom']});
  }
  await sleep(5000);
  const timePos = Number(await playerProperty('time-pos'));
  const result = {
    timePos,
    width: await playerProperty('width'),
    vo: await playerProperty('current-vo'),
    hwdec: await playerProperty('hwdec-current')
  };
  if (!(timePos > 1)) throw new Error(`playback did not advance: ${JSON.stringify(result)}`);
  return result;
};

/** Loads the trailer through the IFrame API and waits until it plays (muted) or reports an error. */
const checkYouTube = (videoId: string) => new Promise<string>((resolveCheck, rejectCheck) => {
  // What the player got through, reported if it never plays.
  const progress: string[] = [];
  const timer = setTimeout(() => rejectCheck(new Error(`no playback after 40 s; got: ${progress.join(', ') || 'nothing'}`)), 40000);
  const resolve = (value: string) => {
    clearTimeout(timer);
    resolveCheck(value);
  };
  const reject = (error: Error) => {
    clearTimeout(timer);
    rejectCheck(error);
  };
  const page = window as unknown as {
    YT?: { Player: new (element: HTMLElement, options: unknown) => { mute: () => void; playVideo: () => void } };
    onYouTubeIframeAPIReady?: () => void;
  };
  const mount = document.createElement('div');
  Object.assign(mount.style, {position: 'fixed', right: '16px', bottom: '16px', zIndex: '50'});
  const inner = document.createElement('div');
  mount.appendChild(inner);
  document.body.appendChild(mount);
  const create = () => {
    const player = new page.YT!.Player(inner, {
      videoId,
      width: 320,
      height: 180,
      events: {
        onReady: () => {
          progress.push('ready');
          player.mute();
          player.playVideo();
        },
        onStateChange: (event: { data: number }) => {
          progress.push(`state ${event.data}`);
          if (event.data === 1) resolve('playing');
        },
        onError: (event: { data: number }) => reject(new Error(`YouTube player error ${event.data}`))
      }
    });
  };
  if (page.YT?.Player) {
    create();
    return;
  }
  page.onYouTubeIframeAPIReady = () => {
    progress.push('api');
    create();
  };
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.onerror = () => reject(new Error('could not load the YouTube IFrame API'));
  document.head.appendChild(script);
});

/**
 * Loads every language from the assets as this build ships them (zstd-compressed or in tables
 * when packaged): their tokenizers (kuromoji, jieba) and dictionaries (src-tauri/src/sys/table.rs,
 * vnedict.txt.zst), a real lookup in each, then one stroke-order SVG from each stroke pack. A build
 * that bundles the language assets must load all four. A build that ships language packs instead
 * (src-tauri/src/sys/langpack.rs) installs them first, from MITEIRU_SMOKE_LANGUAGE_PACKS (Vietnamese
 * through a real download when MITEIRU_LANGUAGE_PACK_URL points at a local server), then loads all
 * four. A build with neither (the desktop check's) skips it.
 * Packaged 8.0 builds once failed Chinese this way, unseen, because nothing here loaded a language.
 */
const SMOKE_LANGUAGES = [
  {plugin: 'japanese', channel: 'loadKuromoji', query: 'queryJapanese', word: '日本'},
  {plugin: 'cantonese', channel: 'loadCantonese', query: 'queryChinese', word: '中國'},
  {plugin: 'mandarin', channel: 'loadChinese', query: 'queryChinese', word: '中国'},
  {plugin: 'vietnamese', channel: 'loadVietnamese', query: 'queryVietnamese', word: 'nước'}
];

interface PackStatus {
  manifestFound: boolean;
  baseUrl: string;
  packs: Array<{ id: string; file: string; state: string }>;
}

/** Installs every missing pack and returns the ms each took; null when there is nothing to install from. */
const installLanguagePacks = async (dir: string | null | undefined) => {
  const before = await invoke<PackStatus>('langpack_status');
  if (!dir || !before.manifestFound || before.packs.length === 0) return null;
  const separator = dir.includes('\\') ? '\\' : '/';
  // The page cannot read the environment: CI's local server shows as the base URL (a release's is on github.com).
  const localServer = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(before.baseUrl);
  const installMs: Record<string, number> = {};
  const via: Record<string, string> = {};
  for (const pack of before.packs) {
    if (pack.state !== 'missing') continue;
    const onProgress = new Channel<unknown>();
    const t0 = Date.now();
    if (pack.id === 'vietnamese' && localServer) {
      await invoke('langpack_install', {id: pack.id, onProgress});
      via[pack.id] = 'download';
    } else {
      await invoke('langpack_install_file', {path: [dir, pack.file].join(separator), onProgress});
      via[pack.id] = 'file';
    }
    installMs[pack.id] = Date.now() - t0;
  }
  const after = await invoke<PackStatus>('langpack_status');
  const notInstalled = after.packs.filter((pack) => pack.state !== 'installed' && pack.state !== 'bundled');
  if (notInstalled.length > 0) throw new Error(`not installed: ${notInstalled.map((pack) => `${pack.id} (${pack.state})`).join(', ')}`);
  return {installMs, via};
};

const checkLanguages = async () => {
  const {resources, smokeLanguagePacks} = await invoke<{ resources: string; smokeLanguagePacks?: string | null }>('sys_info');
  // Windows reports a verbatim path (\\?\C:\...), where "/" is not a separator.
  const separator = resources.includes('\\') ? '\\' : '/';
  let installed: Awaited<ReturnType<typeof installLanguagePacks>> = null;
  // fs_stat answers null for a missing file (it does not reject), so only a stat counts as bundled.
  const bundled = await Promise.all(SMOKE_LANGUAGES.map(({plugin}) => invoke('fs_stat', {
    path: [resources, 'language-assets', plugin, 'asset-manifest.json'].join(separator)
  }).then((stat) => stat != null, () => false)));
  if (!bundled.every(Boolean)) {
    installed = await installLanguagePacks(smokeLanguagePacks);
    if (!installed) return 'skipped: no language packs to install';
  }
  const loaded: Record<string, number> = {};
  const lookups: Record<string, number> = {};
  for (const {plugin, channel, query, word} of SMOKE_LANGUAGES) {
    const t0 = Date.now();
    const result = await window.backend.invoke(channel) as { ok?: number; message?: string } | undefined;
    if (result?.ok !== 1) throw new Error(`${channel}: ${result?.message ?? 'no answer'}`);
    loaded[plugin] = Date.now() - t0;
    // A real lookup through the backend, right after this language loads: Mandarin and Cantonese
    // share one Chinese dictionary slot, so a later load would answer for an earlier one.
    const entries = await window.backend.invoke(query, word, 5);
    if (!Array.isArray(entries) || entries.length === 0) throw new Error(`${query}(${word}) returned no entries`);
    lookups[plugin] = entries.length;
  }
  // Stroke data lives in data tables when packaged (docs/DATA_FORMAT.md): read 日 from both sets.
  const strokes: Record<string, number> = {};
  for (const [set, channel, file] of [['kanji', 'readKanjiSVG', '065e5.svg'], ['hanzi', 'readHanziSVG', '26085.svg']]) {
    const svg = await window.backend.invoke(channel, file);
    if (typeof svg !== 'string' || !svg.includes('<svg')) throw new Error(`stroke data: ${channel}(${file}) returned no SVG`);
    strokes[set] = svg.length;
  }
  return {...(installed ? {packs: installed} : {}), msPerLanguage: loaded, lookups, strokes};
};

/** YouTube refusing the video itself, not the embedder, as it does for CI's datacenter addresses. */
const YOUTUBE_REFUSALS = new Set([100, 101, 150]);

export const runSmokeTest = async (outPath: string, userData: string, platform: string) => {
  const started = Date.now();
  const results: Record<string, StepResult> = {};
  // Written before and after every step, so a crash still shows how far the test got.
  const save = (running?: string) => invoke('fs_write_text', {
    path: outPath,
    text: `${JSON.stringify(running ? {...results, running} : results, null, 2)}\n`,
    append: false
  }).catch(() => undefined);
  const step = async (name: string, run: () => Promise<unknown>, timeoutMs: number) => {
    await save(name);
    const t0 = Date.now();
    try {
      results[name] = {ok: true, ms: Date.now() - t0, value: await withTimeout(run(), timeoutMs)};
      results[name].ms = Date.now() - t0;
    } catch (error) {
      results[name] = {ok: false, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error)};
    }
    console.log(`[smoke] ${name}`, JSON.stringify(results[name]));
    await save();
  };

  await step('page', async () => ({url: location.href, userAgent: navigator.userAgent}), 1000);
  // Tauri's zoom hotkeys invoke this command; core:default does not grant it.
  await step('zoom', async () => {
    await invoke('plugin:webview|set_webview_zoom', {value: 1});
    return 'allowed';
  }, 1000);
  await step('backend', () => window.backend.invoke('getAppVersion'), 60000);
  await step('store', async () => {
    await window.electronStore.set('smokeTest.value', 42);
    const value = await window.electronStore.get('smokeTest.value', 0);
    if (value !== 42) throw new Error(`read back ${JSON.stringify(value)}`);
    return value;
  }, 10000);
  await step('analyzer', async () => {
    const registrationPath = `${userData}/analyzer-server.json`;
    let registration: { port: number } | undefined;
    for (let attempt = 0; attempt < 20 && !registration; attempt++) {
      registration = await invoke<string>('fs_read_text', {path: registrationPath}).then(JSON.parse, () => undefined);
      if (!registration) await sleep(500);
    }
    if (!registration) throw new Error('analyzer-server.json was not written');
    const response = await invoke<{ status: number; body_base64?: string; bodyBase64?: string }>('http_request', {
      request: {url: `http://127.0.0.1:${registration.port}/health`, timeoutMs: 10000}
    });
    const body = JSON.parse(decodeBase64(response.bodyBase64 ?? response.body_base64 ?? ''));
    if (response.status !== 200 || !body.ok) throw new Error(`health answered ${response.status}`);
    return {port: registration.port, plugins: body.supportedPlugins?.length};
  }, 20000);
  await step('player', () => checkPlayer(platform), 30000);
  await step('youtube', () => checkYouTube('-yslFBRBM2c').catch((error: Error) => {
    const code = Number(/error (\d+)/.exec(error.message)?.[1]);
    if (YOUTUBE_REFUSALS.has(code)) return `embed accepted; YouTube refused the video here (error ${code})`;
    throw error;
  }), 45000);

  await step('languages', () => checkLanguages(), 180000);
  // Leave the picture up long enough for the workflow's screenshot.
  await sleep(Math.max(0, 40000 - (Date.now() - started)));
  const failed = Object.values(results).some((result) => !result.ok);
  await save();
  await invoke('smoke_test_exit', {code: failed ? 1 : 0});
};
