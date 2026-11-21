import assert from "node:assert/strict";
import {test} from "node:test";
import {jmdictImport, type JmdictWord} from "../main/dictionary/jmdictDb";
import {chineseImport} from "../main/dictionary/chineseDictionaryDb";
import {kanjidicImport} from "../main/dictionary/kanjidicDb";
import {parseJapaneseLevels} from "../main/language/japaneseLevels";
import {chinesePos, FULL_FORMAT, POS_VALUES, type LanguageToolDeps, type SavedWords} from "../main/mcp/languageTools";
import {mcpDefinitions, ToolError, validateToolArguments} from "../main/mcp/protocol";
import {createMiteiruTools, type LearningLanguage, type MiteiruToolDeps} from "../main/mcp/tools";
import {memoryDictionary} from "./helpers/memoryDictionary";

// ---- Dictionaries, in the importers' own layout -----------------------------------------------------

const sense = (pos: string[], gloss: string[], extra: Partial<JmdictWord["sense"][number]> = {}): JmdictWord["sense"][number] => ({
  partOfSpeech: pos, appliesToKanji: ["*"], appliesToKana: ["*"], related: [], antonym: [], field: [], dialect: [],
  misc: [], info: [], languageSource: [], gloss: gloss.map((text) => ({lang: "eng", text, type: null})), ...extra
});

const jmWord = (id: string, kanji: string[], kana: string[], senses: JmdictWord["sense"], common = true): JmdictWord => ({
  id,
  kanji: kanji.map((text) => ({common, text, tags: []})),
  kana: kana.map((text) => ({common, text, tags: [], appliesToKanji: ["*"]})),
  sense: senses
});

const JMDICT_WORDS: JmdictWord[] = [
  jmWord("1467640", ["猫"], ["ねこ"], [sense(["n"], ["cat"])]),
  jmWord("1579110", ["今日"], ["きょう", "こんにち"], [sense(["n", "adv"], ["today", "this day"]), sense(["n", "adv"], ["these days", "recently"])]),
  jmWord("1005340", [], ["さん"], [sense(["suf"], ["Mr.", "Mrs.", "Miss", "Ms.", "-san"])]),
  jmWord("1384040", ["酸"], ["さん"], [sense(["n"], ["acid"])]),
  jmWord("2028930", [], ["が"], [sense(["prt"], ["indicates sentence subject"])]),
  jmWord("1008490", [], ["と"], [sense(["prt"], ["if", "when"]), sense(["prt"], ["with"]), sense(["prt"], ["and"])]),
  jmWord("1628500", [], ["です"], [sense(["cop"], ["be", "is"])]),
  jmWord("1584880", ["好き"], ["すき"], [sense(["adj-na", "n"], ["liked", "well-liked", "favourite"])]),
  jmWord("1382200", ["税理士"], ["ぜいりし"], [sense(["n"], ["tax counsellor", "licensed tax accountant"])]),
  jmWord("1578850", ["行く"], ["いく", "ゆく"], [sense(["v5k-s", "vi"], ["to go", "to move (towards)"])])
];

const JMDICT_TAGS = {
  n: "noun (common) (futsuumeishi)", adv: "adverb (fukushi)", suf: "suffix", prt: "particle", cop: "copula",
  "adj-na": "adjectival nouns or quasi-adjectives (keiyodoshi)", "v5k-s": "Godan verb - Iku/Yuku special class", vi: "intransitive verb"
};

