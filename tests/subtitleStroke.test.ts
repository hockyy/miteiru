import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {getTextShadowFromStroke, SUBTITLE_STROKE_BASE_WIDTH} from '../renderer/utils/subtitleStroke';

describe('getTextShadowFromStroke', () => {
  it('returns none for zero or invalid width', () => {
    assert.equal(getTextShadowFromStroke('0px', '#000'), 'none');
    assert.equal(getTextShadowFromStroke('abc', '#000'), 'none');
  });

  it('builds crisp multi-direction shadows', () => {
    const shadow = getTextShadowFromStroke('0.22px', '#000000');
    assert.notEqual(shadow, 'none');
    assert.match(shadow, /0\.\d+px -?\d+\.\d+px 0 #000000/);
    assert.ok(shadow.split(', ').length >= 8);
  });

  it('adds inner ring for thicker strokes', () => {
    const thin = getTextShadowFromStroke(`${SUBTITLE_STROKE_BASE_WIDTH}px`, '#fff').split(', ').length;
    const thick = getTextShadowFromStroke('0.88px', '#fff').split(', ').length;
    assert.ok(thick > thin);
  });
});
