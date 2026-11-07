import {setSys, type SysCall} from "../../renderer/platform/backend/sys";

export type Call = { cmd: string; args?: Record<string, unknown> };

/**
 * Reads a kv_batch body the way src-tauri/src/sys/kv.rs decode_batch does, written separately from
 * the shim's encoder so the tests check the encoder against the format.
 */
export const decodeKvBatch = (data: ArrayBuffer) => {
  const view = new DataView(data);
  const decoder = new TextDecoder("utf-8", {fatal: true});
  let at = 0;
  const u32 = () => {
    const value = view.getUint32(at, true);
    at += 4;
    return value;
  };
  const text = () => {
    const length = u32();
    const value = decoder.decode(new Uint8Array(data, at, length));
    at += length;
    return value;
  };
  const ops: ({ type: "put"; key: string; value: string } | { type: "del"; key: string })[] = [];
  for (let count = u32(); count > 0; count--) {
    const kind = view.getUint8(at++);
    const key = text();
    if (kind === 0) ops.push({type: "put", key, value: text()});
    else if (kind === 1) ops.push({type: "del", key});
    else throw new Error(`unknown kv batch kind ${kind}`);
  }
  if (at !== data.byteLength) throw new Error("trailing bytes in kv batch");
  return ops;
};

/** An in-memory stand-in for the Rust kv_* commands: keys in bytewise (UTF-8) order, like LevelDB. */
export const createFakeKv = () => {
  const stores = new Map<string, Map<string, string>>();
  const handles = new Map<number, Map<string, string>>();
  let nextHandle = 1;
  const calls: Call[] = [];

  const sorted = (store: Map<string, string>) => [...store.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));

  const handler: SysCall = async (cmd, args = {}) => {
    calls.push({cmd, args});
    const store = handles.get(args.handle as number);
    switch (cmd) {
      case "kv_open": {
        const location = args.location as string;
        if (!stores.has(location)) stores.set(location, new Map());
        const handle = nextHandle++;
        handles.set(handle, stores.get(location));
        return handle;
      }
      case "kv_close": handles.delete(args.handle as number); return null;
      case "kv_get": return store.get(args.key as string) ?? null;
      case "kv_get_many": return (args.keys as string[]).map((key) => store.get(key) ?? null);
      case "kv_put": store.set(args.key as string, args.value as string); return null;
      case "kv_del": store.delete(args.key as string); return null;
      case "kv_batch":
        for (const op of decodeKvBatch(args.data as ArrayBuffer)) {
          if (op.type === "put") store.set(op.key, op.value);
          else store.delete(op.key);
        }
        return null;
      case "kv_range": {
        const {gt, gte, lt, lte, limit = -1, reverse, keys = true, values = true} = (args.opts ?? {}) as Record<string, any>;
        let selected = sorted(store).filter((key) => (
          (gt === undefined || key > gt) && (gte === undefined || key >= gte)
          && (lt === undefined || key < lt) && (lte === undefined || key <= lte)
        ));
        if (reverse) selected.reverse();
        if (limit >= 0) selected = selected.slice(0, limit);
        return selected.map((key) => [keys ? key : null, values ? store.get(key) : null]);
      }
      case "kv_clear": {
        const {gt, gte, lt, lte} = (args.opts ?? {}) as Record<string, any>;
        for (const key of [...store.keys()]) {
          if ((gt === undefined || key > gt) && (gte === undefined || key >= gte)
            && (lt === undefined || key < lt) && (lte === undefined || key <= lte)) store.delete(key);
        }
        return null;
      }
      default: throw new Error(`EINVAL: fake sys does not implement ${cmd}`);
    }
  };

  setSys(handler);
  return {calls, stores};
};

/** An in-memory stand-in for the fs_* commands the store uses (text files only). */
export const createFakeFs = () => {
  const files = new Map<string, string>();
  const calls: Call[] = [];

  const handler: SysCall = async (cmd, args = {}) => {
    calls.push({cmd, args});
    const path = args.path as string;
    switch (cmd) {
      case "fs_read_text":
        if (!files.has(path)) throw `ENOENT: no such file or directory, open '${path}'`;
        return files.get(path);
      case "fs_write_text":
        files.set(path, args.append ? (files.get(path) ?? "") + (args.text as string) : args.text as string);
        return null;
      case "fs_rename":
        files.set(args.to as string, files.get(args.from as string));
        files.delete(args.from as string);
        return null;
      case "fs_rm": files.delete(path); return null;
      case "fs_stat": return files.has(path) ? {isFile: true, isDirectory: false, size: files.get(path).length, mtimeMs: 1} : null;
      default: throw new Error(`EINVAL: fake sys does not implement ${cmd}`);
    }
  };

  setSys(handler);
  return {files, calls};
};
