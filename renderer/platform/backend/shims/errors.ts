export type NodeError = Error & { code?: string; errno?: number; syscall?: string; path?: string; notFound?: boolean };

const CODE_PREFIX = /^([A-Z][A-Z0-9_]*): /;

/**
 * Rust errors arrive as "CODE: message" strings ("ENOENT: no such file or directory, open 'x'").
 * This makes the Error Node code expects, with `code` set so `error.code === 'ENOENT'` checks work.
 */
export const nodeError = (raw: unknown): NodeError => {
  if (raw instanceof Error) return raw as NodeError;
  const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const error: NodeError = new Error(message);
  const match = CODE_PREFIX.exec(message);
  if (match) error.code = match[1];
  return error;
};
