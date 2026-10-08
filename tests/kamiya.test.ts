import assert from "node:assert/strict";
import { test } from "node:test";
import { conjugate, conjugateAuxiliaries, verbDeconjugate } from "../main/handler/languages/kamiya";

test("kamiya volitional appends う only to godan stems", () => {
  assert.deepEqual(conjugate("書く", "Volitional"), ["書こ", "書こう"]);
  assert.deepEqual(conjugate("食べる", "Volitional", true), ["食べよう"]);
  assert.deepEqual(conjugate("来る", "Volitional", true), ["来よう"]);
  assert.deepEqual(conjugate("する", "Volitional", true), ["しよう"]);
  assert.deepEqual(conjugateAuxiliaries("見る", ["SeruSaseru"], "Volitional", true), ["見させよう"]);
});

test("kamiya potential follows the verb class", () => {
  assert.deepEqual(conjugateAuxiliaries("読む", ["Potential"], "Dictionary"), ["読める"]);
  assert.deepEqual(conjugateAuxiliaries("食べる", ["Potential"], "Dictionary", true), ["食べられる", "食べれる"]);
  assert.deepEqual(conjugateAuxiliaries("来る", ["Potential"], "Dictionary", true), ["来られる", "来れる"]);
  assert.deepEqual(conjugateAuxiliaries("する", ["Potential"], "Dictionary", true), ["できる"]);
  assert.ok(conjugateAuxiliaries("食べる", ["Potential", "Masu"], "Negative", true).includes("食べられません"));
});

test("kamiya deconjugates standard and colloquial ichidan potentials", () => {
  const hasPotential = (form: string, verb: string) => verbDeconjugate(form, verb, true, 1)
    .some((hit) => hit.auxiliaries.join() === "Potential" && hit.conjugation === "Dictionary");
  assert.ok(hasPotential("食べられる", "食べる"));
  assert.ok(hasPotential("食べれる", "食べる"));
  assert.ok(hasPotential("できる", "する"));
});
