import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";

/**
 * Golden answers for three lines, from the real headless server: scripts/miteiru-mcp.mjs over stdio,
 * the app's Rust tokenizers through the Node addon, and installed language packs (Japanese, Mandarin
 * and Hanzi, Cantonese). It needs a profile with those packs, so it runs only when
 * MITEIRU_GOLDEN_PROFILE names one (a scratch profile, never the learner's own):
 *
 *   MITEIRU_GOLDEN_PROFILE=<profile> npx tsx --test tests/mcpGolden.test.ts
 *   MITEIRU_GOLDEN_UPDATE=1 ... rewrites tests/fixtures/mcp-golden/ after a dictionary update.
 *
 * `saved` is left out of the comparison: it is the profile's own saved words.
 */
const root = path.resolve(__dirname, "..");
const fixtures = path.join(root, "tests", "fixtures", "mcp-golden");
const profile = process.env.MITEIRU_GOLDEN_PROFILE ?? "";
const update = process.env.MITEIRU_GOLDEN_UPDATE === "1";

export const GOLDEN_LINES = [
  {file: "ja.json", language: "ja", text: "今日ねなんか税理士さんとね、お話ししたんですね"},
  {file: "zh-Hans.json", language: "zh-Hans", text: "没想到，龙王回到龙宫后，收到玉皇大帝的命令"},
  {file: "yue.json", language: "yue", text: "佢哋今日去咗飲茶"}
] as const;

const skip = !profile
  ? "set MITEIRU_GOLDEN_PROFILE to a profile with the Japanese, Mandarin and Cantonese packs"
  : !fs.existsSync(path.join(profile, "language-packs")) ? `${profile} has no language-packs folder` : false;

/** Sends each request to a fresh headless server and returns the answers by id. */
const askHeadless = async (requests: object[]): Promise<Map<number, any>> => {
  const child = spawn(process.execPath, [path.join(root, "scripts", "miteiru-mcp.mjs"), "--profile", profile, "--no-proxy", "--preload", "none"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"]
  });
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
  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  // Closing stdin at once: every answer still arrives before the server exits.
  child.stdin.end();
  const code = await exited;
  assert.equal(code, 0, `the server exited with ${code}: ${stderr}`);
  return answers;
};

const withoutSaved = (answer: any) => ({
  ...answer,
  tokens: answer.tokens.map((token: any) => Object.fromEntries(Object.entries(token).filter(([key]) => key !== "saved")))
});

test("golden: analyze_text detail full for the three lines", {skip}, async () => {
  const requests = [
    {jsonrpc: "2.0", id: 0, method: "initialize", params: {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "golden", version: "1"}}},
    ...GOLDEN_LINES.map(({language, text}, index) => ({
      jsonrpc: "2.0", id: index + 1, method: "tools/call", params: {name: "analyze_text", arguments: {language, detail: "full", text}}
    }))
  ];
  const answers = await askHeadless(requests);
  for (const [index, line] of GOLDEN_LINES.entries()) {
    const reply = answers.get(index + 1);
    assert.ok(reply?.result && !reply.result.isError, `${line.language}: ${JSON.stringify(reply)}`);
    const answer = withoutSaved(reply.result.structuredContent);
    assert.equal(answer.tokens.map((token: any) => token.s).join(""), line.text);
    const file = path.join(fixtures, line.file);
    if (update || !fs.existsSync(file)) {
      fs.mkdirSync(fixtures, {recursive: true});
      fs.writeFileSync(file, `${JSON.stringify(answer, null, 2)}\n`);
      continue;
    }
    assert.deepEqual(answer, JSON.parse(fs.readFileSync(file, "utf8")), `${line.language} differs from ${line.file} (MITEIRU_GOLDEN_UPDATE=1 rewrites it)`);
  }
});

test("golden fixtures: the lines' facts the task asked for", () => {
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8"));
  const token = (answer: any, s: string) => answer.tokens.find((candidate: any) => candidate.s === s);
  const ja = read("ja.json");
  assert.equal(token(ja, "さん").pos, "suffix");
  assert.match(token(ja, "さん").gloss.en.join("; "), /Mr\.|-san/);
  assert.equal(token(ja, "と").gloss.en[0], "with");
  assert.equal(token(ja, "お話しした").base, "話す");
  assert.equal(token(ja, "お話しした").pos, "verb");
  const zh = read("zh-Hans.json");
  assert.match(token(zh, "没想到").gloss.en.join("; "), /didn't expect/);
  assert.match(token(zh, "玉皇大帝").gloss.en.join("; "), /Jade Emperor/);
  assert.ok(token(zh, "龙王").gloss.en.length > 0);
  assert.equal(token(zh, "没想到").reading.pinyin_num, "mei2 xiang3 dao4");
  const yue = read("yue.json");
  assert.match(token(yue, "咗").gloss.en.join("; "), /perfective/);
  assert.match(token(yue, "飲茶").gloss.en.join("; "), /tea/);
  assert.equal(token(yue, "飲茶").reading.jyutping, "jam2 caa4");
  for (const answer of [ja, zh, yue]) assert.equal(answer.tokens.map((item: any) => item.s).join(""), answer.text);
});
