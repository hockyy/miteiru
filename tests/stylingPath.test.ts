import assert from "node:assert/strict";
import {test} from "node:test";
import {defaultPrimarySubtitleStyling, withStylingPath} from "../renderer/utils/CJKStyling";

test("withStylingPath sets a top-level or nested field on a copy", () => {
  const original = structuredClone(defaultPrimarySubtitleStyling);

  const larger = withStylingPath(original, "text.fontSize", "70px");
  assert.equal(larger.text.fontSize, "70px");
  assert.equal(larger.text.color, original.text.color);

  const meaningWeight = withStylingPath(original, "textMeaning.weight", 700);
  assert.equal(meaningWeight.textMeaning.weight, 700);

  const furiganaOff = withStylingPath(original, "showFurigana", false);
  assert.equal(furiganaOff.showFurigana, false);

  // React state must not change in place.
  assert.deepEqual(original, defaultPrimarySubtitleStyling);
  assert.notEqual(larger.text, original.text);
});
