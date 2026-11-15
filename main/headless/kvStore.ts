import fs from "node:fs";
import path from "node:path";

/**
 * The app's key-value store (src-tauri/src/sys/kv.rs) for Node: the same SQLite file
 * (`<location>.sqlite3`, table `kv(key, value)`, WAL), so the headless server reads and writes the
 * learner's saved words while Miteiru has them open. SQLite lets both processes in: readers see a
 * consistent snapshot, and a writer waits up to 5 seconds for the other's write to finish.
 *
 * A 7.x LevelDB folder that Miteiru 8 hasn't brought over yet is not imported here: that is the app's
 * job (it writes the SQLite file once, on its first start), and two importers could race.
 */

type DatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
    run(...params: unknown[]): unknown;
  };
  close(): void;
};

const SCHEMA = "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID";

export interface RangeOptions {
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
  limit?: number;
  reverse?: boolean;
  keys?: boolean;
  values?: boolean;
}

export type BatchOp = {put: true; key: string; value: string} | {put: false; key: string};

const kvError = (error: unknown) => `EIO: i/o error, kv: ${error instanceof Error ? error.message : String(error)}`;

/** kv.rs decode_batch: a u32 count, then per write a kind byte (0 put, 1 del), the key and a put's value, each u32-length-prefixed UTF-8; little-endian. */
export const decodeBatch = (body: ArrayBuffer | Uint8Array): BatchOp[] => {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", {fatal: true});
  const malformed = () => new Error("EINVAL: invalid argument, malformed kv batch");
  let at = 0;
  const u32 = () => {
    if (at + 4 > bytes.length) throw malformed();
    const value = view.getUint32(at, true);
    at += 4;
    return value;
  };
  const text = () => {
    const length = u32();
    if (at + length > bytes.length) throw malformed();
    try {
      return decoder.decode(bytes.subarray(at, (at += length)));
    } catch {
      throw malformed();
    }
  };
  const count = u32();
  const ops: BatchOp[] = [];
  for (let index = 0; index < count; index++) {
    if (at >= bytes.length) throw malformed();
    const kind = bytes[at++];
    const key = text();
    if (kind === 0) ops.push({put: true, key, value: text()});
    else if (kind === 1) ops.push({put: false, key});
    else throw malformed();
  }
  if (at !== bytes.length) throw malformed();
  return ops;
};

interface Slot {
  location: string;
  refs: number;
  db: DatabaseSync;
}

export class KvStore {
  private next = 0;
  private readonly slots = new Map<number, Slot>();
  private readonly byLocation = new Map<string, number>();

  constructor(private readonly openDatabase: (file: string) => DatabaseSync) {}

  /** Opens (or takes another reference to) the store at `location`. */
  open(location: string): number {
    const existing = this.byLocation.get(location);
    if (existing !== undefined) {
      this.slots.get(existing)!.refs++;
      return existing;
    }
    const file = `${location}.sqlite3`;
    if (!fs.existsSync(file) && fs.existsSync(path.join(location, "CURRENT"))) {
      throw new Error(`EIO: i/o error, kv: '${location}' still holds Miteiru 7's saved words. Open Miteiru once so it brings them over, then try again.`);
    }
    let db: DatabaseSync;
    try {
      fs.mkdirSync(path.dirname(file), {recursive: true});
      db = this.openDatabase(file);
      // What rusqlite gives the app: wait for the other process's write instead of failing at once.
      db.exec("PRAGMA busy_timeout = 5000");
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA synchronous = NORMAL");
      db.exec(SCHEMA);
    } catch (error) {
      throw new Error(kvError(error));
    }
    const handle = ++this.next;
    this.slots.set(handle, {location, refs: 1, db});
    this.byLocation.set(location, handle);
    return handle;
  }

  close(handle: number) {
    const slot = this.slots.get(handle);
    if (!slot) return;
    if (--slot.refs > 0) return;
    this.slots.delete(handle);
    this.byLocation.delete(slot.location);
    try {
      slot.db.close();
    } catch {
      // Closing twice or after a failure: nothing to keep.
    }
  }

  closeAll() {
    for (const handle of [...this.slots.keys()]) {
      const slot = this.slots.get(handle)!;
      slot.refs = 1;
      this.close(handle);
    }
  }

  private db(handle: number): DatabaseSync {
    const slot = this.slots.get(handle);
    if (!slot) throw new Error(`EINVAL: invalid argument, kv handle ${handle} is not open`);
    return slot.db;
  }

  private run<T>(handle: number, work: (db: DatabaseSync) => T): T {
    const db = this.db(handle);
    try {
      return work(db);
    } catch (error) {
      throw new Error(kvError(error));
    }
  }

  get(handle: number, key: string): string | null {
    return this.run(handle, (db) => (db.prepare("SELECT value FROM kv WHERE key = ?").get(key)?.value as string | undefined) ?? null);
  }

  getMany(handle: number, keys: string[]): Array<string | null> {
    return this.run(handle, (db) => {
      const statement = db.prepare("SELECT value FROM kv WHERE key = ?");
      return keys.map((key) => (statement.get(key)?.value as string | undefined) ?? null);
    });
  }

  put(handle: number, key: string, value: string) {
    this.run(handle, (db) => db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(key, value));
  }

  del(handle: number, key: string) {
    this.run(handle, (db) => db.prepare("DELETE FROM kv WHERE key = ?").run(key));
  }

  /** All the writes in one transaction, or none. */
  batch(handle: number, ops: BatchOp[]) {
    this.run(handle, (db) => {
      const put = db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)");
      const del = db.prepare("DELETE FROM kv WHERE key = ?");
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const op of ops) {
          if (op.put) put.run(op.key, op.value);
          else del.run(op.key);
        }
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Nothing open to roll back.
        }
        throw error;
      }
    });
  }

  private where(options: RangeOptions): {sql: string; args: unknown[]} {
    const parts: string[] = [];
    const args: unknown[] = [];
    for (const [operator, bound] of [[">", options.gt], [">=", options.gte], ["<", options.lt], ["<=", options.lte]] as const) {
      if (typeof bound === "string") {
        parts.push(`key ${operator} ?`);
        args.push(bound);
      }
    }
    return {sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", args};
  }

  /** kv.rs range: [key, value] rows in key order (UTF-8 bytes), each null when not asked for. */
  range(handle: number, options: RangeOptions = {}): Array<[string | null, string | null]> {
    return this.run(handle, (db) => {
      const {sql, args} = this.where(options);
      const keys = options.keys ?? true;
      const values = options.values ?? true;
      const rows = db.prepare(
        `SELECT ${keys ? "key" : "NULL AS key"}, ${values ? "value" : "NULL AS value"} FROM kv${sql} ORDER BY key ${options.reverse ? "DESC" : "ASC"} LIMIT ?`
      ).all(...args, options.limit ?? -1);
      return rows.map((row) => [row.key as string | null, row.value as string | null]);
    });
  }

  clear(handle: number, options: RangeOptions = {}) {
    this.run(handle, (db) => {
      const {sql, args} = this.where(options);
      const limit = options.limit ?? -1;
      if (limit >= 0) {
        db.prepare(`DELETE FROM kv WHERE key IN (SELECT key FROM kv${sql} ORDER BY key ${options.reverse ? "DESC" : "ASC"} LIMIT ?)`).run(...args, limit);
      } else {
        db.prepare(`DELETE FROM kv${sql}`).run(...args);
      }
    });
  }
}
