/**
 * Same Mandarin tokenizer as Miteiru: Jieba + pinyin-pro (toneType num).
 *
 *   node scripts/tokenize_mandarin.js input.json output.json
 */
const fs = require("fs");
const path = require("path");
const { Jieba } = require("@node-rs/jieba");
const { pinyin } = require("pinyin-pro");

const dictPath = path.join(
  __dirname,
  "../renderer/public/language-assets/mandarin/chinese/zh.jieba.txt"
);

function tokenize(sentence, jieba) {
  if (!sentence) return [];
  return jieba.cut(sentence).map((word) => {
    const pinyinInfo = pinyin(word, { toneType: "num", type: "all" });
    return {
      origin: word,
      pinyin: pinyinInfo.map((info) => info.pinyin).join(" "),
      separation: pinyinInfo.map((info) => ({
        main: info.origin,
        pinyin: info.pinyin,
      })),
    };
  });
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node tokenize_mandarin.js input.json output.json");
  }
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const texts = Array.isArray(parsed) ? parsed : parsed.texts;
  if (!Array.isArray(texts)) {
    throw new Error("Expected JSON array of strings");
  }
  const jieba = Jieba.withDict(fs.readFileSync(dictPath));
  const results = texts.map((text) => ({
    text,
    tokens: tokenize(String(text), jieba),
  }));
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
}

main();