const dictionaries = (async () => ({
  jmdict: await memoryDictionary(jmdictImport, {version: "test", dictDate: "2026-01-01", dictRevisions: [], tags: JMDICT_TAGS, words: JMDICT_WORDS} as never),
  kanjidic: await memoryDictionary(kanjidicImport, {
    version: "test", dictDate: "2026-01-01",
    characters: [{
      literal: "話", codepoints: [], radicals: [{type: "classical", value: 149}],
      misc: {grade: 2, strokeCounts: [13], variants: [], frequency: 134, radicalNames: [], jlptLevel: 4},
      dictionaryReferences: [], queryCodes: [],
      readingMeaning: {groups: [{
        readings: [{type: "pinyin", value: "hua4"}, {type: "korean_h", value: "화"}, {type: "ja_on", value: "ワ"}, {type: "ja_kun", value: "はな.す"}, {type: "ja_kun", value: "はなし"}],
        meanings: [{lang: "en", value: "tale"}, {lang: "en", value: "talk"}]
      }], nanori: []}
    }]
  } as never),
  cedict: await memoryDictionary(chineseImport, {
    version: "test",
    words: [
      {id: "61934", content: "沒想到", simplified: "没想到", pinyin: ["mei2 xiang3 dao4"], meaning: ["didn't expect"]},
      {id: "122276", content: "龍王", simplified: "龙王", pinyin: ["long2 wang2"], meaning: ["Dragon King (mythology)"]},
      {id: "20801", content: "命令", simplified: "命令", pinyin: ["ming4 ling4"], meaning: ["order", "command", "CL:道[dao4],個|个[ge4]"]},
      {id: "80001", content: "我們", simplified: "我们", pinyin: ["wo3 men5"], meaning: ["we", "us"]},
      {id: "90001", content: "行", simplified: "行", pinyin: ["xing2"], meaning: ["to walk", "OK"]},
      {id: "90002", content: "行", simplified: "行", pinyin: ["hang2"], meaning: ["row", "line", "profession"]}
    ],
    // The character list writes pinyin with tone marks.
    characters: [{id: "5001", content: "龙", pinyin: ["lóng"], meaning: ["dragon"], decomposition: "⿻丿尤", radical: "龙", stroke_count: 5}]
  } as never),
  cantodict: await memoryDictionary(chineseImport, {
    version: "test",
    words: [
      {id: "15178", content: "飲茶", simplified: "饮茶", jyutping: ["jam2", "caa4"], meaning: ["to drink tea | to go yumcha, to have dim sum"]},
      {id: "17558", content: "佢哋", jyutping: ["keoi5", "dei6"], meaning: ["they, them"]},
      {id: "2372", content: "咗", jyutping: ["zo2"], meaning: ["used after a verb as a perfective aspect marker"]}
    ],
    characters: []
  } as never)
}))();

// ---- Tokens, shaped like Miteiru's analyzer's ---------------------------------------------------------

/** A fake tokenizer: the longest listed word first; like the real ones, it drops spaces and an emoji. */
const lexiconTokenizer = (lexicon: Record<string, object>, fallback: (char: string) => object) => (text: string) => {
  const surfaces = Object.keys(lexicon).sort((a, b) => b.length - a.length);
  const chars = Array.from(text);
  const tokens: any[] = [];
  for (let at = 0; at < chars.length;) {
    const rest = chars.slice(at).join("");
    const surface = surfaces.find((candidate) => rest.startsWith(candidate));
    if (surface) {
      tokens.push({origin: surface, ...lexicon[surface]});
      at += Array.from(surface).length;
      continue;
    }
    if (!/\s|\p{Extended_Pictographic}/u.test(chars[at])) tokens.push({origin: chars[at], ...fallback(chars[at])});
    at++;
  }
  return tokens;
};

const ja = (basicForm: string, hiragana: string, pos: string, romaji: string) => ({basicForm, hiragana, pos, separation: [{main: basicForm, hiragana, romaji}]});
const japaneseTokens = lexiconTokenizer({
  今日: ja("今日", "きょう", "名詞-副詞可能", "kyou"),
  猫: ja("猫", "ねこ", "名詞-一般", "neko"),
  が: ja("が", "が", "助詞-格助詞-一般", "ga"),
  好き: ja("好き", "すき", "名詞-形容動詞語幹", "suki"),
  です: ja("です", "です", "助動詞", "desu"),
  税理士: ja("税理士", "ぜいりし", "名詞-一般", "zeirishi"),
  さん: ja("さん", "さん", "名詞-接尾-人名", "san"),
  と: ja("と", "と", "助詞-格助詞-一般", "to"),
  行かなかった: {basicForm: "行く", hiragana: "いかなかった", pos: "動詞-自立", separation: [{main: "行", hiragana: "い", romaji: "i"}, {main: "かなかった", hiragana: "かなかった", romaji: "kanakatta"}]}
}, (char) => ({basicForm: char, hiragana: char, pos: "記号-一般", separation: [{main: char, hiragana: char, romaji: char}]}));

const chineseTokens = (field: "pinyin" | "jyutping", lexicon: Record<string, string>) => {
  const tokenize = lexiconTokenizer(Object.fromEntries(Object.entries(lexicon).map(([word, reading]) => [word, {[field]: reading}])), () => ({[field]: ""}));
  return (text: string) => tokenize(text).map((token) => {
    const readings = String(token[field] ?? "").split(" ");
    return {...token, separation: Array.from(token.origin as string).map((main, index) => ({main, [field]: /\p{Script=Han}/u.test(main) ? readings[index] ?? "" : ""}))};
  });
};
const mandarinTokens = chineseTokens("pinyin", {
  没想到: "mei2 xiang3 dao4", 龙王: "long2 wang2", 命令: "ming4 ling4", 我们: "wo3 men5", 我們: "wo3 men5", 行: "xing2", 你好: "ni3 hao3"
});
const cantoneseTokens = chineseTokens("jyutping", {佢哋: "keoi5 dei6", 今日: "gam1 jat6", 去: "heoi3", 咗: "zo2", 飲茶: "jam2 caa4"});

