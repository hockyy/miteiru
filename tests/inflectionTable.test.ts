import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInflectionTable,
  classifyInflectionKind,
  isIchidanVerb,
  resolveDictionaryForm,
} from "../main/handler/languages/inflectionTable";

test("classifyInflectionKind detects verbs and adjectives from JMDict POS tags", () => {
  assert.equal(classifyInflectionKind(["v5u"]), "verb");
  assert.equal(classifyInflectionKind(["v1"]), "verb");
  assert.equal(classifyInflectionKind(["adj-i"]), "i-adjective");
  assert.equal(classifyInflectionKind(["adj-na"]), "na-adjective");
  assert.equal(classifyInflectionKind(["n"]), null);
});

test("isIchidanVerb recognizes ichidan tags", () => {
  assert.equal(isIchidanVerb(["v1"]), true);
  assert.equal(isIchidanVerb(["v5u"]), false);
});

test("resolveDictionaryForm strips trailing na for na-adjectives", () => {
  assert.equal(resolveDictionaryForm("静かな", "静かな", "na-adjective"), "静か");
  assert.equal(resolveDictionaryForm("静か", "静か", "na-adjective"), "静か");
});

test("buildInflectionTable builds ichidan verb rows and deconjugation ladder", () => {
  const table = buildInflectionTable({
    term: "食べた",
    dictionaryForm: "食べる",
    posTags: ["v1", "vt"],
  });

  assert.ok(table);
  assert.equal(table.kind, "verb");
  assert.equal(table.dictionaryForm, "食べる");
  assert.equal(table.isInflected, true);
  assert.ok(table.rows.some((row) => row.id === "te" && row.forms.includes("食べて")));
  assert.ok(table.rows.some((row) => row.id === "polite" && row.forms.includes("食べます")));
  assert.equal(table.ladder[0]?.surface, "食べた");
  assert.equal(table.ladder.at(-1)?.surface, "食べる");
});

test("buildInflectionTable builds godan verb rows", () => {
  const table = buildInflectionTable({
    term: "書く",
    dictionaryForm: "書く",
    posTags: ["v5k", "vt"],
  });

  assert.ok(table);
  assert.ok(table.rows.some((row) => row.id === "te" && row.forms.includes("書いて")));
  assert.ok(table.rows.some((row) => row.id === "past" && row.forms.includes("書いた")));
});

test("buildInflectionTable builds i-adjective rows", () => {
  const table = buildInflectionTable({
    term: "高くない",
    dictionaryForm: "高い",
    posTags: ["adj-i"],
  });

  assert.ok(table);
  assert.equal(table.kind, "i-adjective");
  assert.ok(table.rows.some((row) => row.id === "negative" && row.forms.includes("高くない")));
  assert.ok(table.isInflected);
});

test("buildInflectionTable builds na-adjective rows", () => {
  const table = buildInflectionTable({
    term: "静か",
    dictionaryForm: "静か",
    posTags: ["adj-na"],
  });

  assert.ok(table);
  assert.equal(table.kind, "na-adjective");
  assert.ok(table.rows.some((row) => row.id === "attributive" && row.forms.includes("静かな")));
  assert.ok(table.rows.some((row) => row.id === "plain" && row.forms.includes("静かです")));
});

test("buildInflectionTable returns null for non-inflecting POS", () => {
  assert.equal(
    buildInflectionTable({ term: "本", dictionaryForm: "本", posTags: ["n"] }),
    null,
  );
});
