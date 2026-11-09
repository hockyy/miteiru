/**
 * A self-check for CI on each OS. With MITEIRU_SMOKE_TEST=<results.json> the app checks the backend
 * worker, the store, the analyzer API, libmpv drawing under the page, a YouTube embed, reading the
 * subtitles inside an MKV and every language (installing the language packs first when the build ships
 * them), writes the results there and exits (code 1 if a step failed). It also checks, in this OS's
 * webview, how the My words panel holds its scroll position and how AI answers stream.
 * .github/workflows/release.yml runs it on the packaged apps, and desktop-check.yml on debug builds.
 */
import {Channel, invoke} from '@tauri-apps/api/core';
import {holdScrollPosition, topWithin, VOCAB_EDGE_MARGIN} from '../components/VideoPlayer/vocabScroll';
import {streamOpenRouterCompletion} from '../utils/openRouterClient';

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

// ---- A tiny Matroska file, built here so the MKV check needs no media file (EBML: id, size, data). ----

const concatBytes = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** A number as `width` big-endian bytes. */
const bigEndian = (value: number, width: number) => {
  const out = new Uint8Array(width);
  for (let i = width - 1, rest = value; i >= 0; i--, rest = Math.floor(rest / 256)) out[i] = rest % 256;
  return out;
};

/** An element: its id (which carries its own length marker), an 8-byte size, then the data. */
const ebml = (id: number, ...data: Uint8Array[]) => {
  const body = concatBytes(...data);
  const idBytes = bigEndian(id, id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1);
  return concatBytes(idBytes, Uint8Array.of(0x01), bigEndian(body.length, 7), body);
};

const ebmlUint = (id: number, value: number, width = 4) => ebml(id, bigEndian(value, width));
const ebmlText = (id: number, text: string) => ebml(id, new TextEncoder().encode(text));

/** One Japanese SRT track with one cue, `text`, from 1 s to 2.5 s (timestamps in ms). */
const tinyMkv = (text: string) => concatBytes(
  ebml(0x1A45DFA3, ebmlText(0x4282, 'matroska'), ebmlUint(0x4287, 4, 1), ebmlUint(0x4285, 2, 1)),
  ebml(0x18538067,
    ebml(0x1549A966, ebmlUint(0x2AD7B1, 1_000_000)),
    ebml(0x1654AE6B, ebml(0xAE, ebmlUint(0xD7, 1, 1), ebmlUint(0x83, 0x11, 1), ebmlText(0x86, 'S_TEXT/UTF8'), ebmlText(0x22B59C, 'jpn'))),
    // A BlockGroup: Block (track 1, +1000 ms, no lacing, the text) and BlockDuration 1500 ms.
    ebml(0x1F43B675, ebmlUint(0xE7, 0), ebml(0xA0,
      ebml(0xA1, Uint8Array.of(0x81, 0x03, 0xE8, 0x00), new TextEncoder().encode(text)),
      ebmlUint(0x9B, 1500))))
);

/**
 * Subtitles inside MKV files are read in Rust (src-tauri/src/sys/mkv.rs), with no FFmpeg: write a tiny
 * MKV to the temp folder, list its tracks, extract its subtitle and check the cue.
 */
const checkMkv = async () => {
  const {temp} = await invoke<{ temp: string }>('sys_info');
  const separator = temp.includes('\\') ? '\\' : '/';
  const path = [temp, `miteiru-smoke-${Date.now()}.mkv`].join(separator);
  await invoke('fs_write_bytes', tinyMkv('こんにちは'), {headers: {'x-path': encodeURIComponent(path)}});
  let srt = '';
  try {
    const info = await invoke<{ subtitleTracks: Array<{ index: number; codec: string; language?: string }> } | null>('mkv_tracks', {path});
    const track = info?.subtitleTracks[0];
    if (!track || track.codec !== 'subrip' || track.language !== 'jpn') throw new Error(`mkv_tracks gave ${JSON.stringify(info)}`);
    srt = await invoke<string>('mkv_extract_subtitle', {path, index: track.index});
    const text = await invoke<string>('fs_read_text', {path: srt});
    if (!text.includes('00:00:01,000 --> 00:00:02,500') || !text.includes('こんにちは')) throw new Error(`extracted ${JSON.stringify(text)}`);
    return {codec: track.codec, language: track.language, cue: text.trim().split(/\r?\n/).slice(1).join(' | ')};
  } finally {
    await invoke('fs_rm', {path, recursive: false, force: true}).catch(() => undefined);
    if (srt) await invoke('fs_rm', {path: srt, recursive: false, force: true}).catch(() => undefined);
  }
};