/** Vietnamese tokens list their raw chunks, punctuation attached, as the Vietnamese analyzer does. */
const vietnameseTokens = (text: string) => {
  const chunks = text.split(/\s+/).filter(Boolean);
  const tokens: any[] = [];
  for (let at = 0; at < chunks.length; at++) {
    const pair = `${chunks[at]} ${chunks[at + 1] ?? ""}`.toLowerCase().replace(/[,.!?]/g, "").trim();
    if (pair === "xin chào" || pair === "sinh viên") {
      tokens.push({origin: pair, separation: [{main: chunks[at]}, {main: chunks[at + 1]}]});
      at++;
    } else {
      tokens.push({origin: chunks[at].toLowerCase().replace(/[,.!?]/g, ""), separation: [{main: chunks[at]}]});
    }
  }
  return tokens;
};

// ---- The deps --------------------------------------------------------------------------------------

const KANJI_SVG = '<svg><g><path id="kvg:08a71-s1" d=M24.99,14c2.36,1.5,6.1,6.17,6.7,8.5 /><path id="kvg:08a71-s2" d="M12,30c1,1,2,2,3,3"/></g><text>1</text></svg>';
const HANZI_SVG = '<svg><path d="M1 1Z" fill="lightgray"></path><path d="M2 2Z" fill="lightgray"></path><clipPath><path d="M1 1Z"></path></clipPath><path d="M5 5L6 6" fill="none" stroke-dasharray="1 2"></path></svg>';

const languageDeps = async (overrides: Partial<LanguageToolDeps> = {}) => {
  const dbs = await dictionaries;
  const saved: Record<string, SavedWords> = {ja: {猫: {level: 2, updTime: 10}}, "zh-CN": {}, yue: {}, vi: {}};
  const writes: Array<{code: string; entries: SavedWords}> = [];
  const loaded: string[] = [];
  const deps: LanguageToolDeps = {
    defaultLanguage: async () => "ja",
    ensureLanguage: async (language) => {
      loaded.push(language);
    },
    analyze: async (language, text) => (language === "ja" ? japaneseTokens(text) : language === "yue" ? cantoneseTokens(text) : language === "vi" ? vietnameseTokens(text) : mandarinTokens(text)),
    jmdict: () => dbs.jmdict,
    jmdictTags: () => JMDICT_TAGS,
    kanjidic: () => dbs.kanjidic,
    chineseDictionary: (code) => (code === "yue" ? dbs.cantodict : dbs.cedict),
    vietnameseDictionary: () => new Map([["xin chào", "hello; hi"], ["sinh viên", "student"], ["tôi", "I; me"]]),
    strokeSvg: async (set) => (set === "kanji" ? KANJI_SVG : HANZI_SVG),
    savedWords: async (code) => ({...saved[code]}),
    saveWordLevels: async (code, entries) => {
      writes.push({code, entries});
      saved[code] = {...saved[code], ...entries};
    },
    userWords: async () => [],
    pitchAccents: async () => ({words: {猫: {ねこ: [1]}, 今日: {きょう: [1]}}}),
    hskWords: async () => Object.freeze({没想到: 4, 命令: 5, 我们: 1}) as never,
    japaneseLevels: async () => parseJapaneseLevels({jlpt: [[1467640, 5, "猫", "ねこ"], [1579110, 5, "今日", "きょう"], [1579110, 3, "今日", "こんにち"]], frequency: [[400, ["猫"]], [350, ["今日"]]]}),
    now: () => 1_000_000,
    ...overrides
  };
  return {deps, saved, writes, loaded};
};

const JAPANESE: LearningLanguage = {code: "ja", name: "Japanese", tokenizerMode: "kuromoji", pluginId: "japanese-kuromoji"};

const toolsWith = async (overrides: Partial<LanguageToolDeps> = {}, base: Partial<MiteiruToolDeps> = {}) => {
  const state = await languageDeps(overrides);
  const tools = createMiteiruTools({
    version: "8.2.0",
    loadedLanguage: () => JAPANESE,
    rememberedLanguage: async () => JAPANESE,
    loadLanguage: async () => undefined,
    analyze: async (text) => japaneseTokens(text),
    savedWords: async (code) => state.saved[code] ?? {},
    lastVideo: async () => null,
    ytDlpAvailable: async () => false,
    searchYoutube: async () => ({entries: []}),
    videoInfo: async () => ({}),
    captionText: async () => "",
    openInWindow: async () => "opened",
    language: state.deps,
    toneType: async () => "symbol",
    ...base
  });
  /** As the MCP and REST routes call a tool: arguments checked against its definition first. */
  const call = async (name: string, args: unknown = {}): Promise<any> => tools[name](validateToolArguments(name, args));
  return {...state, tools, call};
};

