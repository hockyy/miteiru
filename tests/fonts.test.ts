import assert from "node:assert/strict";
import {test} from "node:test";
import {
  buildFontItems,
  DEFAULT_SUBTITLE_FONT,
  firstFontFamily,
  fontLabel,
  fontStackFor,
  listInstalledFonts,
  SUBTITLE_FONT_OPTIONS,
  withCurrentDefaultFont
} from "../renderer/utils/fonts";
import {defaultPrimarySubtitleStyling} from "../renderer/utils/CJKStyling";

test("a chosen font falls back to the bundled Noto for characters it lacks", () => {
  assert.equal(fontStackFor("UD Digi Kyokasho N"), '"UD Digi Kyokasho N", var(--miteiru-cjk-font), sans-serif');
  // A typed name cannot break out of its quotes.
  assert.equal(fontStackFor('Evil", serif'), '"Evil, serif", var(--miteiru-cjk-font), sans-serif');
});

test("the picker shows an option's label, or a stack's first family", () => {
  assert.equal(fontLabel(DEFAULT_SUBTITLE_FONT, SUBTITLE_FONT_OPTIONS), "Noto Sans · matches the language");
  assert.equal(fontLabel(fontStackFor("Noto Sans SC Variable"), SUBTITLE_FONT_OPTIONS), "Noto Sans SC");
  assert.equal(fontLabel('"Some Font", sans-serif', SUBTITLE_FONT_OPTIONS), "Some Font");
  assert.equal(firstFontFamily("Arial, Hiragino Sans, Meiryo, sans-serif"), "Arial");
  assert.equal(firstFontFamily("'Yu Gothic'"), "Yu Gothic");
});

test("subtitle styles saved with the old Arial default move to the bundled default; others stay", () => {
  assert.equal(defaultPrimarySubtitleStyling.text.fontFamily, DEFAULT_SUBTITLE_FONT);
  const legacy = {...defaultPrimarySubtitleStyling, text: {...defaultPrimarySubtitleStyling.text, fontFamily: "Arial"}};
  const migrated = withCurrentDefaultFont(legacy);
  assert.equal(migrated.text.fontFamily, DEFAULT_SUBTITLE_FONT);
  assert.equal(legacy.text.fontFamily, "Arial", "the stored object is not changed in place");
  const chosen = {...legacy, text: {...legacy.text, fontFamily: '"Comic Sans MS", sans-serif'}};
  assert.equal(withCurrentDefaultFont(chosen), chosen);
  assert.equal(withCurrentDefaultFont(null as never), null);
});

test("installed fonts are listed once each, sorted, and empty where the system can't tell", async () => {
  const globalWithWindow = globalThis as unknown as { window?: unknown };
  globalWithWindow.window = {};
  try {
    assert.deepEqual(await listInstalledFonts(), []);
    globalWithWindow.window = {
      queryLocalFonts: async () => [{family: "Meiryo"}, {family: "Arial"}, {family: "Meiryo"}]
    };
    assert.deepEqual(await listInstalledFonts(), ["Arial", "Meiryo"]);
  } finally {
    delete globalWithWindow.window;
  }
});

test("the picker lists installed recommendations once, other installed fonts, then a typed name", () => {
  const installed = ["Arial", "Meiryo", "UD Digi Kyokasho N", "UD Digi Kyokasho NP"];
  const all = buildFontItems(SUBTITLE_FONT_OPTIONS, installed, "");
  const labels = all.recommended.map(({label}) => label);
  assert.ok(labels.includes("Noto Sans JP") && labels.includes("UD Digi Kyokasho") && labels.includes("Meiryo"));
  assert.ok(!labels.includes("Hiragino Sans"), "recommended fonts that are not installed are left out");
  assert.deepEqual(all.others.map(({label}) => label), ["Arial", "UD Digi Kyokasho NP"], "recommended families are not repeated");
  assert.deepEqual(all.custom, []);

  const typed = buildFontItems(SUBTITLE_FONT_OPTIONS, installed, "kyo");
  assert.deepEqual(typed.recommended.map(({label}) => label), ["UD Digi Kyokasho"]);
  assert.deepEqual(typed.others.map(({label}) => label), ["UD Digi Kyokasho NP"]);
  assert.equal(typed.custom[0].label, "kyo");
  // An installed or recommended family is chosen from its own entry, not offered again as typed.
  assert.deepEqual(buildFontItems(SUBTITLE_FONT_OPTIONS, installed, "UD Digi Kyokasho N").custom, []);
  assert.deepEqual(buildFontItems(SUBTITLE_FONT_OPTIONS, installed, "Arial").custom, []);

  // Without the installed list (API unavailable), every recommendation is offered.
  assert.equal(buildFontItems(SUBTITLE_FONT_OPTIONS, [], "").recommended.length, SUBTITLE_FONT_OPTIONS.length);
});
