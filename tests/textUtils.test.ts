import assert from "node:assert/strict";
import { test } from "node:test";
import { splitIntoLines } from "../renderer/utils/textUtils";

test("splitIntoLines splits on newlines and tabs", () => {
  assert.deepEqual(splitIntoLines("a\nb\tc\n"), ["a", "b", "c"]);
  assert.deepEqual(splitIntoLines("  hello  \n\n"), ["hello"]);
});
