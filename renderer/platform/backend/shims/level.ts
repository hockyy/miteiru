/**
 * `level` replacement over the kv_* commands (SQLite on the Rust side). It follows level 10's
 * behavior for what main/ uses: opens on construction, `get` resolves undefined for a missing key,
 * `getMany` gives undefined for missing keys, iterators are async-iterable and paged.
 */
import {sys} from '../sys';
import {nodeError, type NodeError} from './errors';

const PAGE_SIZE = 5000;

export interface RangeOptions {
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
  /** -1 (the default) means no limit. */
  limit?: number;
  reverse?: boolean;
  keys?: boolean;
  values?: boolean;
}

export type BatchOperation =
  | { type: 'put'; key: string; value: string }
  | { type: 'del'; key: string };

type Entry = [string | null, string | null];
type Status = 'opening' | 'open' | 'closing' | 'closed';

const databaseNotOpen = (): NodeError => {
  const error: NodeError = new Error('Database is not open');
  error.code = 'LEVEL_DATABASE_NOT_OPEN';
  return error;
};

const notFound = (key: string): NodeError => {
  const error: NodeError = new Error(`Entry not found: ${key}`);
  error.code = 'LEVEL_NOT_FOUND';
  error.notFound = true;
  return error;
};

type Kind = 'entries' | 'keys' | 'values';

class RangeIterator<T> implements AsyncIterableIterator<T> {
  private buffer: Entry[] = [];
  private position = 0;
  private exhausted = false;
  private delivered = 0;
  private lower: { gt?: string; gte?: string };
  private upper: { lt?: string; lte?: string };
  private readonly limit: number;
  private readonly reverse: boolean;

  constructor(
    private readonly handle: () => Promise<number>,
    options: RangeOptions,
    private readonly kind: Kind
  ) {
    this.lower = {gt: options.gt, gte: options.gte};
    this.upper = {lt: options.lt, lte: options.lte};
    this.limit = options.limit ?? -1;
    this.reverse = Boolean(options.reverse);
  }

  private async fill() {
    const remaining = this.limit < 0 ? PAGE_SIZE : Math.min(PAGE_SIZE, this.limit - this.delivered);
    if (remaining <= 0) {
      this.exhausted = true;
      return;
    }
    const page = await this.query(remaining);
    this.buffer = page;
    this.position = 0;
    if (page.length < remaining) this.exhausted = true;
    const last = page.at(-1);
    if (!last) return;
    // The next page starts just past the last key we saw, in the direction of travel.
    // Pages always carry keys (even for a values iterator) so the next page can start after this one.
    if (this.reverse) this.upper = {lt: last[0]};
    else this.lower = {gt: last[0]};
  }

  private async query(limit: number): Promise<Entry[]> {
    const handle = await this.handle();
    const bounds = Object.entries({...this.lower, ...this.upper}).filter(([, bound]) => bound !== undefined);
    return sys('kv_range', {
      handle,
      opts: {...Object.fromEntries(bounds), limit, reverse: this.reverse, keys: true, values: this.kind !== 'keys'}
    }) as Promise<Entry[]>;
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.position >= this.buffer.length && !this.exhausted) await this.fill();
    if (this.position >= this.buffer.length) return {done: true, value: undefined};
    const [key, value] = this.buffer[this.position++];
    this.delivered++;
    const result = this.kind === 'keys' ? key : this.kind === 'values' ? value : [key, value];
    return {done: false, value: result as T};
  }

  async all(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) items.push(item);
    return items;
  }

  async close() {
    this.exhausted = true;
    this.buffer = [];
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

export class Level<K = string, V = string> {
  readonly location: string;
  private state: Status = 'opening';
  private opened: Promise<number>;

  constructor(location: string) {
    this.location = location;
    this.opened = this.openHandle();
    // A failed open surfaces on the first operation; the constructor must not leave it unhandled.
    this.opened.catch(() => undefined);
  }

  get status(): Status {
    return this.state;
  }

  private async openHandle(): Promise<number> {
    try {
      const handle = await sys('kv_open', {location: this.location}) as number;
      this.state = 'open';
      return handle;
    } catch (error) {
      this.state = 'closed';
      throw nodeError(error);
    }
  }

  /** Re-opens a closed database (a fresh `new Level(location)` does the same). */
  async open() {
    if (this.state === 'closed') {
      this.state = 'opening';
      this.opened = this.openHandle();
      this.opened.catch(() => undefined);
    }
    await this.opened;
  }

  async close() {
    if (this.state === 'closed' || this.state === 'closing') return;
    const handle = await this.opened.catch(() => null);
    this.state = 'closing';
    try {
      if (handle !== null) await sys('kv_close', {handle});
    } finally {
      this.state = 'closed';
    }
  }

  private handle = async (): Promise<number> => {
    if (this.state === 'closed' || this.state === 'closing') throw databaseNotOpen();
    return this.opened;
  };

  /** The value, or undefined when the key is missing (level 10 semantics). */
  async get(key: K): Promise<V | undefined> {
    const value = await sys('kv_get', {handle: await this.handle(), key}) as string | null;
    return value === null ? undefined : (value as unknown as V);
  }

  /** Like `get`, but throws the `LEVEL_NOT_FOUND` error of older level versions for a missing key. */
  async getOrThrow(key: K): Promise<V> {
    const value = await this.get(key);
    if (value === undefined) throw notFound(String(key));
    return value;
  }

  async getMany(keys: K[]): Promise<(V | undefined)[]> {
    if (keys.length === 0) return [];
    const values = await sys('kv_get_many', {handle: await this.handle(), keys}) as (string | null)[];
    return values.map((value) => (value === null ? undefined : (value as unknown as V)));
  }

  async put(key: K, value: V): Promise<void> {
    await sys('kv_put', {handle: await this.handle(), key, value});
  }

  async del(key: K): Promise<void> {
    await sys('kv_del', {handle: await this.handle(), key});
  }

  async batch(operations: { type: 'put' | 'del'; key: K; value?: V }[]): Promise<void> {
    if (operations.length === 0) return;
    await sys('kv_batch', {handle: await this.handle(), ops: operations});
  }

  /** Not in `level`: bulk mode for building a database from scratch (src-tauri/src/sys/kv.rs set_bulk). */
  async bulkLoad(on: boolean): Promise<void> {
    await sys('kv_bulk', {handle: await this.handle(), on});
  }

  iterator(options: RangeOptions = {}) {
    return new RangeIterator<[K, V]>(this.handle, options, 'entries');
  }

  keys(options: RangeOptions = {}) {
    return new RangeIterator<K>(this.handle, options, 'keys');
  }

  values(options: RangeOptions = {}) {
    return new RangeIterator<V>(this.handle, options, 'values');
  }

  async clear(options: RangeOptions = {}): Promise<void> {
    await sys('kv_clear', {handle: await this.handle(), opts: options});
  }
}

export default {Level};