const rejects = (status: number, pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof ToolError, `expected a ToolError, got ${String(error)}`);
  assert.equal(error.status, status);
  assert.match(error.message, pattern);
  return true;
};

const LANGUAGE_TOOLS = ["lookup_word", "lookup_character", "readings", "text_coverage", "known_words", "set_word_levels", "conjugate", "romanize"];
const definition = (name: string) => mcpDefinitions.tools.find((tool: any) => tool.name === name) as any;

// ---- Definitions -------------------------------------------------------------------------------------

test("every language tool is defined, takes a language, and only set_word_levels writes", () => {
  for (const name of LANGUAGE_TOOLS) {
    const tool = definition(name);
    assert.ok(tool, `${name} is defined`);
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.inputSchema.properties.language, `${name} takes a language`);
    assert.equal(tool.annotations?.readOnlyHint, name !== "set_word_levels", `${name} readOnlyHint`);
  }
  assert.equal(definition("set_word_levels").annotations.idempotentHint, true);
  for (const name of ["analyze_text", "search_videos", "rate_video", "list_saved_words"]) {
    assert.deepEqual(definition(name).inputSchema.properties.language.enum, ["ja", "zh-Hans", "zh-Hant", "yue", "vi"], name);
  }
  // analyze_text keeps its old answer unless asked for the new one.
  assert.equal(definition("analyze_text").inputSchema.properties.detail.default, "basic");
});

test("arguments are checked before a tool runs, with messages naming the argument", async () => {
  const {call, loaded} = await toolsWith();
  await assert.rejects(call("lookup_word", {language: "fr", word: "chat"}), rejects(400, /language must be one of: ja, zh-Hans, zh-Hant, yue, vi/));
  await assert.rejects(call("lookup_word", {language: "ja"}), rejects(400, /word/));
  await assert.rejects(call("analyze_text", {language: "ja", texts: Array.from({length: 201}, () => "猫")}), rejects(400, /texts must have at most 200 items/));
  await assert.rejects(call("analyze_text", {language: "ja", texts: []}), rejects(400, /texts/));
  await assert.rejects(call("analyze_text", {language: "ja", text: "猫", detail: "everything"}), rejects(400, /detail must be one of/));
  await assert.rejects(call("analyze_text", {language: "ja", text: "猫", texts: ["猫"]}), rejects(400, /Give text or texts, not both/));
  await assert.rejects(call("set_word_levels", {language: "ja", words: [{word: "猫", level: "mastered"}]}), rejects(400, /words\[0\]\.level must be one of/));
  await assert.rejects(call("set_word_levels", {language: "ja", words: [{word: "猫", level: "known", note: "x"}]}), rejects(400, /Unknown argument: words\[0\]\.note/));
  await assert.rejects(call("set_word_levels", {language: "ja", words: []}), rejects(400, /words/));
  await assert.rejects(call("known_words", {language: "ja", level: "new"}), rejects(400, /level must be one of/));
  await assert.rejects(call("lookup_character", {language: "ja", char: "話す"}), rejects(400, /char/));
  await assert.rejects(call("lookup_character", {language: "vi", char: "話"}), rejects(400, /language must be one of: ja, zh-Hans, zh-Hant, yue/));
  await assert.rejects(call("conjugate", {word: "猫", language: "zh-Hans"}), rejects(400, /language must be one of: ja/));
  await assert.rejects(call("lookup_character", {language: "ja", char: "a"}), rejects(400, /one Han character/));
  // None of these loaded a language.
  assert.deepEqual(loaded, []);
});

test("without the language engines the language tools answer 503, and the old tools work as before", async () => {
  const {call} = await toolsWith({}, {language: undefined});
  await assert.rejects(call("lookup_word", {language: "ja", word: "猫"}), rejects(503, /language tools are not available/));
  await assert.rejects(call("analyze_text", {language: "ja", text: "猫"}), rejects(503, /language tools are not available/));
  const old = await call("analyze_text", {text: "猫が好きです"});
  assert.deepEqual(old.words.map((word: any) => word.text), ["猫", "が", "好き", "です"]);
});

