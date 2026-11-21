import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import * as wanakana from "../main/language/wanakana";
import {wanakanaOutputs} from "../scripts/data/buildWanakanaFixture";

test("the in-house kana converters and script checks match wanakana 5.3.1", () => {
  const file = path.join(__dirname, "fixtures/in-house/wanakana.json");
  const rows: ({input: string} & ReturnType<typeof wanakanaOutputs>)[] = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const {input, ...expected} of rows) {
    assert.deepEqual(wanakanaOutputs(wanakana, input), expected, JSON.stringify(input));
  }
});
