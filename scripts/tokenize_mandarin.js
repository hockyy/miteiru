/**
 * Segment Mandarin with Miteiru's Rust addon and annotate each word with numbered pinyin.
 *
 *   node scripts/miteiru-mcp.mjs --build
 *   node scripts/tokenize_mandarin.js input.json output.json
 */
const fs = require("fs");
const path = require("path");
const { defaultAddonPath, loadAddon } = require("../main/headless/nativeAddon.ts");
const { pinyin } = require("pinyin-pro");

const dictPath = path.join(
  __dirname,
  "../renderer/public/language-assets/mandarin/chinese/zh.jieba.txt"
);

function tokenize(sentence, addon) {
  if (!sentence) return [];
  return addon.jiebaCut(dictPath, sentence, true).map((word) => {
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

async function main() {
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
  const addon = loadAddon(defaultAddonPath(path.resolve(__dirname, "..")));
  await addon.jiebaLoad(dictPath, dictPath);
  const results = texts.map((text) => ({
    text,
    tokens: tokenize(String(text), addon),
  }));
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