test("Chinese POS preserves proper-noun subtypes and maps other jieba tags by first letter", () => {
  for (const [pos, tags] of Object.entries({
    verb: ["v", "vg", "vd", "vn"], noun: ["ng", "tg", "f"],
    proper_noun: ["nr", "nrfg", "nrt", "ns", "nt", "nz", "R"],
    pronoun: ["r", "rg", "rz"], adjective: ["ag", "ad", "an", "zg"],
    adverb: ["dg"], numeral: ["mq"], classifier: ["q"], particle: ["uj", "y", "p"],
    conjunction: ["c"], interjection: ["o"], idiom: ["i"], expression: ["l"],
    prefix: ["h"], suffix: ["k"], punct: ["wj"], other: ["g"], word: ["x", "eng", ""],
  })) {
    for (const tag of tags) assert.equal(chinesePos(tag), pos, tag);
  }
  assert.equal(chinesePos(undefined), "word");
  assert.equal(chinesePos(null), "word");
});

test("Cantonese reads the word list's untrustworthy k and x tags as untagged", () => {
  // yue.jieba.txt tags 去 and 咗 alike as k, and 都, 就, 要 as x.
  assert.equal(chinesePos("k", true), "word");
  assert.equal(chinesePos("x", true), "word");
  assert.equal(chinesePos("k"), "suffix");
  assert.equal(chinesePos("v", true), "verb");
  assert.equal(chinesePos("r", true), "pronoun");
});

// ---- analyze_text ------------------------------------------------------------------------------------

const LINES: Record<string, string[]> = {
  ja: ["今日ね税理士さんとね、行かなかったです。", "  猫が 好き😀です！ ", "abc 猫\n\t好き"],
  "zh-Hans": ["没想到，龙王的命令", "我们 行 ok?", "你好😀龙王"],
  "zh-Hant": ["我們行", "  龍王"],
  yue: ["佢哋今日去咗飲茶", "佢哋, 飲茶!"],
  vi: ["Xin chào, tôi là sinh viên.", "  tôi   sinh viên!! "]
};

const READING_KEYS: Record<string, string[]> = {ja: ["kana", "romaji"], "zh-Hans": ["pinyin", "pinyin_num"], "zh-Hant": ["pinyin", "pinyin_num"], yue: ["jyutping"], vi: []};

test("analyze_text detail full: the tokens' s join to exactly the input in every language, with code point offsets", async () => {
  const {call} = await toolsWith();
  for (const [language, lines] of Object.entries(LINES)) {
    const answer = await call("analyze_text", {language, detail: "full", texts: lines});
    assert.equal(answer.detail, "full");
    assert.equal(answer.format, FULL_FORMAT);
    assert.equal(answer.language.code, language);
    assert.deepEqual(answer.results.map((result: any) => result.text), lines);
    for (const {text, tokens} of answer.results) {
      assert.equal(tokens.map((token: any) => token.s).join(""), text, `${language}: ${JSON.stringify(text)}`);
      let offset = 0;
      for (const token of tokens) {
        assert.equal(token.start, offset, `${language} ${token.s}: start`);
        offset += Array.from(token.s as string).length;
        assert.equal(token.end, offset, `${language} ${token.s}: end`);
        assert.ok((POS_VALUES as readonly string[]).includes(token.pos), `${language} ${token.s}: pos ${token.pos}`);
        assert.equal(typeof token.word, "boolean");
        if (!token.word) {
          assert.ok(["space", "punct", "symbol"].includes(token.pos), `${language} ${JSON.stringify(token.s)} is ${token.pos}`);
          if (/^\s+$/u.test(token.s)) assert.equal(token.pos, "space");
          continue;
        }
        assert.ok(["new", "learning", "known"].includes(token.saved));
        assert.ok(["dictionary", "mismatch", "unknown"].includes(token.reading_check));
        assert.equal(typeof token.base, "string");
        assert.ok(token.levels && typeof token.levels === "object");
        if (token.gloss !== null && token.gloss !== undefined) {
          assert.ok(Array.isArray(token.gloss.en) && token.gloss.en.every((sense: unknown) => typeof sense === "string"));
          assert.equal(typeof token.gloss.source, "string");
          assert.equal(typeof token.gloss.entry_id, "string");
        }
        if (token.reading) assert.deepEqual(Object.keys(token.reading).sort(), [...READING_KEYS[language]].sort(), `${language} ${token.s}: reading keys`);
        if (token.ruby) assert.equal(token.ruby.map((segment: any) => segment.base).join(""), token.s, `${language} ${token.s}: ruby covers the word`);
      }
    }
  }
});

