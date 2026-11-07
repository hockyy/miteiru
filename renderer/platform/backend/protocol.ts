/** Messages between the main thread (tauriBridge.ts) and the backend worker (worker.ts). */

export type WorkerInbound =
  | { kind: 'sys-result'; id: number; ok: boolean; value?: unknown; error?: string }
  | { kind: 'invoke'; id: number; channel: string; args: unknown[] }
  | { kind: 'send'; channel: string; args: unknown[] }
  | { kind: 'proc-event'; event: 'data' | 'exit'; payload: unknown };

export type WorkerOutbound =
  | { kind: 'ready' }
  | { kind: 'boot-error'; error: string }
  /** A Rust command the worker wants run; only the main thread can reach Tauri's IPC. */
  | { kind: 'sys'; id: number; cmd: string; args?: Record<string, unknown> }
  | { kind: 'invoke-result'; id: number; ok: boolean; value?: unknown; error?: string }
  /** What Electron's `webContents.send` did: an event for window.backend.on subscribers. */
  | { kind: 'event'; channel: string; args: unknown[] };

/** The Rust commands that carry raw bytes instead of JSON (see desktop-contract.md). */
export const SYS_WRITE_BYTES = 'fs_write_bytes';
export const SYS_READ_BYTES = 'fs_read_bytes';
