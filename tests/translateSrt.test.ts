import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "node:test";
import {TRANSLATE_BATCH_SIZE} from "../renderer/utils/generateSubtitlesConfig";
import {batchTranslations, translateSrtToEnglish} from "../main/helpers/translateSrt";

test("batchTranslations maps a batch's lines 1..N to absolute cue numbers", () => {
  const got = new Map([[1, "a"], [2, "b"], [3, "c"]]);
  const {translations, missing} = batchTranslations(got, 3, 10);
  assert.deepEqual([...translations], [[11, "a"], [12, "b"], [13, "c"]]);
  assert.deepEqual(missing, []);
});

test("batchTranslations ignores numbers outside the batch", () => {
  const got = new Map([[0, "zero"], [-1, "neg"], [1, "a"], [2, "b"], [3, "past the end"], [12, "absolute number"], [40, "other batch"]]);
  const {translations, missing} = batchTranslations(got, 2, 10);
  assert.deepEqual([...translations], [[11, "a"], [12, "b"]]);
  assert.deepEqual(missing, []);
});

test("batchTranslations reports missing lines by absolute cue number", () => {
  const {translations, missing} = batchTranslations(new Map([[1, "a"], [3, "c"]]), 4, 20);
  assert.deepEqual([...translations.keys()], [21, 23]);
  assert.deepEqual(missing, [22, 24]);
});

test("every cue of a two-batch subtitle gets its own translation", async () => {
  const total = TRANSLATE_BATCH_SIZE + 3;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-translate-"));
  const realFetch = globalThis.fetch;
  try {
    const srt = Array.from({length: total}, (_, n) =>
      `${n + 1}\n00:00:${String(n).padStart(2, "0")},000 --> 00:00:${String(n).padStart(2, "0")},500\nsource ${n + 1}\n`
    ).join("\n");
    const sourceSrtPath = path.join(dir, "video.srt");
    await fs.writeFile(sourceSrtPath, srt, "utf8");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      assert.ok(url.startsWith("https://openrouter.ai/"));
      const body = JSON.parse(String(init?.body));
      const user: string = body.messages.find((m: {role: string}) => m.role === "user").content;
      // Answer with the numbers this request used, and the source line as the "translation".
      const rows = user.split("\n").map((line) => {
        const [, i, text] = /^(\d+)\. (.*)$/.exec(line)!;
        return {i: Number(i), en: `en ${text}`};
      });
      return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(rows)}}]}), {
        status: 200,
        headers: {"Content-Type": "application/json"}
      });
    }) as typeof fetch;

    const {englishSrtPath} = await translateSrtToEnglish({
      sourceSrtPath,
      lang: "ja",
      translateModel: "test/model",
      apiKey: "sk-test",
      signal: new AbortController().signal,
      onProgress: () => {}
    });
    const written = await fs.readFile(englishSrtPath, "utf8");
    for (let n = 1; n <= total; n++) {
      assert.match(written, new RegExp(`en source ${n}\n`), `cue ${n}`);
    }
    assert.equal((written.match(/en source/g) ?? []).length, total);
  } finally {
    globalThis.fetch = realFetch;
    await fs.rm(dir, {recursive: true, force: true});
  }
});