test("analyze_text detail full in Japanese: POS-fit glosses, ruby, pitch, levels, conjugation and saved levels", async () => {
  const {call} = await toolsWith();
  const answer = await call("analyze_text", {language: "ja", detail: "full", text: "今日ね税理士さんとね、行かなかったです。"});
  const token = (s: string) => answer.tokens.find((candidate: any) => candidate.s === s);
  // さん after a name is the suffix, not 酸 (acid); と after a noun is "with", not "if".
  assert.equal(token("さん").gloss.entry_id, "1005340");
  assert.equal(token("さん").pos, "suffix");
  assert.equal(token("と").gloss.en[0], "with");
  assert.equal(token("と").pos, "particle");
  const today = token("今日");
  assert.deepEqual(today.reading, {kana: "きょう", romaji: "kyou"});
  assert.deepEqual(today.ruby, [{base: "今日", ruby: "きょう"}]);
  assert.deepEqual(today.pitch.accents, [1]);
  assert.deepEqual(today.levels, {jlpt: "N5", freq_rank: 2, freq_zipf: 5.5});
  assert.equal(today.reading_check, "dictionary");
  assert.equal(token("、").pos, "punct");
  assert.equal(token("。").word, false);
  const went = token("行かなかった");
  assert.equal(went.base, "行く");
  assert.equal(went.pos, "verb");
  assert.equal(went.gloss.entry_id, "1578850");
  assert.equal(went.conjugation.dictionary_form, "行く");
  assert.ok(Array.isArray(went.conjugation.ladder));
  assert.deepEqual(went.ruby, [{base: "行", ruby: "い"}, {base: "かなかった", ruby: ""}]);
  assert.equal(token("税理士").saved, "new");
  const cat = (await call("analyze_text", {language: "ja", detail: "full", text: "猫"})).tokens[0];
  assert.equal(cat.saved, "known");
  assert.deepEqual(cat.levels, {jlpt: "N5", freq_rank: 1, freq_zipf: 5});
});

test("analyze_text detail full in Mandarin and Cantonese: readings in both forms, tones, HSK and dictionary glosses", async () => {
  const {call} = await toolsWith();
  const mandarin = await call("analyze_text", {language: "zh-Hans", detail: "full", text: "没想到，龙王的命令"});
  const word = (answer: any, s: string) => answer.tokens.find((candidate: any) => candidate.s === s);
  const surprise = word(mandarin, "没想到");
  assert.deepEqual(surprise.reading, {pinyin: "méi xiǎng dào", pinyin_num: "mei2 xiang3 dao4"});
  assert.deepEqual(surprise.ruby, [{base: "没", ruby: "méi"}, {base: "想", ruby: "xiǎng"}, {base: "到", ruby: "dào"}]);
  assert.deepEqual(surprise.gloss.en, ["didn't expect"]);
  assert.equal(surprise.gloss.source, "CC-CEDICT");
  assert.equal(surprise.levels.hsk, 4);
  assert.deepEqual(surprise.tones, [2, 3, 4]);
  assert.equal(surprise.reading_check, "dictionary");
  assert.deepEqual(word(mandarin, "命令").gloss.measure_words, ["道", "个"]);
  assert.equal(word(mandarin, "，").pos, "punct");

  const cantonese = await call("analyze_text", {language: "yue", detail: "full", text: "佢哋今日去咗飲茶"});
  const tea = word(cantonese, "飲茶");
  assert.deepEqual(tea.reading, {jyutping: "jam2 caa4"});
  assert.deepEqual(tea.tones, [2, 4]);
  assert.equal(tea.gloss.source, "CantoDict");
  assert.equal(tea.gloss.en[0], "to drink tea");
  assert.equal(tea.forms, undefined);
  assert.equal(word(cantonese, "咗").gloss.en[0], "used after a verb as a perfective aspect marker");
  assert.equal(tea.levels.hsk, undefined);
});

test("analyze_text with a language and no detail keeps the old word shape", async () => {
  const {call} = await toolsWith();
  const answer = await call("analyze_text", {language: "ja", text: "猫が好きです"});
  assert.equal(answer.detail, undefined);
  assert.deepEqual(answer.words.map((word: any) => word.text), ["猫", "が", "好き", "です"]);
  assert.equal(answer.words[0].level, "known");
  // A batch in the old shape too.
  const batch = await call("analyze_text", {language: "ja", texts: ["猫", "好き"]});
  assert.deepEqual(batch.results.map((result: any) => result.words[0].text), ["猫", "好き"]);
});

// ---- The dictionary tools ------------------------------------------------------------------------------

