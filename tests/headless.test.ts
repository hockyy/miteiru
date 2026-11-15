import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {PassThrough} from "node:stream";
import {after, test} from "node:test";
import {createAppProxy} from "../main/headless/appProxy";
import {decodeBatch, KvStore} from "../main/headless/kvStore";
import {checkoutDataRoots, installedPackRoots, registrationDirs, resolveProfile, runningApps, type RunningApp} from "../main/headless/profile";
import {SettingsStore} from "../main/headless/settingsStore";
import {serveStdio} from "../main/headless/stdioServer";
import {languageDataRoot, setLanguageAssetRoots} from "../main/handler/languages/registry";
import {createLanguageDeps} from "../main/mcp/languageDeps";
import {ToolError, type ToolCall} from "../main/mcp/protocol";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-headless-test-"));
after(() => fs.rmSync(scratch, {recursive: true, force: true}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const rpc = (id: number | string, method: string, params?: object) => JSON.stringify({jsonrpc: "2.0", id, method, ...(params ? {params} : {})});
const toolCall = (id: number | string, name: string, args: object = {}) => rpc(id, "tools/call", {name, arguments: args});

/** Runs the stdio server over a stream, sends `lines`, ends the input at once, and returns what it wrote. */
const runStdio = async (lines: string[], callTool: ToolCall, options: {drainTimeoutMs?: number; between?: (input: PassThrough) => Promise<void>} = {}) => {
  const input = new PassThrough();
  const written: any[] = [];
  const served = serveStdio({input, write: (line) => written.push(JSON.parse(line))}, callTool, "9.9.9", {drainTimeoutMs: options.drainTimeoutMs});
  for (const line of lines) input.write(`${line}\n`);
  await options.between?.(input);
  input.end();
  await served;
  return written;
};

// ---- stdio ----------------------------------------------------------------------------------------

test("stdio: calls written before stdin closes are all answered, quick ones first", async () => {
  const callTool: ToolCall = async (name, args) => {
    await sleep(name === "get_status" ? 80 : 5);
    return {name, args};
  };
  const written = await runStdio([
    rpc(1, "initialize", {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "t", version: "1"}}),
    toolCall(2, "get_status"),
    toolCall(3, "lookup_word", {language: "ja", word: "猫"}),
    rpc(4, "ping"),
    JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"})
  ], callTool);
  assert.deepEqual(written.map((message) => message.id).sort(), [1, 2, 3, 4]);
  // The slow call came last: answers go out as they finish.
  assert.equal(written.at(-1).id, 2);
  assert.equal(written.find((message) => message.id === 1).result.serverInfo.version, "9.9.9");
  assert.deepEqual(written.find((message) => message.id === 3).result.structuredContent.args, {language: "ja", word: "猫", limit: 10});
});

test("stdio: a cancelled call gets no answer; a cancellation for a finished or unknown call changes nothing", async () => {
  const callTool: ToolCall = async (name) => {
    await sleep(name === "get_status" ? 60 : 1);
    return {};
  };
  const written = await runStdio([
    JSON.stringify({jsonrpc: "2.0", method: "notifications/cancelled", params: {requestId: 7}}),
    toolCall(7, "get_status"),
    toolCall("7", "get_status")
  ], callTool, {
    between: async (input) => {
      await sleep(10);
      input.write(`${JSON.stringify({jsonrpc: "2.0", method: "notifications/cancelled", params: {requestId: 7}})}\n`);
    }
  });
  // 7 was cancelled while it ran; "7" is another id and is answered.
  assert.deepEqual(written.map((message) => message.id), ["7"]);
});

test("stdio: a line that is not JSON is a parse error, and an unknown tool a protocol error", async () => {
  const written = await runStdio(["{oops", toolCall(1, "no_such_tool")], async () => ({}));
  assert.deepEqual(written.find((message) => message.id === null).error.code, -32700);
  assert.equal(written.find((message) => message.id === 1).error.code, -32602);
});

test("stdio: after stdin closes, a call that never finishes is given up after the drain time", async () => {
  const started = performance.now();
  const written = await runStdio([toolCall(1, "get_status")], () => new Promise(() => undefined), {drainTimeoutMs: 50});
  assert.deepEqual(written, []);
  assert.ok(performance.now() - started < 2000);
});

// ---- Profile, packs and registrations --------------------------------------------------------------

test("resolveProfile finds the installed app's folders on each system, or the one named", () => {
  const env = (values: Record<string, string> = {}) => values as NodeJS.ProcessEnv;
  const windows = resolveProfile({env: env({APPDATA: "C:\\Users\\a\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local"}), platform: "win32", home: "C:\\Users\\a"});
  assert.equal(windows.userData, path.join("C:\\Users\\a\\AppData\\Roaming", "miteiru"));
  assert.equal(windows.languagePacks, path.join("C:\\Users\\a\\AppData\\Local", "id.hocky.miteiru", "language-packs"));
  const mac = resolveProfile({env: env(), platform: "darwin", home: "/Users/a", development: true});
  assert.equal(mac.userData, path.join("/Users/a", "Library", "Application Support", "miteiru (development)"));
  const linux = resolveProfile({env: env({XDG_CONFIG_HOME: "/cfg", XDG_DATA_HOME: "/data"}), platform: "linux", home: "/home/a"});
  assert.equal(linux.userData, path.join("/cfg", "miteiru"));
  assert.equal(linux.languagePacks, path.join("/data", "id.hocky.miteiru", "language-packs"));
  const named = resolveProfile({profile: scratch, env: env({MITEIRU_USER_DATA_DIR: "/elsewhere"})});
  assert.deepEqual(named, {userData: path.resolve(scratch), languagePacks: path.join(path.resolve(scratch), "language-packs"), explicit: true});
  assert.deepEqual(registrationDirs(named), [path.resolve(scratch)]);
  assert.equal(registrationDirs(windows, {env: env({APPDATA: "C:\\R"}), platform: "win32"}).length, 2);
});

test("installedPackRoots takes the newest finished install of each pack", () => {
  const root = path.join(scratch, "language-packs");
  const install = (name: string, id: string, installedAt: number, plugins: string[], finished = true) => {
    const dir = path.join(root, name);
    for (const plugin of plugins) fs.mkdirSync(path.join(dir, "language-assets", plugin), {recursive: true});
    if (finished) fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({id, installedAt}));
  };
  install("japanese-aaa-1", "japanese", 100, ["japanese"]);
  install("japanese-bbb-2", "japanese", 200, ["japanese", "han-character-core"]);
  install("mandarin-ccc-1", "mandarin", 50, ["mandarin"]);
  install("cantonese-ddd-1", "cantonese", 300, ["cantonese"], false);
  install(".partial-vietnamese", "vietnamese", 400, ["vietnamese"]);
  const roots = installedPackRoots(root).sort((a, b) => a.dir.localeCompare(b.dir));
  assert.deepEqual(roots.map((pack) => [path.basename(path.dirname(pack.dir)), pack.plugins.sort()]), [
    ["japanese-bbb-2", ["han-character-core", "japanese"]],
    ["mandarin-ccc-1", ["mandarin"]]
  ]);
  assert.deepEqual(installedPackRoots(path.join(scratch, "missing")), []);
});

