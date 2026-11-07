/**
 * electron-store replacement: dot-path keys over one JSON object, persisted at
 * `<userData>/config.json` (the file electron-store itself uses, so settings carry over).
 * Reads are synchronous like the real store; `openStore` loads the file first. Writes are debounced.
 */
import pathe from 'pathe';
import {readFile, rename, rm, writeFile} from './fsImpl';
import {runtime} from './runtime';

type Json = Record<string, unknown>;

const WRITE_DELAY_MS = 150;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

const segments = (key: string) => key.split('.');

export class Store {
  private data: Json;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string = pathe.join(runtime.userData, 'config.json'), initial: Json = {}) {
    this.data = initial;
  }

  /** Opens the store, reading the file when there is one. A file that cannot be parsed is set aside, not overwritten. */
  static async open(file: string = pathe.join(runtime.userData, 'config.json')): Promise<Store> {
    let text: string | null = null;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    if (text === null || text.trim() === '') return new Store(file);
    try {
      const parsed = JSON.parse(text);
      return new Store(file, isObject(parsed) ? parsed : {});
    } catch (error) {
      console.error(`[Store] ${file} is not valid JSON; keeping it as ${file}.corrupt and starting empty`, error);
      await rename(file, `${file}.corrupt`).catch(() => undefined);
      return new Store(file);
    }
  }

  get store(): Json {
    return this.data;
  }

  set store(value: Json) {
    this.data = value;
    this.scheduleWrite();
  }

  get<T = unknown>(key: string, defaultValue?: T): T {
    let current: unknown = this.data;
    for (const segment of segments(key)) {
      if (!isObject(current) || !(segment in current)) return defaultValue as T;
      current = current[segment];
    }
    return (current === undefined ? defaultValue : current) as T;
  }

  has(key: string): boolean {
    return this.get(key, undefined) !== undefined;
  }

  set(keyOrObject: string | Json, value?: unknown) {
    if (typeof keyOrObject === 'string') {
      this.setPath(keyOrObject, value);
    } else {
      for (const [key, entry] of Object.entries(keyOrObject)) this.setPath(key, entry);
    }
    this.scheduleWrite();
  }

  delete(key: string) {
    const path = segments(key);
    let current: unknown = this.data;
    for (const segment of path.slice(0, -1)) {
      if (!isObject(current)) return;
      current = current[segment];
    }
    if (isObject(current)) delete current[path.at(-1)];
    this.scheduleWrite();
  }

  clear() {
    this.data = {};
    this.scheduleWrite();
  }

  /** Writes any pending change now; resolves when the file is on disk. */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.queueWrite();
    }
    await this.writing;
  }

  private setPath(key: string, value: unknown) {
    const path = segments(key);
    let current = this.data;
    for (const segment of path.slice(0, -1)) {
      if (!isObject(current[segment])) current[segment] = {};
      current = current[segment] as Json;
    }
    current[path.at(-1)] = value;
  }

  private scheduleWrite() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.queueWrite();
    }, WRITE_DELAY_MS);
  }

  private queueWrite() {
    const text = `${JSON.stringify(this.data, null, '\t')}\n`;
    this.writing = this.writing.then(async () => {
      // Written beside the target and renamed over it, so a crash never leaves half a config.json.
      const temporary = `${this.file}.tmp`;
      try {
        await writeFile(temporary, text, 'utf8');
        await rename(temporary, this.file);
      } catch (error) {
        console.error(`[Store] Failed to write ${this.file}:`, error);
        await rm(temporary, {force: true}).catch(() => undefined);
      }
    });
  }
}

export const openStore = () => Store.open();

export default Store;
