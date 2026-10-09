import assert from "node:assert/strict";
import path from "node:path";
import {test} from "node:test";
import {isConjugationOf} from "../main/handler/languages/verbConjugation";
import {parseJapaneseVerbs} from "../main/handler/languages/analyzer";
import Japanese from "../main/handler/japanese";

const CONJUGATIONS: Record<string, string[]> = {
  食べる: [
    "食べない", "食べなかった", "食べなくて", "食べなければ", "食べなきゃ", "食べないで", "食べず", "食べぬ", "食べん",
    "食べます", "食べました", "食べません", "食べませんでした", "食べましょう",
    "食べて", "食べた", "食べたら", "食べたり", "食べれば", "食べよう", "食べろ", "食べよ", "食べまい", "食べ",
    "食べられる", "食べられない", "食べれる", "食べさせる", "食べさせられた", "食べさせられなかった",
    "食べたい", "食べたくない", "食べたかった", "食べたがる", "食べながら", "食べなさい",
    "食べている", "食べてる", "食べていた", "食べてた", "食べています", "食べてます", "食べてません",
    "食べてしまう", "食べてしまった", "食べちゃう", "食べちゃった", "食べちまう", "食べておく", "食べとく",
    "食べてある", "食べてみる", "食べてください", "食べてほしい", "食べては", "食べちゃ", "食べても",
    "食べるね", "食べるよ", "食べるだろう", "食べるらしい", "食べるべきだ", "食べたよ", "食べただろう", "食べたらしい"
  ],
  書く: [
    "書かない", "書きます", "書いて", "書いた", "書ける", "書かれる", "書かせる", "書かせられる", "書かされる",
    "書こう", "書け", "書けば", "書いちゃう", "書いとく", "書いてる", "書き", "書かず", "書かん"
  ],
  泳ぐ: ["泳いで", "泳いだ", "泳がない", "泳げる", "泳いじゃった", "泳いどく"],
  話す: ["話して", "話した", "話さない", "話せる", "話そう", "話しちゃった"],
  待つ: ["待って", "待った", "待たない", "待てば", "待ってる"],
  死ぬ: ["死んで", "死んだ", "死なない", "死ねば"],
  遊ぶ: ["遊んで", "遊んだ", "遊ばない", "遊んじゃった", "遊んでる"],
  読む: ["読んで", "読んでる", "読んじゃう", "読まない", "読みたい", "読まれる"],
  帰る: ["帰らない", "帰って", "帰ります", "帰れる", "帰ろう"],
  買う: ["買わない", "買って", "買います", "買える", "買わされる"],
  行く: ["行って", "行った", "行かない", "行きます", "行ける", "行っちゃった"],
  ある: ["ない", "なかった", "あります", "ありません", "あって", "あった", "あれば"],
  する: ["しない", "します", "して", "した", "される", "させる", "させられる", "しよう", "しろ", "せよ", "すれば", "せず", "しちゃった"],
  勉強する: ["勉強しない", "勉強した", "勉強しています", "勉強させられた"],
  来る: ["来ない", "来ます", "来て", "来た", "来られる", "来れる", "来れば", "来い", "来よう", "来させる"],
  くる: ["こない", "きます", "きて", "きた", "こられる", "くれば", "こい", "こよう"],
  持って来る: ["持って来ない", "持って来た"],
  くださる: ["ください", "くださいます", "くださった", "くださらない"],
  いらっしゃる: ["いらっしゃいませ", "いらっしゃいます", "いらっしゃった"],
  問う: ["問うて", "問うた", "問わない"],
  くれる: ["くれ", "くれない", "くれた"],
  信ずる: ["信じない", "信ぜず", "信じます", "信じて", "信ずれば"],
  出来る: ["出来ない", "出来ます", "出来たがって", "出来なかった"]
};

test("isConjugationOf recognises regular and irregular conjugations", () => {
  for (const [base, forms] of Object.entries(CONJUGATIONS)) {
    assert.equal(isConjugationOf(base, base), true, base);
    for (const form of forms) assert.equal(isConjugationOf(form, base), true, `${form} ← ${base}`);
  }
});

test("isConjugationOf rejects other words and malformed conjugations", () => {
  const notConjugations: [string, string][] = [
    ["食べるので", "食べる"], ["食べるし", "食べる"], ["食べたべきだ", "食べる"], ["飲んだ", "食べる"],
    ["食べ食べ", "食べる"], ["書きない", "書く"], ["書きて", "書く"], ["行いて", "行く"],
    ["あらない", "ある"], ["来らない", "来る"], ["しる", "する"], ["", "食べる"], ["食べる", ""]
  ];
  for (const [surface, base] of notConjugations) assert.equal(isConjugationOf(surface, base), false, `${surface} ← ${base}`);
});

test("the analyzer groups a verb with its conjugation chain", async () => {
  Japanese.kuromojiDictPath = path.join(process.cwd(), "node_modules", "kuromoji", "dict");
  const tokenizer = await Japanese.loadKuromojiTokenizer();
  const group = async (sentence: string) => (await parseJapaneseVerbs(
    Japanese.processKuromojinToSeparations(tokenizer.tokenizeForSentence(sentence))
  )).map((token) => token.origin);

  assert.deepEqual(await group("寿司を食べられなかった。"), ["寿司", "を", "食べられなかった", "。"]);
  assert.deepEqual(await group("本を読んでいます"), ["本", "を", "読んでいます"]);
  assert.deepEqual(await group("もう帰ってました"), ["もう", "帰ってました"]);
  assert.deepEqual(await group("いらっしゃいませ"), ["いらっしゃいませ"]);
  assert.deepEqual(await group("明日は雨が降るだろう"), ["明日", "は", "雨", "が", "降るだろう"]);
  // ので / なら / し stay separate, as before.
  assert.deepEqual(await group("行くので"), ["行く", "ので"]);
});
