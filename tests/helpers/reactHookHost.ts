import {createRequire} from "node:module";
import path from "node:path";
import {buildSync} from "esbuild";
import React from "react";

// This exercises hook state/effect lifetimes without React internals or a browser.
// Call render after an async update; child components are returned as elements, not mounted.
const requireFromTest = createRequire(__filename);
const sameDeps = (a?: unknown[], b?: unknown[]) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));

export class HookHost {
  private slots: any[] = [];
  private next = 0;
  private effects: (() => void)[] = [];
  private dirty = false;
  readonly react = {
    ...React,
    useState: (initial: any) => {
      const index = this.next++;
      if (!(index in this.slots)) {
        const slot: {value: any; set?: (next: any) => void} = this.slots[index] = {value: typeof initial === "function" ? initial() : initial};
        slot.set = (next: any) => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) {
            slot.value = value;
            this.dirty = true;
          }
        };
      }
      return [this.slots[index].value, this.slots[index].set];
    },
    useRef: (initial: any) => {
      const index = this.next++;
      return this.slots[index] ??= {current: initial};
    },
    useMemo: (create: () => any, deps?: unknown[]) => {
      const index = this.next++;
      if (!sameDeps(this.slots[index]?.deps, deps)) this.slots[index] = {deps, value: create()};
      return this.slots[index].value;
    },
    useCallback: (callback: (...args: any[]) => any, deps?: unknown[]) => this.react.useMemo(() => callback, deps),
    useEffect: (create: () => void | (() => void), deps?: unknown[]) => {
      const index = this.next++;
      if (sameDeps(this.slots[index]?.deps, deps)) return;
      const old = this.slots[index];
      const slot = this.slots[index] = {deps, cleanup: undefined};
      this.effects.push(() => {
        old?.cleanup?.();
        slot.cleanup = create();
      });
    }
  };

  render<T>(read: () => T): T {
    let result: T;
    for (let renders = 0; renders < 30; renders++) {
      this.dirty = false;
      this.next = 0;
      result = read();
      this.effects.splice(0).forEach((effect) => effect());
      if (!this.dirty) return result;
    }
    throw new Error("Hook did not settle after 30 renders");
  }

  dispose() {
    this.slots.forEach((slot) => slot?.cleanup?.());
  }
}

const compiled = new Map<string, string>();
export const loadHooks = <T = any>(file: string, host: HookHost): T => {
  if (!compiled.has(file)) {
    compiled.set(file, buildSync({
      entryPoints: [path.resolve(file)], bundle: true, write: false,
      platform: "node", format: "cjs", packages: "external", jsx: "automatic"
    }).outputFiles[0].text);
  }
  const module = {exports: {}};
  const requireMock = (name: string) => {
    if (name === "react") return host.react;
    if (name === "lucide-react") return new Proxy({}, {get: () => () => null});
    if (name.startsWith("@tauri-apps/")) return {};
    return requireFromTest(name);
  };
  new Function("require", "module", "exports", compiled.get(file))(requireMock, module, module.exports);
  return module.exports as T;
};

export const deferred = <T = any>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

export const flushPromises = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