/**
 * The My words panel adds cards when a sentinel at either end comes within VOCAB_EDGE_MARGIN of its
 * visible area, and holds its view by hand when cards change above it (vocabScroll.ts), since the
 * macOS and Linux webviews have no CSS scroll anchoring. This checks both with the panel's own helper
 * and margin, and records whether this engine anchors by itself.
 */
const checkScrollWindow = async () => {
  const CARD_PX = 50;
  const VIEW_PX = 400;
  const container = document.createElement('div');
  // On screen, since an off-screen root can be throttled, but all but invisible and out of the way.
  container.style.cssText = `position:fixed;top:0;left:0;width:300px;height:${VIEW_PX}px;overflow-y:auto;opacity:0.01;pointer-events:none;z-index:2147483647`;
  const list = document.createElement('div');
  container.append(list);
  const card = (label: string) => {
    const element = document.createElement('div');
    element.style.height = `${CARD_PX}px`;
    element.textContent = label;
    return element;
  };
  const cards = Array.from({length: 200}, (_, index) => card(`card ${index}`));
  list.append(...cards);
  document.body.append(container);
  try {
    // A card 600 px below the visible area counts as near (inside the 800 px margin); one 2,000 px below doesn't.
    const nearCard = cards[(VIEW_PX + 600) / CARD_PX];
    const farCard = cards[(VIEW_PX + 2000) / CARD_PX];
    const seen = await new Promise<Record<string, boolean>>((resolve, reject) => {
      const found: Record<string, boolean> = {};
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) found[entry.target === nearCard ? 'near' : 'far'] = entry.isIntersecting;
        if ('near' in found && 'far' in found) {
          observer.disconnect();
          resolve(found);
        }
      }, {root: container, rootMargin: VOCAB_EDGE_MARGIN});
      observer.observe(nearCard);
      observer.observe(farCard);
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`the edge observer reported only ${JSON.stringify(found)}`));
      }, 5000);
    });
    if (!seen.near || seen.far) throw new Error(`edge observer: near ${seen.near}, far ${seen.far}`);

    // For the record: does this engine keep the view in place by itself when cards are added above?
    const anchor = cards[100];
    container.scrollTop = 100 * CARD_PX - VIEW_PX / 2;
    const beforeNative = topWithin(container, anchor);
    list.prepend(...Array.from({length: 20}, (_, index) => card(`native ${index}`)));
    const nativeAnchoring = Math.abs(topWithin(container, anchor) - beforeNative) < 1;

    // The panel's way: the engine's anchoring off, then the view held by hand, with cards added above...
    container.style.overflowAnchor = 'none';
    const beforeAdding = topWithin(container, anchor);
    list.prepend(...Array.from({length: 120}, (_, index) => card(`added ${index}`)));
    const movedPx = Math.round(topWithin(container, anchor) - beforeAdding);
    holdScrollPosition(container, anchor, beforeAdding);
    const offAfterAdding = Math.abs(topWithin(container, anchor) - beforeAdding);
    // ...and with cards dropped above, as when the window's far end is trimmed.
    const beforeDropping = topWithin(container, anchor);
    for (let index = 0; index < 60; index++) list.firstElementChild?.remove();
    holdScrollPosition(container, anchor, beforeDropping);
    const offAfterDropping = Math.abs(topWithin(container, anchor) - beforeDropping);
    if (offAfterAdding >= 1 || offAfterDropping >= 1) {
      throw new Error(`the view moved ${offAfterAdding} px after cards were added and ${offAfterDropping} px after they were dropped`);
    }
    return {edgeObserver: 'near fires, far does not', nativeAnchoring, movedWithoutHoldingPx: movedPx, heldWithinPx: Math.max(offAfterAdding, offAfterDropping)};
  } finally {
    container.remove();
  }
};

/**
 * AI answers stream through the AI SDK and OpenRouter's provider (utils/openRouterClient.ts). This runs
 * that code in this OS's webview against a stand-in for OpenRouter: fetch is replaced for
 * https://openrouter.ai/ only, and only during this step, so nothing leaves the machine. It checks the
 * partial text, the whole answer, cancelling mid-stream, the message for a refused key, that requests
 * ask for no thinking by default, and that a model that must think is asked again without that.
 */
