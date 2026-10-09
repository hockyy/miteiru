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
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globals[name];
      else globals[name] = value;
    }
  }
});

// A subtitle whose lines tokenize to the given words, with window.ipc answering gloss batches.
const fakeSubtitle = (lineWords: string[][], onTokenize: () => Promise<void> = async () => {}) => {
  const lines = lineWords.map((words) => ({
    content: words.join(""),
    meaning: [] as string[],
    async fillContentSeparations() {
      await onTokenize();
      this.content = words.map((word) => ({origin: word, basicForm: word, hiragana: ""}));
    }
  }));
  return {language: languageCodes.japanese, lines, frequency: new Map<string, number>(), progress: ""};
};

const withGlossIpc = async (run: (requests: {target: string}[][]) => Promise<void>) => {
  const globals = globalThis as Record<string, unknown>;
  const saved = globals.window;
  const requests: {target: string}[][] = [];
  globals.window = {
    ipc: {
      invoke: async (channel: string, batch: {target: string}[]) => {
        assert.equal(channel, "learningGlossesJapanese");
        requests.push(batch);
        return batch.map(({target}) => `gloss:${target}`);
      }
    }
  };
  try {
    await run(requests);
  } finally {
    if (saved === undefined) delete globals.window;
    else globals.window = saved;
  }
};

test("learning glosses are fetched once per word, in one IPC call per chunk", async () => {
  await withGlossIpc(async (requests) => {
    // 100 lines repeating three words, plus a short kana particle that gets no gloss.
    const subtitle = fakeSubtitle(Array.from({length: 100}, (_, i) => ["学生", "が", i % 2 ? "勉強" : "先生"]));
    assert.equal(await fillSubtitleWithLearningContent(subtitle as never, async () => []), true);

    assert.deepEqual(requests.flat().map(({target}) => target).sort(), ["先生", "勉強", "学生"]);
    assert.ok(requests.length <= Math.ceil(100 / 32), `${requests.length} IPC calls`);
    assert.deepEqual(subtitle.lines[1].meaning, ["gloss:学生", "", "gloss:勉強"]);
    assert.deepEqual(subtitle.lines[99].meaning, ["gloss:学生", "", "gloss:勉強"]);
    assert.equal(subtitle.frequency.get("学生"), 100);
    assert.equal(subtitle.frequency.get("が"), 100);
    assert.equal(subtitle.progress, "done");
  });
});

test("learning content stops at the next chunk after the subtitle is replaced", async () => {
  await withGlossIpc(async () => {
    let tokenized = 0;
    const subtitle = fakeSubtitle(Array.from({length: 500}, () => ["学生"]), async () => {
      tokenized++;
    });
    await fillSubtitleWithLearningContent(subtitle as never, async () => [], () => tokenized < 40);
    // The chunk running when the check fails finishes; no further chunk starts.
    assert.equal(tokenized, 64);
    assert.equal(subtitle.lines.filter((line) => Array.isArray(line.content)).length, 64);
  });
});

test("a line that fails to tokenize leaves the rest of the subtitle processed", async () => {
  await withGlossIpc(async () => {
    const subtitle = fakeSubtitle(Array.from({length: 40}, () => ["学生"]));
    subtitle.lines[3].fillContentSeparations = async () => {
      throw new Error("tokenizer failed");
    };
    await fillSubtitleWithLearningContent(subtitle as never, async () => []);
    assert.equal(typeof subtitle.lines[3].content, "string");
    assert.deepEqual(subtitle.lines[39].meaning, ["gloss:学生"]);
  });
});

test("an empty gloss reply is not cached, so later chunks ask again", async () => {
  const globals = globalThis as Record<string, unknown>;
  const saved = globals.window;
  let calls = 0;
  globals.window = {
    ipc: {
      // The first reply comes back empty, as when the dictionary is still opening.
      invoke: async (_channel: string, batch: {target: string}[]) => (++calls === 1 ? [] : batch.map(({target}) => `gloss:${target}`))
    }
  };
  try {
    const subtitle = fakeSubtitle(Array.from({length: 64}, () => ["学生"]));
    await fillSubtitleWithLearningContent(subtitle as never, async () => []);
    assert.deepEqual(subtitle.lines[0].meaning, [""]);
    assert.deepEqual(subtitle.lines[63].meaning, ["gloss:学生"]);
  } finally {
    if (saved === undefined) delete globals.window;
    else globals.window = saved;
  }
});
