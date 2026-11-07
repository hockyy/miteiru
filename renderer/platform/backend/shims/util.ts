const custom = Symbol.for('nodejs.util.promisify.custom');

type Callback<T> = (error: Error | null, value?: T) => void;

export function promisify<T = unknown>(fn: (...args: any[]) => unknown): (...args: any[]) => Promise<T> {
  const customized = (fn as unknown as Record<symbol, unknown>)[custom];
  if (typeof customized === 'function') return customized as (...args: any[]) => Promise<T>;
  return (...args: any[]) => new Promise<T>((resolve, reject) => {
    const callback: Callback<T> = (error, value) => (error ? reject(error) : resolve(value as T));
    fn(...args, callback);
  });
}
promisify.custom = custom;

export const inspect = (value: unknown) => {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const types = {
  isPromise: (value: unknown) => value instanceof Promise,
  isRegExp: (value: unknown) => value instanceof RegExp,
  isDate: (value: unknown) => value instanceof Date
};

export const inherits = (ctor: { prototype: object }, superCtor: { prototype: object }) => {
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
};

export default {promisify, inspect, types, inherits, TextDecoder, TextEncoder};
