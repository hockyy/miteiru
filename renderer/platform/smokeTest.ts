/**
 * A self-check for CI on each OS. With MITEIRU_SMOKE_TEST=<results.json> the app checks the backend
 * worker, the store, the analyzer API, libmpv drawing under the page and a YouTube embed, writes the
 * results there and exits (code 1 if a step failed). .github/workflows/desktop-check.yml runs it.
 */
import {invoke} from '@tauri-apps/api/core';

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
 * Loads Japanese and Cantonese from the assets as this build ships them (gzipped when packaged):
 * their tokenizers and a first dictionary import (src-tauri/src/sys/dict_import.rs), then one
 * stroke-order SVG from each stroke pack. A build without language assets (the desktop check's)
 * skips it; a build with them must load both.
 * Packaged 8.0 builds once failed Chinese this way, unseen, because nothing here loaded a language.
 */
const SMOKE_LANGUAGES = [{plugin: 'japanese', channel: 'loadKuromoji'}, {plugin: 'cantonese', channel: 'loadCantonese'}];

const checkLanguages = async () => {
  const {resources} = await invoke<{ resources: string }>('sys_info');
  // Windows reports a verbatim path (\\?\C:\...), where "/" is not a separator.
  const separator = resources.includes('\\') ? '\\' : '/';
  const loaded: Record<string, number> = {};
  for (const {plugin, channel} of SMOKE_LANGUAGES) {
    const manifest = [resources, 'language-assets', plugin, 'asset-manifest.json'].join(separator);
    if (!await invoke('fs_stat', {path: manifest}).catch(() => null)) return 'skipped: this build has no language assets';
    const t0 = Date.now();
    const result = await window.backend.invoke(channel) as { ok?: number; message?: string } | undefined;
    if (result?.ok !== 1) throw new Error(`${channel}: ${result?.message ?? 'no answer'}`);
    loaded[plugin] = Date.now() - t0;
  }
  // Stroke data lives in data tables when packaged (docs/DATA_FORMAT.md): read 日 from both sets.
  const strokes: Record<string, number> = {};
  for (const [set, channel, file] of [['kanji', 'readKanjiSVG', '065e5.svg'], ['hanzi', 'readHanziSVG', '26085.svg']]) {
    const svg = await window.backend.invoke(channel, file);
    if (typeof svg !== 'string' || !svg.includes('<svg')) throw new Error(`stroke data: ${channel}(${file}) returned no SVG`);
    strokes[set] = svg.length;
  }
  return {msPerLanguage: loaded, strokes};
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