test("checkoutDataRoots offers the staged checkout data as one root with its plugin folders", () => {
  const staged = path.join(scratch, "staged", "language-assets");
  assert.deepEqual(checkoutDataRoots(staged), [], "never staged");
  fs.mkdirSync(path.join(staged, "mandarin", "chinese"), {recursive: true});
  fs.mkdirSync(path.join(staged, "japanese"), {recursive: true});
  fs.writeFileSync(path.join(staged, "stray.txt"), "");
  const [root] = checkoutDataRoots(staged);
  assert.equal(root.dir, staged);
  assert.deepEqual(root.plugins.sort(), ["japanese", "mandarin"]);
});

// Bug fix: with no Mandarin data anywhere, analyze_text answered a raw "ENOENT … dist\headless\chinese\
// zh.jieba.txt": the engine's setup threw, and the tools never got to say the language isn't installed.
test("a language with no data anywhere answers 409 saying how to get it, not a file error", async () => {
  const empty = path.join(scratch, "no-language-data");
  fs.mkdirSync(empty, {recursive: true});
  setLanguageAssetRoots(async () => [{dir: empty}]);
  try {
    const deps = createLanguageDeps({appDataDirectory: empty, learnerLanguage: async () => null, notInstalledHint: "Or run --build."});
    await assert.rejects(deps.ensureLanguage("zh-Hans"), (error: unknown) => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.status, 409);
      assert.match(error.message, /^Mandarin Chinese \(simplified\) isn't installed on this computer\. .* Or run --build\.$/);
      assert.doesNotMatch(error.message, /ENOENT/);
      return true;
    });
    assert.equal(await languageDataRoot("mandarin-jieba"), null);
  } finally {
    setLanguageAssetRoots(async () => []);
  }
});