const checkAiStream = async () => {
  const realFetch = window.fetch;
  const answer = '{"summary": "A polite greeting.", "translation": "Good morning."}';
  let mode: 'ok' | 'slow' | 'refused' | 'mustThink' = 'ok';
  const bodies: Array<Record<string, unknown>> = [];
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
    let sent: Record<string, unknown> = {};
    try {
      sent = JSON.parse(String(init?.body ?? '{}'));
    } catch {
      // Not JSON: recorded as empty.
    }
    bodies.push(sent);
    if (mode === 'mustThink' && 'reasoning' in sent) {
      return Promise.resolve(new Response(JSON.stringify({error: {message: 'Reasoning is mandatory for this endpoint and cannot be disabled.', code: 400}}), {
        status: 400,
        headers: {'Content-Type': 'application/json'}
      }));
    }
    if (mode === 'refused') {
      return Promise.resolve(new Response(JSON.stringify({error: {message: 'No auth credentials found', code: 401}}), {
        status: 401,
        headers: {'Content-Type': 'application/json'}
      }));
    }
    const encoder = new TextEncoder();
    const pieces = answer.match(/[^]{1,8}/g) ?? [];
    const signal = init?.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let index = 0;
        const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        const next = () => {
          if (signal?.aborted) return;
          if (index < pieces.length) {
            send({id: 'smoke', model: 'smoke', choices: [{index: 0, delta: {role: 'assistant', content: pieces[index++]}, finish_reason: null}]});
            timer = setTimeout(next, mode === 'slow' ? 200 : 20);
            return;
          }
          send({id: 'smoke', model: 'smoke', choices: [{index: 0, delta: {content: ''}, finish_reason: 'stop'}], usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2}});
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        };
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          try {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          } catch {
            // Already closed.
          }
        });
        next();
      }
    });
    return Promise.resolve(new Response(body, {status: 200, headers: {'Content-Type': 'text/event-stream'}}));
  }) as typeof fetch;
  const messages = [{role: 'user' as const, content: 'smoke test'}];
  try {
    const partials: string[] = [];
    const text = await streamOpenRouterCompletion('sk-smoke-test', 'smoke/model', messages, {onText: (latest) => partials.push(latest)});
    if (text !== answer) throw new Error(`the answer came back as ${JSON.stringify(text)}`);
    if (partials.length < 2 || partials[partials.length - 1] !== answer) throw new Error(`partial updates: ${JSON.stringify(partials)}`);
    // The smoke profile has no thinking setting, so the request asks for none.
    const reasoning = JSON.stringify(bodies[0]?.reasoning);
    if (reasoning !== JSON.stringify({effort: 'none', exclude: true})) throw new Error(`the request's reasoning was ${reasoning}`);

    mode = 'slow';
    const cancel = new AbortController();
    setTimeout(() => cancel.abort(), 300);
    const cancelled = await streamOpenRouterCompletion('sk-smoke-test', 'smoke/model', messages, {signal: cancel.signal})
      .then(() => 'finished anyway', (error: Error) => error.name);
    if (cancelled !== 'AbortError') throw new Error(`a cancelled request ended with ${cancelled}`);

    mode = 'refused';
    const refused = await streamOpenRouterCompletion('sk-smoke-test', 'smoke/model', messages)
      .then(() => 'answered', (error: Error) => error.message);
    if (!/didn't accept your key/.test(refused)) throw new Error(`a refused key said ${JSON.stringify(refused)}`);

    mode = 'mustThink';
    const before = bodies.length;
    const thought = await streamOpenRouterCompletion('sk-smoke-test', 'smoke/must-think', messages);
    const retried = bodies.slice(before).map((body) => 'reasoning' in body);
    if (thought !== answer || JSON.stringify(retried) !== JSON.stringify([true, false])) {
      throw new Error(`a model that must think: answer ${JSON.stringify(thought)}, requests with reasoning ${JSON.stringify(retried)}`);
    }
    return {partialUpdates: partials.length, reasoning, cancelled, refused, mustThink: 'asked again without reasoning'};
  } finally {
    window.fetch = realFetch;
  }
};

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
    await window.miteiruStore.set('smokeTest.value', 42);
    const value = await window.miteiruStore.get('smokeTest.value', 0);
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

  await step('mkv', () => checkMkv(), 15000);
  await step('scrollWindow', () => checkScrollWindow(), 10000);
  await step('aiStream', () => checkAiStream(), 20000);
  await step('languages', () => checkLanguages(), 180000);
  // Leave the picture up long enough for the workflow's screenshot.
  await sleep(Math.max(0, 40000 - (Date.now() - started)));
  const failed = Object.values(results).some((result) => !result.ok);
  await save();
  await invoke('smoke_test_exit', {code: failed ? 1 : 0});
};
