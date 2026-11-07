import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {languageModes} from "../renderer/languages/manifest";

test("every language has the flag and names the home page shows", () => {
  for (const mode of languageModes) {
    // Two regional indicator letters: a country flag, which the bundled flag font draws.
    assert.match(mode.flag, /^[\u{1F1E6}-\u{1F1FF}]{2}$/u, mode.name);
    assert.ok(mode.nativeName.trim(), `${mode.name} needs its own name`);
    assert.ok(mode.englishName.trim(), `${mode.name} needs an English name`);
    // The tokenizer is not what a learner picks.
    assert.doesNotMatch(`${mode.nativeName} ${mode.englishName}`, /kuromoji|jieba/i);
  }
});

test("the flag font is declared for the flag characters and credited", () => {
  const css = readFileSync(new URL("../renderer/styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /font-family: "Twemoji Country Flags";[\s\S]*?unicode-range: U\+1F1E6-1F1FF/);
  // Every font stack goes through --miteiru-cjk-font, so the flag font must lead each definition.
  const stacks = [...css.matchAll(/--miteiru-cjk-font: ([^;]+);/g)].map((match) => match[1]);
  assert.ok(stacks.length >= 3);
  for (const stack of stacks) assert.match(stack, /^"Twemoji Country Flags",/);
  const licenses = readFileSync(new URL("../renderer/public/licenses/fonts.txt", import.meta.url), "utf8");
  assert.match(licenses, /Twemoji[\s\S]*CC BY 4\.0/);
});