test("runningApps reads registrations newest first and skips closed apps and other hosts", () => {
  const dirs = ["release", "development", "remote"].map((name) => {
    const dir = path.join(scratch, "registrations", name);
    fs.mkdirSync(dir, {recursive: true});
    return dir;
  });
  const register = (dir: string, registration: object) => fs.writeFileSync(path.join(dir, "analyzer-server.json"), JSON.stringify(registration));
  register(dirs[0], {host: "127.0.0.1", port: 5000, token: "a", pid: 111, startedAt: 1});
  register(dirs[1], {host: "127.0.0.1", port: 5001, token: "b", pid: 222, startedAt: 2});
  register(dirs[2], {host: "example.com", port: 5002, token: "c", pid: 333, startedAt: 3});
  const alive = (pid: number) => pid !== 222;
  assert.deepEqual(runningApps(dirs, alive).map((app) => app.port), [5000]);
  assert.deepEqual(runningApps(dirs, () => true).map((app) => app.port), [5001, 5000]);
});

// ---- The key-value store ------------------------------------------------------------------------------

const sqlite = () => {
  const {DatabaseSync} = process.getBuiltinModule("node:sqlite") as {DatabaseSync: new (file: string) => any};
  return (file: string) => new DatabaseSync(file);
};

test("KvStore shares the app's SQLite layout: get, put, ranges in key order and all-or-nothing batches", () => {
  const store = new KvStore(sqlite());
  const location = path.join(scratch, "learningStateDB");
  const handle = store.open(location);
  assert.equal(store.open(location), handle, "one database per location");
  store.put(handle, "ja/猫", JSON.stringify({level: 2, updTime: 1}));
  store.batch(handle, [{put: true, key: "ja/犬", value: "1"}, {put: true, key: "zh-CN/猫", value: "2"}, {put: false, key: "ja/犬"}]);
  assert.equal(store.get(handle, "ja/犬"), null);
  assert.deepEqual(store.getMany(handle, ["ja/猫", "nope"]), [JSON.stringify({level: 2, updTime: 1}), null]);
  assert.deepEqual(store.range(handle, {gte: "ja/", lte: "ja/\u{10FFFF}"}).map(([key]) => key), ["ja/猫"]);
  assert.throws(() => store.batch(handle, [{put: true, key: "ja/鳥", value: "1"}, {put: true, key: null as never, value: "x"}]), /kv:/);
  assert.equal(store.get(handle, "ja/鳥"), null, "a failed batch writes nothing");
  store.close(handle);
  store.close(handle);
  assert.throws(() => store.get(handle, "ja/猫"), /not open/);
  assert.ok(fs.existsSync(`${location}.sqlite3`));
  // Another process (here, another store) sees the same rows.
  const other = new KvStore(sqlite());
  const again = other.open(location);
  assert.equal(other.get(again, "zh-CN/猫"), "2");
  other.closeAll();
});

