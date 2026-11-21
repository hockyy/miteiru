import fs from "node:fs";
import path from "node:path";

/** The subtitle fixtures in full, including the gold text and dictionary exceptions in the review files. */
export function chineseReadingCorpus(): string[] {
  const root = path.resolve("tests/fixtures");
  const lines = (file: string) => fs.readFileSync(path.join(root, file), "utf8").trimEnd().split(/\r?\n/);
  const files = (dir: string, extension: string) => fs.readdirSync(path.join(root, dir))
    .filter(name => name.endsWith(extension)).sort().map(name => `${dir}/${name}`);
  const jsonl = [...files("tokenizer-eval", ".jsonl"), "japanese-readings/gold.jsonl"];
  const corpus = jsonl.flatMap(file => lines(file).map(line => {
    const row = JSON.parse(line);
    const text = row.text ?? row.gold?.join("") ?? row.token;
    if (typeof text !== "string") throw new Error(`Missing text in ${file}: ${line}`);
    return text;
  }));
  corpus.push(...[...files("chinese-tokenizer", ".txt"), "japanese-subtitles.txt"].flatMap(lines));
  corpus.push(
    "", " \t\n", "abc XYZ", "123４５６", "。！？——…", "🙂𠮷𠵱龍🐉", "字幕Wi-Fi 42🙂かな한글",
    "我吃了饭，我们的银行行长还在重庆出差。", "我吃了飯，我們的銀行行長還在重慶出差。",
    "什麼時候可以聽音樂？", "音乐节的乐队很快乐。", "咁啱老世要求佢等陣要開會。",
    "長大以後睇住佢，行入銀行。", "瓩粁𠮷𠵱", "银行行长要开会，佢話一陣就到🙂。".repeat(256)
  );
  return corpus;
}