test("lookup_word gives every entry with every sense, POS names, entry ids and levels", async () => {
  const {call} = await toolsWith();
  const san = await call("lookup_word", {language: "ja", word: "さん", pos: "suffix"});
  assert.equal(san.total, 1);
  assert.equal(san.entries[0].entry_id, "1005340");
  assert.equal(san.entries[0].source, "JMdict");
  assert.deepEqual(san.entries[0].senses[0].pos_names, ["suffix"]);
  const both = await call("lookup_word", {language: "ja", word: "さん"});
  assert.deepEqual(both.entries.map((entry: any) => entry.entry_id).sort(), ["1005340", "1384040"]);
  const today = (await call("lookup_word", {language: "ja", word: "今日"})).entries[0];
  assert.deepEqual(today.readings.map((reading: any) => reading.text), ["きょう", "こんにち"]);
  assert.equal(today.senses.length, 2);
  assert.equal(today.common, true);
  assert.equal(today.levels.jlpt, "N5");
  // An inflected form is looked up by the dictionary form Miteiru's tokenizer gives it.
  const went = await call("lookup_word", {language: "ja", word: "行かなかった"});
  assert.equal(went.dictionary_form, "行く");
  assert.equal(went.entries[0].entry_id, "1578850");

  const dragon = await call("lookup_word", {language: "zh-Hans", word: "龙王"});
  assert.equal(dragon.entries[0].traditional, "龍王");
  assert.deepEqual(dragon.entries[0].pinyin, [{pinyin_num: "long2 wang2", pinyin: "lóng wáng"}]);
  const walk = await call("lookup_word", {language: "zh-Hans", word: "行", reading: "hang2"});
  assert.deepEqual(walk.entries.map((entry: any) => entry.senses[0]), ["row"]);
  const tea = await call("lookup_word", {language: "yue", word: "飲茶"});
  assert.deepEqual(tea.entries[0].jyutping, ["jam2 caa4"]);
  const hello = await call("lookup_word", {language: "vi", word: "Xin chào"});
  assert.deepEqual(hello.entries[0], {entry_id: "xin chào", source: "VNEDict", word: "xin chào", senses: ["hello", "hi"]});
});

test("lookup_character gives readings, meanings, levels and stroke paths", async () => {
  const {call} = await toolsWith();
  const kanji = await call("lookup_character", {language: "ja", char: "話"});
  assert.equal(kanji.codepoint, "U+8A71");
  assert.deepEqual(kanji.readings.on, ["ワ"]);
  assert.deepEqual(kanji.readings.kun, ["はな.す", "はなし"]);
  assert.deepEqual(kanji.meanings, ["tale", "talk"]);
  assert.deepEqual(kanji.levels, {grade: 2, jlpt_old: 4, freq_rank: 134});
  assert.equal(kanji.stroke_count, 13);
  // KanjiVG's minified files leave some attributes unquoted.
  assert.deepEqual(kanji.strokes, {source: "KanjiVG", count: 2, paths: ["M24.99,14c2.36,1.5,6.1,6.17,6.7,8.5", "M12,30c1,1,2,2,3,3"]});
  const hanzi = await call("lookup_character", {language: "zh-Hans", char: "龙"});
  assert.deepEqual(hanzi.readings, {pinyin: ["lóng"], pinyin_num: ["long2"]});
  assert.equal(hanzi.decomposition, "⿻丿尤");
  assert.deepEqual(hanzi.strokes, {source: "Make Me a Hanzi", count: 2, outlines: ["M1 1Z", "M2 2Z"], medians: ["M5 5L6 6"]});
  // Not in this KANJIDIC, but KanjiVG has its strokes: the strokes, and found false.
  const strokesOnly = await call("lookup_character", {language: "ja", char: "猫"});
  assert.equal(strokesOnly.found, false);
  assert.equal(strokesOnly.strokes.count, 2);
  assert.equal(strokesOnly.stroke_count, null);
  const {call: callWithoutStrokes} = await toolsWith({strokeSvg: async () => ""});
  await assert.rejects(callWithoutStrokes("lookup_character", {language: "ja", char: "猫"}), rejects(404, /KANJIDIC has no entry for 猫/));
});

test("readings lists every dictionary reading with the tokenizer's", async () => {
  const {call} = await toolsWith();
  const today = await call("readings", {language: "ja", word: "今日"});
  assert.equal(today.tokenizer_reading, "きょう");
  assert.deepEqual(today.readings.map((reading: any) => reading.reading), ["きょう", "こんにち"]);
  assert.deepEqual(today.readings[0].pitch?.accents, [1]);
  const row = await call("readings", {language: "zh-Hans", word: "行"});
  assert.deepEqual(row.readings.map((reading: any) => reading.pinyin_num).sort(), ["hang2", "xing2"]);
  assert.deepEqual(row.tokenizer_reading, {pinyin_num: "xing2", pinyin: "xíng"});
  // Vietnamese is written as it is read: the definition leaves it out.
  await assert.rejects(call("readings", {language: "vi", word: "tôi"}), rejects(400, /language must be one of: ja, zh-Hans, zh-Hant, yue$/));
});

