import assert from "node:assert/strict";
import {test} from "node:test";
import {isAllCapsLine, normalizeCapitalization} from "../main/helpers/subtitleCapitalization";

test("normalizeCapitalization sentence-cases all-caps lines", () => {
  assert.equal(normalizeCapitalization("WHERE ARE YOU GOING?"), "Where are you going?");
  assert.equal(normalizeCapitalization("TÔI YÊU VIỆT NAM"), "Tôi yêu việt nam");
});

test("normalizeCapitalization leaves mixed-case and non-Latin lines alone", () => {
  assert.equal(normalizeCapitalization("Tôi yêu Việt Nam"), "Tôi yêu Việt Nam");
  assert.equal(normalizeCapitalization("Hello, I am Bob from NASA."), "Hello, I am Bob from NASA.");
  assert.equal(normalizeCapitalization("NHK ニュースです"), "NHK ニュースです");
  assert.equal(normalizeCapitalization("我爱 KTV"), "我爱 KTV");
  assert.equal(normalizeCapitalization("I"), "I");
});

test("normalizeCapitalization only touches the all-caps lines of a cue", () => {
  assert.equal(normalizeCapitalization("- WHAT?\n- Nothing, Sarah."), "- What?\n- Nothing, Sarah.");
  assert.equal(normalizeCapitalization("- WHAT?\n- NOTHING."), "- What?\n- Nothing.");
});

test("normalizeCapitalization keeps a sentence running across line breaks lowercase", () => {
  assert.equal(normalizeCapitalization("I WENT TO THE\r\nSTORE YESTERDAY."), "I went to the\nstore yesterday.");
  assert.equal(normalizeCapitalization("WAIT.\nCOME BACK!"), "Wait.\nCome back!");
});

test("normalizeCapitalization ignores subtitle markup when judging and casing", () => {
  assert.equal(isAllCapsLine("<i>WHERE ARE YOU?</i>"), true);
  assert.equal(normalizeCapitalization("<i>WHERE ARE YOU?</i>"), "<i>Where are you?</i>");
  assert.equal(normalizeCapitalization("{\\an8}HELLO THERE"), "{\\an8}Hello there");
});
