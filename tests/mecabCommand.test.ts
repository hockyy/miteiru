import assert from "node:assert/strict";
import {test} from "node:test";
import {resolveMecabCommand} from "../main/helpers/mecabCommand";

test("resolveMecabCommand uses the configured MeCab path when it exists", () => {
  const exists = (candidate: string) => candidate === "/opt/homebrew/bin/mecab";
  assert.equal(resolveMecabCommand(" /opt/homebrew/bin/mecab ", exists), "/opt/homebrew/bin/mecab");
});

test("resolveMecabCommand falls back to mecab on PATH", () => {
  const exists = () => false;
  assert.equal(resolveMecabCommand("C:\Program Files (x86)\MeCab\bin\mecab.exe", exists), "mecab");
  assert.equal(resolveMecabCommand(undefined, exists), "mecab");
  assert.equal(resolveMecabCommand("   ", () => true), "mecab");
});
