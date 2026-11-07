/**
 * The one door from backend code to Rust. In the worker it posts to the main thread (worker.ts);
 * tests install a fake. Every shim goes through `sys`.
 */
export type SysCall = (cmd: string, args?: Record<string, unknown>) => Promise<any>;

let implementation: SysCall = () => Promise.reject(new Error('The backend has no system bridge yet'));

export const setSys = (next: SysCall) => {
  implementation = next;
};

export const sys: SysCall = (cmd, args) => implementation(cmd, args);
