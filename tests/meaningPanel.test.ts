import assert from "node:assert/strict";
import {test} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {MeaningContent} from "../renderer/components/Meaning/MeaningBox/components/entries/MeaningContent";
import {getMeaningEntries} from "../renderer/components/Meaning/meaningEntries";
import type {MeaningContentState} from "../renderer/components/Meaning/MeaningBox/types";
import {videoConstants} from "../renderer/utils/constants";

const renderMeaning = (meaningContent: MeaningContentState, lang: string) => renderToStaticMarkup(
  React.createElement(MeaningContent, {meaningContent, lang, tags: {}})
);

test("a Cantonese word without a dictionary entry says so instead of rendering empty fields", async () => {
  (globalThis as Record<string, unknown>).window = {ipc: {invoke: async () => []}};
  const [entry] = await getMeaningEntries("咁樣", videoConstants.cantoneseLang);

  const html = renderMeaning(entry, videoConstants.cantoneseLang);

  assert.match(html, /No dictionary entry for 咁樣\./);
  assert.doesNotMatch(html, /Jyutping/);
  assert.doesNotMatch(html, />1\.</);
});

test("a Mandarin entry with blank jyutping renders no Jyutping pill", () => {
  const html = renderMeaning({
    id: "1",
    sense: [],
    single: [{key: 0, text: "百分"}],
    content: "百分",
    simplified: "百分",
    jyutping: [""],
    meaning: ["percent"],
  }, videoConstants.chineseLang);

  assert.doesNotMatch(html, /Jyutping/);
  assert.match(html, /percent/);
});

test("a Cantonese entry still shows its jyutping and gloss", () => {
  const html = renderMeaning({
    id: "0",
    sense: [],
    single: [{key: 0, text: "屈機"}],
    content: "屈機",
    simplified: "",
    jyutping: "wat1 gei1",
    meaning: ["to achieve overwhelming victory"],
  }, videoConstants.cantoneseLang);

  assert.match(html, /Jyutping:<\/strong> wat1 gei1/);
  assert.match(html, /to achieve overwhelming victory/);
});
