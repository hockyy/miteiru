import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {after, test} from "node:test";

/**
 * The headless server from a plain checkout: `node scripts/miteiru-mcp.mjs --build`, then the server with
 * a profile that has no language packs at all, so every language must come from this checkout's own data
 * (renderer/public/language-assets, which npm run script:initrepo downloads, staged by --build into
 * dist/headless/language-assets). Mandarin used to fail here with ENOENT on dist/headless/chinese/zh.jieba.txt:
 * the server only read installed packs, and fell back to a path beside the bundle.
 *
 * Skipped when this checkout has no downloaded language data. The first run stages it (about 90 s).
 */
const root = path.resolve(__dirname, "..");
const launcher = path.join(root, "scripts", "miteiru-mcp.mjs");
const data = path.join(root, "renderer", "public", "language-assets");
const has = (...relative: string[]) => relative.some((file) => fs.existsSync(path.join(data, file)));
const downloaded = has("japanese/dict/base.dat", "japanese/dict/base.dat.gz")
  && has("mandarin/chinese/zh.jieba.txt", "mandarin/chinese/zh.jieba.txt.gz")
  && has("cantonese/cantonese/yue.jieba.txt", "cantonese/cantonese/yue.jieba.txt.gz");
const skip = downloaded ? false : "this checkout has no downloaded language data (npm run script:initrepo)";

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "miteiru-checkout-test-"));
after(() => fs.rmSync(profile, {recursive: true, force: true}));

const LINES = [
  {language: "ja", text: "猫が好きです。"},
  {language: "zh-Hans", text: "我喝茶。"},
  {language: "zh-Hant", text: "我們喝茶。"},
  {language: "yue", text: "佢哋今日去咗飲茶"},
  {language: "zh-Hans", text: "我喝冰咖啡"},
  {language: "yue", text: "佢飲奶茶"}
] as const;

/** --check's report: what --build would do. */
const check = () => {
  const run = spawnSync(process.execPath, [launcher, "--check"], {cwd: root, encoding: "utf8"});
  return JSON.parse(run.stderr.slice(run.stderr.indexOf("{")));
};

test("the headless server answers ja, zh-Hans, zh-Hant and yue from a plain checkout with no language packs", {skip, timeout: 15 * 60_000}, async () => {
  const state = check();
  if (state.addonStale || state.bundleStale || state.checkoutData.stale) {
    const build = spawnSync(process.execPath, [launcher, "--build"], {cwd: root, encoding: "utf8", timeout: 14 * 60_000});
    assert.equal(build.status, 0, `--build failed: ${build.stderr}`);
    assert.equal(build.stdout, "", "--build writes nothing to stdout");
  }
  assert.equal(check().checkoutData.stale, false);

  const child = spawn(process.execPath, [launcher, "--profile", profile, "--no-proxy", "--preload", "none"], {cwd: root, stdio: ["pipe", "pipe", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  let buffered = "";
  const answers = new Map<number, any>();
  child.stdout.on("data", (chunk) => {
    buffered += chunk;
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      answers.set(message.id, message);
    }
  });
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  const send = (id: number, method: string, params: object) => child.stdin.write(`${JSON.stringify({jsonrpc: "2.0", id, method, params})}\n`);
  send(0, "initialize", {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "checkout-test", version: "1"}});
  LINES.forEach(({language, text}, index) => send(index + 1, "tools/call", {name: "analyze_text", arguments: {language, detail: "full", text}}));
  send(9, "tools/call", {name: "get_status", arguments: {}});
  child.stdin.end();
  assert.equal(await exited, 0, stderr);
  assert.doesNotMatch(stderr, /ENOENT|dist[\\/]headless[\\/]chinese/);

  const result = (id: number) => {
    const reply = answers.get(id);
    assert.ok(reply?.result && !reply.result.isError, `call ${id}: ${JSON.stringify(reply)}`);
    return reply.result.structuredContent;
  };
  const token = (answer: any, s: string) => answer.tokens.find((candidate: any) => candidate.s === s);
  for (const [index, {text}] of LINES.entries()) {
    assert.equal(result(index + 1).tokens.map((item: any) => item.s).join(""), text);
  }
  const ja = result(1);
  assert.equal(token(ja, "猫").reading.kana, "ねこ");
  assert.match(token(ja, "猫").gloss.en.join("; "), /\bcat\b/);
  assert.equal(token(result(2), "喝茶").reading.pinyin_num, "he1 cha2");
  assert.equal(token(result(3), "我們").reading.pinyin_num, "wo3 men5");
  assert.equal(token(result(4), "飲茶").reading.jyutping, "jam2 caa4");
  assert.match(token(result(4), "飲茶").gloss.en.join("; "), /tea/);
  const parts = (answer: any) => answer.tokens.map(({s, pos, tag}: any) => [s, pos, tag]);
  assert.deepEqual(parts(result(5)), [["我", "pronoun", "r"], ["喝", "verb", "vg"], ["冰", "noun", "n"], ["咖啡", "noun", "n"]]);
  assert.deepEqual(parts(result(6)), [["佢", "pronoun", "r"], ["飲", "verb", "v"], ["奶茶", "noun", "n"]]);
  // Nothing came from an installed pack: this profile has none. (Calls run at once, so get_status may
  // answer before a language finished loading: only where the data is from is compared.)
  const languages = result(9).languages;
  for (const {language} of LINES) {
    assert.equal(languages[language].installed, true, language);
    assert.equal(languages[language].data, "checkout", language);
  }
});
