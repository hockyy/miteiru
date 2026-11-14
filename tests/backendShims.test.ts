import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {test} from "node:test";
import {
  PLATFORM_API_INVOKE_CHANNELS,
  LANGUAGE_LOAD_CHANNELS,
  LIVE_CAPTIONS_EVENT_CHANNELS,
  LIVE_CAPTIONS_INVOKE_CHANNELS,
  STORE_CHANNELS
} from "../renderer/platform/platformApiChannels";
import {createHash} from "../renderer/platform/backend/shims/crypto";
import * as shimFs from "../renderer/platform/backend/shims/fsImpl";
import {ChildProcess, dispatchProcEvent, spawn} from "../renderer/platform/backend/shims/childProcess";
import {setSys} from "../renderer/platform/backend/sys";
import {fromBase64, toBase64} from "../renderer/platform/backend/shims/bytes";
import {appRoot, initRuntime, runtime} from "../renderer/platform/backend/shims/runtime";

test("every channel in the bridge's table has a handler or event in main/", () => {
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) sources.push(fs.readFileSync(full, "utf8"));
    }
  };
  walk("main");
  const text = sources.join("\n");
  const channels = [
    ...Object.values(PLATFORM_API_INVOKE_CHANNELS),
    ...Object.values(LIVE_CAPTIONS_INVOKE_CHANNELS),
    ...Object.values(LIVE_CAPTIONS_EVENT_CHANNELS),
    ...Object.values(STORE_CHANNELS)
  ];
  assert.deepEqual(channels.filter((channel) => !text.includes(`"${channel}"`) && !text.includes(`'${channel}'`)), []);
});

test("the bridge's language channels are the registry's", async () => {
  const {startupChannelPluginIds} = await import("../main/handler/languages/registry");
  assert.deepEqual([...LANGUAGE_LOAD_CHANNELS].sort(), Object.keys(startupChannelPluginIds).sort());
});

test("sync sha1 and sha256 digests match node:crypto", () => {
  const inputs = ["", "abc", "日本語のテキスト", "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000)];
  for (const input of inputs) {
    for (const algorithm of ["sha1", "sha256"]) {
      assert.equal(
        createHash(algorithm).update(input).digest("hex"),
        crypto.createHash(algorithm).update(input).digest("hex"),
        `${algorithm}(${input.slice(0, 8)}...)`
      );
    }
  }
  assert.equal(createHash("sha256").update("a").update("bc").digest("hex"), crypto.createHash("sha256").update("abc").digest("hex"));
});

test("base64 helpers round-trip bytes", () => {
  const bytes = new Uint8Array(70000).map((_, index) => index % 256);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test("fs errors carry the Node code parsed from Rust's CODE: message", async () => {
  setSys(async (cmd, args) => {
    if (cmd === "fs_read_text") throw `EACCES: permission denied, open '${args.path}'`;
    if (cmd === "fs_stat") return null;
    throw new Error(`unexpected ${cmd}`);
  });
  await assert.rejects(shimFs.readFile("C:/x", "utf8"), (error: NodeJS.ErrnoException) => error.code === "EACCES" && /permission denied/.test(error.message));
  await assert.rejects(shimFs.stat("C:/missing"), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  await assert.rejects(shimFs.access("C:/missing"), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
});

test("fs.stat maps fs_stat to a Stats object", async () => {
  setSys(async () => ({isFile: false, isDirectory: true, isSymbolicLink: false, size: 0, mtimeMs: 1700000000000, birthtimeMs: 1600000000000}));
  const stats = await shimFs.stat("C:/dir");
  assert.equal(stats.isDirectory(), true);
  assert.equal(stats.isFile(), false);
  assert.equal(stats.mtimeMs, 1700000000000);
  assert.equal(stats.mtime.getTime(), 1700000000000);
});

test("writing text goes through fs_write_text and bytes through fs_write_bytes (with append)", async () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  setSys(async (cmd, args) => {
    calls.push({cmd, args});
    return null;
  });
  await shimFs.writeFile("C:/a.txt", "hello", "utf8");
  await shimFs.appendFile("C:/a.txt", "more");
  await shimFs.writeFile("C:/b.bin", Buffer.from([1, 2, 3]));
  assert.deepEqual(calls[0], {cmd: "fs_write_text", args: {path: "C:/a.txt", text: "hello", append: false}});
  assert.equal(calls[1].args.append, true);
  assert.equal(calls[2].cmd, "fs_write_bytes");
  assert.deepEqual(new Uint8Array(calls[2].args.data as ArrayBuffer), new Uint8Array([1, 2, 3]));
});

test("a text write's mode reaches Rust, which applies it to an existing file too", async () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  setSys(async (cmd, args) => {
    calls.push({cmd, args});
    return null;
  });
  await shimFs.writeFile("C:/secret.json", "{}", {encoding: "utf8", mode: 0o600});
  assert.deepEqual(calls[0], {cmd: "fs_write_text", args: {path: "C:/secret.json", text: "{}", append: false, mode: 0o600}});
});

test("spawn delivers output that arrives before the spawn reply, then exit and close", async () => {
  setSys(async (cmd) => {
    if (cmd === "proc_spawn") {
      // The event overtakes the reply, as it can in the real app.
      dispatchProcEvent("data", {id: 41, stream: "stdout", data: toBase64(new TextEncoder().encode("hi "))});
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 41;
    }
    return null;
  });
  const child = spawn("tool", ["--version"]);
  const events: string[] = [];
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.on("exit", (code: number) => events.push(`exit:${code}`));
  child.on("close", (code: number) => events.push(`close:${code}`));
  await child.whenStarted();
  dispatchProcEvent("data", {id: 41, stream: "stdout", data: toBase64(new TextEncoder().encode("there"))});
  dispatchProcEvent("exit", {id: 41, code: 0, signal: null});
  assert.equal(output, "hi there");
  assert.deepEqual(events, ["exit:0", "close:0"]);
  assert.ok(child instanceof ChildProcess);
});

test("a failed spawn emits error (with code ENOENT) then close", async () => {
  setSys(async () => { throw "ENOENT: spawn nope"; });
  const child = spawn("nope");
  const events: string[] = [];
  child.on("error", (error: NodeJS.ErrnoException) => events.push(`error:${error.code}`));
  child.on("close", (code: number) => events.push(`close:${code}`));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, ["error:ENOENT", "close:-2"]);
});

test("appRoot is the repo root in a dev run on any platform and the resources when packaged", () => {
  const saved = {...runtime};
  try {
    initRuntime({...saved, isPackaged: false, resources: "R", exePath: "C:\\repo\\src-tauri\\target\\debug\\miteiru.exe"});
    assert.equal(appRoot(), "C:/repo");
    initRuntime({...saved, isPackaged: false, resources: "R", exePath: "/home/me/repo/src-tauri/target/debug/miteiru"});
    assert.equal(appRoot(), "/home/me/repo");
    initRuntime({...saved, isPackaged: true, resources: "R", exePath: "/Applications/Miteiru.app/Contents/MacOS/miteiru"});
    assert.equal(appRoot(), "R");
  } finally {
    initRuntime(saved);
  }
});
