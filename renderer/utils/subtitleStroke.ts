import type {CSSProperties} from 'react';

/** Sub-pixel stroke slider values (e.g. 0.22) map to ~1px shadow radius. */
export const SUBTITLE_STROKE_BASE_WIDTH = 0.22;

/**
 * Faux text outline via multi-direction text-shadow.
 * Prefer this over -webkit-text-stroke on Windows/Electron — webkit stroke breaks on CJK ruby.
 */
export function getTextShadowFromStroke(strokeWidth: string, color: string): string {
  const sw = parseFloat(strokeWidth);
  if (!Number.isFinite(sw) || sw <= 0 || !color) {
    return 'none';
  }

  const radius = Math.max(0.5, sw / SUBTITLE_STROKE_BASE_WIDTH);
  const shadows: string[] = [];
  const steps = radius >= 2 ? 16 : 8;

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = (Math.cos(angle) * radius).toFixed(2);
    const y = (Math.sin(angle) * radius).toFixed(2);
    shadows.push(`${x}px ${y}px 0 ${color}`);
  }

  if (radius >= 2) {
    const inner = radius * 0.65;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = (Math.cos(angle) * inner).toFixed(2);
      const y = (Math.sin(angle) * inner).toFixed(2);
      shadows.push(`${x}px ${y}px 0 ${color}`);
    }
  }

  return shadows.join(', ');
}

/** Inline styles for subtitle outline — shadow only, no webkit stroke. */
export function getSubtitleOutlineStyle(
  stroke: { width: string; color: string },
): Pick<CSSProperties, 'WebkitTextStrokeWidth' | 'WebkitTextStrokeColor' | 'textShadow'> {
  return {
    WebkitTextStrokeWidth: 0,
    WebkitTextStrokeColor: 'transparent',
    textShadow: getTextShadowFromStroke(stroke.width, stroke.color),
  };
}
