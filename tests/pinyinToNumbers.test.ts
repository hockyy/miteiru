import assert from "node:assert/strict";
import {test} from "node:test";
import {pinyinToNumbers} from "../main/language/readings";

test("pinyinToNumbers numbers dictionary pinyin written with tone marks or numbers", () => {
  assert.equal(pinyinToNumbers("yi1 dian3"), "yi1 dian3");
  assert.equal(pinyinToNumbers("yī diǎn"), "yi1 dian3");
  assert.equal(pinyinToNumbers("nǚ ér"), "nü3 er2");
  assert.equal(pinyinToNumbers("lǘ"), "lü2");
  assert.equal(pinyinToNumbers("Zhōng guó"), "Zhong1 guo2");
  assert.equal(pinyinToNumbers("Ēn"), "En1");
  assert.equal(pinyinToNumbers("de"), "de5");
  assert.equal(pinyinToNumbers("ma0"), "ma5");
  assert.equal(pinyinToNumbers("  "), "");
});
