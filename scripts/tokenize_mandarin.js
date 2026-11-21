/**
 * Segment Mandarin with Miteiru's Rust addon and annotate each word with numbered pinyin.
 *
 *   node scripts/miteiru-mcp.mjs --build
 *   node scripts/tokenize_mandarin.js input.json output.json
 */
const fs = require("fs");
const path = require("path");
const { defaultAddonPath, loadAddon } = require("../main/headless/nativeAddon.ts");

const dictPath = path.join(
  __dirname,
  "../renderer/public/language-assets/mandarin/chinese/zh.jieba.txt"
);

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
  // The standalone tokenizer reads each word in isolation. One batch preserves those boundaries.
  const words = texts.map(text => String(text) ? addon.jiebaCut(dictPath, String(text), true) : []);
  const readings = addon.pinyinReadingsBatch(words.flat(), false, false);
  let offset = 0;
  const results = texts.map((text, i) => ({
    text,
    tokens: words[i].map(origin => {
      const row = readings[offset++].split(" ");
      return {
        origin, pinyin: row.join(" "),
        separation: Array.from(origin, (main, j) => ({main, pinyin: row[j]})),
      };
    }),
  }));
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
