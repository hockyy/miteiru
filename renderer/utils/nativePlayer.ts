import {invoke} from "@tauri-apps/api/core";
import {getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";

/** Running inside the Tauri desktop shell (native video via libmpv is available). */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** mpv wants a filesystem path; the page keeps Windows paths as "/C:/...". */
export const nativeMediaPath = (path: string) => (/^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path);

type Listener = () => void;
/** `src` names the video for the page (a file, a YouTube link); `path` is what mpv opens. */
type Source = { src: string; path: string; type?: string; httpHeaders?: Record<string, string> };
type PlayerEvent = {
  type: string;
  name?: string;
  value?: string | null;
  reason?: string;
  error?: string;
  level?: string;
  text?: string;
};

const OBSERVED = ["time-pos", "duration", "pause", "eof-reached", "speed", "volume", "mute"];
/** How long a queued player command may take before the ones after it go ahead anyway. */
const COMMAND_TIMEOUT_MS = 5000;

let activePlayer: NativePlayer | null = null;
/** The player on screen, for hooks that act on playback outside the video component. */
export const getActiveNativePlayer = () => activePlayer;
const setActiveNativePlayer = (player: NativePlayer | null) => {
  activePlayer = player;
};

/**
 * libmpv playing in the window under the page, behind the same small video.js-shaped API the
 * video page and its hooks use (on/off, currentTime, duration, paused, play/pause, playbackRate,
 * volume, src). mpv draws into the window itself, so nothing here touches frames.
 */
export class NativePlayer {
  private listeners = new Map<string, Set<Listener>>();
  private props = new Map<string, string | null>();
  private disposed = false;
  private source = "";
  private lastTime = 0;
  private lastTimeAt = 0;
  private unlisten: (() => void) | null = null;
  /** Commands reach mpv in the order given: a seek after the loadfile it is for, a loadfile after its headers. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly element: HTMLElement) {}

  async open() {
    // Miteiru draws subtitles itself; mpv only shows the picture.
    await invoke("player_open", {options: {"sub-visibility": "no"}});
    this.unlisten = await getCurrentWebviewWindow().listen<PlayerEvent>("player://event", (e) => this.onEvent(e.payload));
    await invoke("player_observe", {names: OBSERVED});
    setActiveNativePlayer(this);
  }

  private onEvent(ev: PlayerEvent) {
    if (ev.type === "property" && ev.name) {
      const previous = this.props.get(ev.name);
      const value = ev.value ?? null;
      this.props.set(ev.name, value);
      switch (ev.name) {
        case "time-pos":
          if (value !== null) {
            this.lastTime = Number(value);
            this.lastTimeAt = performance.now();
          }
          break;
        case "duration":
          if (value !== null) {
            if (previous == null) this.emit("loadedmetadata");
            this.emit("durationchange");
          }
          break;
        case "pause":
          if (value === "yes") this.emit("pause");
          else if (value === "no" && previous !== undefined) {
            this.emit("play");
            this.emit("playing");
          }
          break;
        case "eof-reached":
          if (value === "yes") this.emit("ended");
          break;
      }
    } else if (ev.type === "playback-restart") {
      if (!this.paused()) this.emit("playing");
    } else if (ev.type === "end-file" && ev.reason === "error") {
      console.error("[native-video] playback failed", ev.error);
      this.emit("error");
    } else if (ev.type === "log" && ev.level === "error") {
      console.error("[native-video]", ev.text?.trim());
    }
  }

  private emit(name: string) {
    this.listeners.get(name)?.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(`[native-video] ${name} listener failed`, e);
      }
    });
  }

  private run(cmd: string, args: Record<string, unknown>) {
    if (this.disposed) return;
    this.queue = this.queue
      .then(() => {
        if (this.disposed) return undefined;
        // A call that never answers must not hold back every later one (pause, seek, resize).
        let timer: ReturnType<typeof setTimeout> | undefined;
        const stuck = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`no answer in ${COMMAND_TIMEOUT_MS} ms`)), COMMAND_TIMEOUT_MS);
        });
        return Promise.race([invoke(cmd, args), stuck]).finally(() => clearTimeout(timer));
      })
      .catch((e) => console.error(`[native-video] ${cmd} failed`, e));
  }

  on(name: string, fn: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }

  off(name: string, fn: Listener) {
    this.listeners.get(name)?.delete(fn);
  }

  currentSrc() {
    return this.source;
  }

  src(sources: Source | Source[]) {
    const source = Array.isArray(sources) ? sources[0] : sources;
    if (!source) return;
    this.source = source.src;
    this.props.delete("duration");
    this.lastTime = 0;
    this.lastTimeAt = performance.now();
    // A stream (YouTube through yt-dlp) brings the headers its URLs need. Local files need none,
    // so whatever an earlier stream set can stay.
    if (source.httpHeaders) {
      const {"User-Agent": userAgent, ...others} = source.httpHeaders;
      if (userAgent) this.run("player_set", {name: "user-agent", value: userAgent});
      this.run("player_command", {args: ["change-list", "http-header-fields", "clr", ""]});
      for (const [name, value] of Object.entries(others)) {
        this.run("player_command", {args: ["change-list", "http-header-fields", "append", `${name}: ${value}`]});
      }
    }
    this.run("player_command", {args: ["loadfile", nativeMediaPath(source.path), "replace"]});
  }

  /** Smooth between mpv's per-frame time-pos updates, so subtitles change on time. */
  currentTime(seconds?: number): number {
    if (seconds !== undefined) {
      this.lastTime = seconds;
      this.lastTimeAt = performance.now();
      this.run("player_command", {args: ["seek", String(seconds), "absolute+exact"]});
      return seconds;
    }
    if (this.paused() || !this.lastTimeAt) return this.lastTime;
    const ahead = ((performance.now() - this.lastTimeAt) / 1000) * this.playbackRate();
    const duration = this.duration();
    const t = this.lastTime + Math.min(ahead, 0.25);
    return Number.isFinite(duration) ? Math.min(t, duration) : t;
  }

  duration() {
    const d = this.props.get("duration");
    return d == null ? NaN : Number(d);
  }

  paused() {
    return this.props.get("pause") !== "no";
  }

  play() {
    this.run("player_set", {name: "pause", value: "no"});
    return Promise.resolve();
  }

  pause() {
    this.run("player_set", {name: "pause", value: "yes"});
  }

  playbackRate(rate?: number): number {
    if (rate !== undefined) {
      this.run("player_set", {name: "speed", value: String(rate)});
      return rate;
    }
    return Number(this.props.get("speed") ?? 1) || 1;
  }

  volume(level?: number): number {
    if (level !== undefined) {
      this.run("player_set", {name: "volume", value: String(Math.round(level * 100))});
      return level;
    }
    return (Number(this.props.get("volume") ?? 100) || 0) / 100;
  }

  /** Switch audio track (mpv track id); replaces re-encoding for multi-track files. */
  setAudioTrack(id: number | "auto") {
    this.run("player_set", {name: "aid", value: String(id)});
  }

  /** Fit the video into the element's box. */
  updateRect() {
    const r = this.element.getBoundingClientRect();
    this.run("player_set_rect", {
      rect: {x: r.left, y: r.top, width: r.width, height: r.height},
      viewport: {x: 0, y: 0, width: window.innerWidth, height: window.innerHeight},
    });
  }

  el() {
    return this.element;
  }

  error() {
    return null;
  }

  tech() {
    return undefined;
  }

  isDisposed() {
    return this.disposed;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (activePlayer === this) setActiveNativePlayer(null);
    this.unlisten?.();
    this.listeners.clear();
    invoke("player_close").catch(() => undefined);
  }
}
