/*
 * Prints the first `queryJapanese` result for frequent lookups as it was before (the first few
 * reading matches, sorted by queryJapanese's original comparator) and as it is now (searchJapanese),
 * marking the words where they differ.
 *
 *   npx tsx scripts/evaluateJmdictRanking.ts <jmdict-db directory> [--holdout]
 *
 * Point it at a jmdict-db the app built, copied out of a profile while the app is closed (LevelDB
 * allows one process at a time, and opening a database can rewrite its log). --holdout runs words
 * that were not used to design the ranking.
 */
import fs from "node:fs";
import path from "node:path";
import {getJmdictTags, kanjiBeginning, readingBeginning, setupJmdict, type JmdictWord} from "../main/dictionary/jmdictDb";
import {searchJapanese} from "../main/handler/languages/learningGlosses";

// What a learner clicks or types most: frequent dictionary forms, function words and kanji.
const TERMS = [
  "する", "なる", "ある", "いる", "ない", "この", "その", "あの", "どの", "これ", "それ", "ちょっと", "よう", "こと", "もの",
  "いい", "よい", "いく", "くる", "みる", "おく", "しまう", "もらう", "くれる", "あげる", "できる", "わかる", "いう", "おもう", "かう",
  "まだ", "もう", "また", "ずっと", "やっぱり", "すごい", "かわいい", "だめ", "ほんとう", "だいじょうぶ", "ありがとう", "すみません", "はい", "いいえ",
  "人", "日本", "日", "時", "事", "物", "今", "何", "一", "二", "三", "大", "中", "上", "下", "前", "後", "方", "所", "気", "目", "手", "心",
  "見る", "言う", "行く", "来る", "思う", "知る", "分かる", "食べる", "飲む", "聞く", "話す", "書く", "読む", "待つ", "使う", "出る", "入る",
  "大きい", "小さい", "新しい", "好き", "本当", "大丈夫", "先生", "学校", "友達", "時間", "今日", "明日", "家", "水", "金", "生"
];

const HOLDOUT = [
  "ところ", "とき", "ため", "みんな", "わたし", "あなた", "かれ", "ほか", "まえ", "うえ", "なか", "あと", "ひと", "かた", "ほう",
  "でる", "はいる", "つく", "とる", "かける", "きる", "あう", "あく", "やる", "あける", "つける", "ひく", "かえる", "はな", "あめ",
  "かみ", "はし", "き", "め", "て", "ひ", "つき", "上手", "下手", "生活", "仕事", "会社", "電話", "毎日", "自分", "大切", "簡単",
  "月", "火", "木", "花", "雨", "空", "山", "川", "車", "道", "声", "顔", "話", "国", "外", "内", "間", "体", "力", "名前"
];

// The meaning panel's lookup: queryJapanese(term, 5).
const LIMIT = 5;

/** queryJapanese's comparator before rankJapaneseMatches, kept as it was apart from the tag lookups. */
const legacyRank = (input: JmdictWord[], query: string, tags: Record<string, string>) => {
  const ids = input.map((word) => word.id);
  const partOfSpeech = (word: JmdictWord) => tags[word.sense[0]?.partOfSpeech[0]] ?? "";
  const matches = input.filter(({id}, index) => !ids.includes(id, index + 1)).sort((a, b) => {
    const commonA = a.kanji.length ? +a.kanji[0].common : 0;
    const commonB = b.kanji.length ? +b.kanji[0].common : 0;
    if (commonA !== commonB) return commonB - commonA;
    // Subtracting two spellings gave NaN, which sort treats as "equal", so only equal spellings went on.
    const spellingA = a.kanji.length ? a.kanji[0].text : 0;
    const spellingB = b.kanji.length ? b.kanji[0].text : 0;
    if (spellingA !== spellingB) return 0;
    const notVerb = +!partOfSpeech(a).includes("verb") - +!partOfSpeech(b).includes("verb");
    if (notVerb) return notVerb;
    const notNoun = +!partOfSpeech(a).includes("noun") - +!partOfSpeech(b).includes("noun");
    if (notNoun) return notNoun;
    return a.kanji.length - b.kanji.length;
  });
  const exact = matches.findIndex((word) => word.kanji.some((kanji) => kanji.text === query));
  if (exact > 0) [matches[0], matches[exact]] = [matches[exact], matches[0]];
  return matches;
};

const describe = (word: JmdictWord | undefined) => word
  ? `${word.kanji[0]?.text ?? word.kana[0]?.text}【${word.kana[0]?.text ?? ""}】${word.sense[0]?.gloss[0]?.text ?? ""}`.slice(0, 40)
  : "(none)";

const main = async () => {
  const [dbPath, ...flags] = process.argv.slice(2);
  // Opening a directory that is not a LevelDB database would create one there.
  if (!dbPath || !fs.existsSync(path.join(dbPath, "CURRENT"))) {
    console.error("Usage: npx tsx scripts/evaluateJmdictRanking.ts <jmdict-db directory> [--holdout]");
    process.exit(1);
  }
  const {db} = await setupJmdict(dbPath);
  try {
    const tags = await getJmdictTags(db);
    let changed = 0;
    const terms = flags.includes("--holdout") ? HOLDOUT : TERMS;
    for (const term of terms) {
      // Before, queryJapanese read only the first LIMIT reading matches, which can all be rare words.
      const [readings, spellings] = await Promise.all([readingBeginning(db, term, LIMIT), kanjiBeginning(db, term)]);
      const before = describe(legacyRank([...readings, ...spellings], term, tags)[0]);
      const after = describe((await searchJapanese(db, term, LIMIT))[0]);
      if (before !== after) changed++;
      console.log(`${before === after ? " " : "*"} ${term.padEnd(8, "　")} old: ${before.padEnd(42)} new: ${after}`);
    }
    console.log(`${changed} of ${terms.length} first results changed`);
  } finally {
    await db.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
