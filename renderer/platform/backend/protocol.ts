/** Messages between the main thread (tauriBridge.ts) and the backend worker (worker.ts). */

export type WorkerInbound =
  | { kind: 'sys-result'; id: number; ok: boolean; value?: unknown; error?: string }
  | { kind: 'invoke'; id: number; channel: string; args: unknown[] }
  | { kind: 'send'; channel: string; args: unknown[] }
  | { kind: 'proc-event'; event: 'data' | 'exit'; payload: unknown }
  /** A request to the local analyzer API (src-tauri/src/analyzer.rs), answered with analyzer_respond. */
  | { kind: 'analyzer-request'; payload: AnalyzerRequestEvent };

export interface AnalyzerRequestEvent {
  id: number;
  method: string;
  path: string;
  token?: string | null;
  body: string;
}

export type WorkerOutbound =
  | { kind: 'ready' }
  | { kind: 'boot-error'; error: string }
  /** A Rust command the worker wants run; only the main thread can reach Tauri's IPC. */
  | { kind: 'sys'; id: number; cmd: string; args?: Record<string, unknown> }
  | { kind: 'invoke-result'; id: number; ok: boolean; value?: unknown; error?: string }
  /** What Electron's `webContents.send` did: an event for window.backend.on subscribers. */
  | { kind: 'event'; channel: string; args: unknown[] };

/**
 * The Rust commands that carry raw bytes instead of JSON: fs_write_bytes and kv_batch send a raw
 * body (other values go in headers), and fs_read_bytes answers with one.
 */
export const SYS_WRITE_BYTES = 'fs_write_bytes';
/** A batch of store writes, encoded by shims/level.ts encodeBatch (src-tauri/src/sys/kv.rs decode_batch). */
export const SYS_KV_BATCH = 'kv_batch';
export const SYS_READ_BYTES = 'fs_read_bytes';
/** A language asset's decompressed bytes, from the plain file, `.zst` or `.gz` (src-tauri/src/sys/fs.rs). */
export const SYS_READ_ASSET = 'fs_read_asset';
/** zstd frames in, the decompressed bytes out, both raw (src-tauri/src/sys/zstd.rs; shims/zlib.ts). */
export const SYS_ZSTD_DECOMPRESS = 'zstd_decompress';