test("text_coverage counts words by saved level and lists the unknown ones with their levels", async () => {
  const {call} = await toolsWith();
  const coverage = await call("text_coverage", {language: "ja", texts: ["猫が好きです", "今日ね税理士さんと"], limit: 5});
  // Counted: 猫, 好き, 今日, ね? (an interjection-like particle is not counted), 税理士; さん, が, です, と are not.
  assert.deepEqual(coverage.words, {counted: 4, distinct: 4});
  assert.equal(coverage.coverage.known, 25);
  assert.equal(coverage.coverage.new, 75);
  assert.deepEqual(coverage.unknown_words.map((word: any) => word.word).sort(), ["今日", "好き", "税理士"]);
  assert.deepEqual(coverage.unknown_words.find((word: any) => word.word === "今日").levels, {jlpt: "N5", freq_rank: 2, freq_zipf: 5.5});
});

test("set_word_levels writes through the store with one time, and known_words and analyze_text read it back", async () => {
  const {call, writes} = await toolsWith();
  const answer = await call("set_word_levels", {language: "ja", words: [{word: "税理士", level: "learning"}, {word: " 猫 ", level: "new"}]});
  assert.deepEqual(answer.words, [{word: "税理士", level: "learning", previous: "new"}, {word: "猫", level: "new", previous: "known"}]);
  assert.deepEqual(writes, [{code: "ja", entries: {税理士: {level: 1, updTime: 1_000_000}, 猫: {level: 0, updTime: 1_000_000}}}]);
  const known = await call("known_words", {language: "ja", level: "all"});
  assert.deepEqual(known.words, [{word: "税理士", level: "learning", updated_ms: 1_000_000, updated: new Date(1_000_000).toISOString()}]);
  assert.deepEqual(known.total, {learning: 1, known: 0});
  const tokens = (await call("analyze_text", {language: "ja", detail: "full", text: "税理士"})).tokens;
  assert.equal(tokens[0].saved, "learning");
  await assert.rejects(call("set_word_levels", {language: "ja", words: [{word: "、", level: "known"}]}), rejects(400, /must hold a letter or digit/));
});

test("known_words pages through the saved words, newest first", async () => {
  const many: SavedWords = Object.fromEntries(Array.from({length: 5}, (_, index) => [`語${index}`, {level: 2, updTime: index + 1}]));
  const {call} = await toolsWith({savedWords: async () => many});
  const first = await call("known_words", {language: "ja", level: "known", limit: 2});
  assert.deepEqual(first.words.map((word: any) => word.word), ["語4", "語3"]);
  assert.equal(first.next_offset, 2);
  const last = await call("known_words", {language: "ja", level: "known", limit: 2, offset: 4});
  assert.deepEqual(last.words.map((word: any) => word.word), ["語0"]);
  assert.equal(last.next_offset, undefined);
});

test("conjugate gives the dictionary form, the ladder and the forms of a verb", async () => {
  const {call} = await toolsWith();
  const answer = await call("conjugate", {word: "行かなかった"});
  assert.equal(answer.dictionary_form, "行く");
  assert.equal(answer.entry_id, "1578850");
  assert.equal(answer.reading, "いく");
  assert.ok(Array.isArray(answer.ladder) && answer.ladder.length > 0);
  assert.ok(answer.forms.length > 0 && answer.forms.every((form: any) => typeof form.label === "string"));
  await assert.rejects(call("conjugate", {word: "猫"}), rejects(404, /not a verb or adjective/));
});

test("romanize spells each language the stable way", async () => {
  const {call} = await toolsWith();
  assert.equal((await call("romanize", {language: "ja", text: "今日ね、猫が好きです。"})).romanized, "kyou ね, neko ga suki desu.");
  assert.equal((await call("romanize", {language: "zh-Hans", text: "没想到，龙王的命令"})).romanized, "méixiǎngdào, lóngwáng 的 mìnglìng");
  assert.equal((await call("romanize", {language: "yue", text: "佢哋今日去咗飲茶"})).romanized, "keoi5 dei6 gam1 jat6 heoi3 zo2 jam2 caa4");
  assert.equal((await call("romanize", {language: "vi", text: "Tiếng Việt rất hay"})).romanized, "Tieng Viet rat hay");
});

test("a named language loads that language's engine, not the player's", async () => {
  const {call, loaded} = await toolsWith();
  await call("lookup_word", {language: "yue", word: "飲茶"});
  await call("analyze_text", {language: "zh-Hant", detail: "full", text: "我們"});
  assert.deepEqual(loaded, ["yue", "zh-Hant"]);
});
