import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeAnkiFilename } from "../main/helpers/ankiImportReveal";

test("sanitizeAnkiFilename keeps basename and strips unsafe characters", () => {
  assert.equal(sanitizeAnkiFilename("folder/evil name?.tsv"), "evil_name_.tsv");
  assert.equal(sanitizeAnkiFilename(""), "miteiru_anki_import.tsv");
});
