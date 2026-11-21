import assert from "node:assert/strict";
import {test} from "node:test";
import {jyutpingBatch} from "../main/language/jyutping";
import cases from "./fixtures/in-house/to-jyutping.json";

test("the Rust addon matches to-jyutping 3.1.1 on complete subtitle lines and Unicode edge cases", async () => {
  const actual = await jyutpingBatch(cases.map(row => row.text));
  for (const [i, {text, expected}] of cases.entries()) assert.deepEqual(actual[i], expected, text);
});
