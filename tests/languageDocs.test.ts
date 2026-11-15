import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {mcpDefinitions} from "../main/mcp/protocol";

const read = (file: string) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// Bug fix: README_LANGUAGES.md still described Kuromoji as the Japanese tokenizer long after Miteiru's
// own Rust tokenizer replaced it, and listed a dictionary (CC-Canto) and folders that don't exist.
test("README_LANGUAGES.md describes the tokenizers and dictionaries Miteiru uses", () => {
  const readme = read("README_LANGUAGES.md");
  assert.doesNotMatch(readme, /Tokenizer\*\*:\s*Kuromoji/i);
  assert.doesNotMatch(readme, /CC-Canto\b/);
  assert.match(readme, /Rust tokenizer/);
  assert.match(readme, /native\/rust\/crates\/miteiru-tokenizer/);
  for (const dictionary of ["JMdict", "KANJIDIC2", "CC-CEDICT", "CantoDict", "VNEDict"]) assert.match(readme, new RegExp(dictionary));
  assert.ok(fs.existsSync(path.join(__dirname, "..", "native", "rust", "crates", "miteiru-tokenizer")), "the crate the README names exists");
});

test("docs/LOCAL_API.md documents every MCP tool, the language codes and the headless command", () => {
  const docs = read("docs/LOCAL_API.md");
  for (const tool of mcpDefinitions.tools as Array<{name: string}>) {
    assert.match(docs, new RegExp(`\\| \`${tool.name}\` \\|`), `${tool.name} is in the tools table`);
  }
  for (const name of ["lookup_word", "lookup_character", "readings", "text_coverage", "known_words", "set_word_levels", "conjugate", "romanize"]) {
    assert.match(docs, new RegExp(`### \`${name}\``), `${name} has its own section`);
  }
  for (const language of ["ja", "zh-Hans", "zh-Hant", "yue", "vi"]) assert.match(docs, new RegExp(`\\| \`${language}\` \\|`));
  assert.match(docs, /node <repo>\/scripts\/miteiru-mcp\.mjs/);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "scripts", "miteiru-mcp.mjs")), "the documented command exists");
});