test("KvStore leaves a 7.x LevelDB folder to the app, and decodeBatch reads kv.rs's format", () => {
  const legacy = path.join(scratch, "legacyDB");
  fs.mkdirSync(legacy, {recursive: true});
  fs.writeFileSync(path.join(legacy, "CURRENT"), "MANIFEST-000001\n");
  assert.throws(() => new KvStore(sqlite()).open(legacy), /Open Miteiru once/);

  const encode = (ops: Array<[number, string, string?]>) => {
    const parts: number[] = [];
    const u32 = (value: number) => parts.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
    const text = (value: string) => {
      const bytes = Buffer.from(value, "utf8");
      u32(bytes.length);
      parts.push(...bytes);
    };
    u32(ops.length);
    for (const [kind, key, value] of ops) {
      parts.push(kind);
      text(key);
      if (kind === 0) text(value ?? "");
    }
    return Uint8Array.from(parts);
  };
  assert.deepEqual(decodeBatch(encode([[0, "ja/猫", "2"], [1, "ja/犬"]])), [{put: true, key: "ja/猫", value: "2"}, {put: false, key: "ja/犬"}]);
  assert.throws(() => decodeBatch(encode([[2, "x"]])), /malformed/);
  assert.throws(() => decodeBatch(encode([[0, "x", "y"]]).slice(0, -1)), /malformed/);
});

// ---- Settings -------------------------------------------------------------------------------------

test("SettingsStore reads the app's config.json, follows changes, and never writes", () => {
  const file = path.join(scratch, "config.json");
  fs.writeFileSync(file, JSON.stringify({toneType: "symbol", app: {lastLanguageMode: 2}}));
  let clock = 0;
  const settings = new SettingsStore(file, () => clock);
  assert.equal(settings.get("toneType", "num"), "symbol");
  assert.equal(settings.get("app.lastLanguageMode"), 2);
  assert.equal(settings.get("missing.key", "fallback"), "fallback");
  fs.writeFileSync(file, JSON.stringify({toneType: "num", extra: true}));
  // The file is looked at again at most every half second.
  clock += 100;
  assert.equal(settings.get("toneType"), "symbol");
  clock += 1000;
  assert.equal(settings.get("toneType"), "num");
  assert.throws(() => settings.set("toneType"), /does not change Miteiru's settings/);
  fs.rmSync(file);
  clock += 1000;
  assert.equal(settings.get("toneType", "num"), "num");
});

// ---- The proxy to a running app ------------------------------------------------------------------

const app = (port: number): RunningApp => ({host: "127.0.0.1", port, token: `t${port}`, pid: 1, startedAt: port});

test("the app proxy hands a call to the newest app that answers, and says when none took it", async () => {
  const calls: string[] = [];
  const reply = (status: number, body: unknown) => ({status, text: async () => JSON.stringify(body)});
  const fetcher = async (url: string, init: {headers: Record<string, string>; body: string}) => {
    calls.push(`${url} ${init.headers["X-Miteiru-Analyzer-Token"]}`);
    const port = Number(new URL(url).port);
    const id = JSON.parse(init.body).id;
    if (port === 1) throw new Error("ECONNREFUSED");
    if (port === 2) return reply(401, {ok: false, error: "Wrong token"});
    if (port === 3) return reply(200, {jsonrpc: "2.0", id, error: {code: -32602, message: "Unknown tool"}});
    if (port === 4) return reply(200, {jsonrpc: "2.0", id, result: {isError: true, content: [{type: "text", text: "Japanese isn't installed."}]}});
    return reply(200, {jsonrpc: "2.0", id, result: {content: [{type: "text", text: "{}"}], structuredContent: {updated: 1}}});
  };
  const proxyFor = (ports: number[]) => createAppProxy([], {fetcher: fetcher as never, apps: () => ports.map(app)});
  assert.deepEqual(await proxyFor([1, 2, 5]).call("set_word_levels", {}), {answered: true, result: {updated: 1}});
  assert.deepEqual(calls, ["http://127.0.0.1:1/mcp t1", "http://127.0.0.1:2/mcp t2", "http://127.0.0.1:5/mcp t5"]);
  assert.deepEqual(await proxyFor([3]).call("set_word_levels", {}), {answered: false, reason: "unknown-tool"});
  assert.deepEqual(await proxyFor([4]).call("set_word_levels", {}), {answered: true, error: "Japanese isn't installed."});
  assert.deepEqual(await proxyFor([1]).call("open_video", {}), {answered: false, reason: "not-open"});
  assert.deepEqual(await proxyFor([]).call("open_video", {}), {answered: false, reason: "not-open"});
});
