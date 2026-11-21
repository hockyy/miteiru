import assert from "node:assert/strict";
import {test} from "node:test";
import {jyutpingBatch} from "../main/language/jyutping";
import cases from "./fixtures/in-house/to-jyutping.json";

test("the Rust addon matches to-jyutping 3.1.1 on complete subtitle lines and Unicode edge cases", async () => {
  const actual = await jyutpingBatch(cases.map(row => row.text));
  for (const [i, {text, expected}] of cases.entries()) assert.deepEqual(actual[i], expected, text);
});

test("native batches keep Jieba boundaries and the original UTF-16 spelling", async () => {
  const texts = ["要求", "要", "求", "", "\ud800", "\udc00", "𠵱\n瓩"];
  assert.deepEqual(await jyutpingBatch(texts), [
    [["要", "jiu1"], ["求", "kau4"]], [["要", "jiu3"]], [["求", "kau4"]], [],
    [["\ud800", null]], [["\udc00", null]], [["𠵱", "ji1"], ["\n", null], ["瓩", "cin1 ngaa5"]],
  ]);
});
