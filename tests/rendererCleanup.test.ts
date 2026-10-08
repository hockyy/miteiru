import assert from "node:assert/strict";
import {test} from "node:test";
import {
  buildRubyCopyHtml,
  fillSubtitleWithLearningContent,
  getSubtitleTokenPresentation
} from "../renderer/components/Subtitle/subtitleLanguageSupport";
import {isTextEntryTarget} from "../renderer/utils/keyboardTargets";
import {languageCodes} from "../renderer/languages/manifest";
import {escapeHtml} from "../renderer/utils/html";

test("buildRubyCopyHtml uses each language's reading and escapes text", () => {
  const japanese = {origin: "食べる", hiragana: "たべる", separation: [{main: "食", hiragana: "た"}, {main: "べる"}]};
  const mandarin = {origin: "你好", pinyin: "nǐ hǎo", separation: [{main: "你", pinyin: "nǐ"}, {main: "好", pinyin: "hǎo"}]};
  const vietnamese = {origin: "xin chào", separation: [{main: "xin chào", meaning: "hello <hi>"}]};
  const unsafe = {origin: "a<b>&c", hiragana: "", separation: [{main: "a<b>&c", hiragana: ""}]};

  assert.equal(buildRubyCopyHtml([japanese], false), "<ruby>食<rt>た</rt></ruby><ruby>べる<rt></rt></ruby>");
  assert.equal(buildRubyCopyHtml([mandarin], false), "<ruby>你<rt>nǐ</rt></ruby><ruby>好<rt>hǎo</rt></ruby>");
  assert.equal(buildRubyCopyHtml([vietnamese], false), "<ruby>xin chào<rt>hello &lt;hi&gt;</rt></ruby>");
  assert.equal(buildRubyCopyHtml([unsafe], false), "<ruby>a&lt;b&gt;&amp;c<rt></rt></ruby>");
  assert.equal(buildRubyCopyHtml([japanese, mandarin], true).split("</ruby> <ruby>").length, 2);
  // A token without separations still contributes its text.
  assert.equal(buildRubyCopyHtml([{origin: "…"}, {origin: "&"}], false), "…&amp;");
});

test("a Japanese token with an empty reading is still presented as Japanese", () => {
  // ScrollingLyrics used to treat these (Latin words, unknown words) as Vietnamese.
  assert.equal(getSubtitleTokenPresentation({origin: "OK", hiragana: "", separation: [{main: "OK"}]}).sentenceKind, "japanese");
  assert.equal(getSubtitleTokenPresentation({origin: "xin", separation: [{main: "xin"}]}).sentenceKind, "chinese");
  assert.equal(getSubtitleTokenPresentation({origin: "好", jyutping: "hou2", separation: []}).sentenceKind, "chinese");
});

test("escapeHtml covers element content and both attribute quotes", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "0");
});

test("isTextEntryTarget treats sliders and checkboxes as non-text", () => {
  const globals = globalThis as Record<string, unknown>;
  class FakeElement {
    tagName: string;
    isContentEditable = false;
    constructor(tagName: string) {
      this.tagName = tagName;
    }
  }
  class FakeInput extends FakeElement {
    type: string;
    constructor(type: string) {
      super("INPUT");
      this.type = type;
    }
  }
  const saved = {HTMLElement: globals.HTMLElement, HTMLInputElement: globals.HTMLInputElement};
  globals.HTMLElement = FakeElement;
  globals.HTMLInputElement = FakeInput;
  try {
    for (const type of ["text", "search", "number", "password"]) assert.equal(isTextEntryTarget(new FakeInput(type) as never), true, type);
    for (const type of ["range", "checkbox", "button", "file"]) assert.equal(isTextEntryTarget(new FakeInput(type) as never), false, type);
    assert.equal(isTextEntryTarget(new FakeElement("TEXTAREA") as never), true);
    assert.equal(isTextEntryTarget(new FakeElement("SELECT") as never), true);
    assert.equal(isTextEntryTarget(new FakeElement("DIV") as never), false);
    const editable = new FakeElement("DIV");
    editable.isContentEditable = true;
    assert.equal(isTextEntryTarget(editable as never), true);
    assert.equal(isTextEntryTarget(null), false);
  } finally {
    globals.HTMLElement = saved.HTMLElement;
    globals.HTMLInputElement = saved.HTMLInputElement;
  }
});

const fakeSubtitle = (lineCount: number, onLine: () => Promise<void>) => {
  const filled: number[] = [];
  const lines = Array.from({length: lineCount}, (_, index) => ({
    fillContentSeparations: async () => {
      await onLine();
    },
    fillContentWithLearningKotoba: async () => {
      filled.push(index);
    }
  }));
  return {subtitle: {language: languageCodes.japanese, lines, frequency: new Map(), progress: ""} as never, filled};
};

test("learning content is filled a few lines at a time", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const {subtitle, filled} = fakeSubtitle(50, async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
  });
  assert.equal(await fillSubtitleWithLearningContent(subtitle, async () => []), true);
  assert.equal(filled.length, 50);
  assert.ok(maxInFlight > 1 && maxInFlight <= 8, `max in flight ${maxInFlight}`);
  assert.equal((subtitle as {progress: string}).progress, "done");
});

test("learning content stops soon after the subtitle is replaced", async () => {
  let started = 0;
  const {subtitle, filled} = fakeSubtitle(500, async () => {
    started++;
    await new Promise((resolve) => setTimeout(resolve, 1));
  });
  await fillSubtitleWithLearningContent(subtitle, async () => [], () => started < 20);
  // Lines already started finish; no new ones begin once the check fails.
  assert.ok(filled.length >= 20 && filled.length < 20 + 8, `filled ${filled.length}`);
});
