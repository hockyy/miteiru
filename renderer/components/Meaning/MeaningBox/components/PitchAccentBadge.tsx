import React, { useEffect, useMemo, useState } from 'react';
import {
  classifyAccent,
  isMoraHigh,
  loadPitchAccentMap,
  lookupPitchAccent,
  PITCH_PATTERN_LABEL,
  splitIntoMorae,
  toHiraganaSafe,
  type PitchPattern,
} from '../../../../utils/pitchAccent';

const PILL_CLASS: Record<PitchPattern, string> = {
  heiban: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  atamadaka: 'border-rose-300 bg-rose-100 text-rose-800',
  nakadaka: 'border-amber-300 bg-amber-100 text-amber-900',
  odaka: 'border-violet-300 bg-violet-100 text-violet-800',
};

type PitchAccentBadgeProps = {
  surface: string;
  reading: string;
};

/** Pitch accent indicator for Japanese headwords: H/L mora strip + pattern pill. */
export const PitchAccentBadge = ({ surface, reading }: PitchAccentBadgeProps) => {
  const [accents, setAccents] = useState<number[] | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSelected(0);
    if (!surface || !reading) {
      setAccents(null);
      return;
    }
    loadPitchAccentMap().then((map) => {
      if (cancelled) return;
      setAccents(map ? lookupPitchAccent(map, surface, reading) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [surface, reading]);

  const morae = useMemo(() => splitIntoMorae(toHiraganaSafe(reading)), [reading]);

  if (!accents?.length || morae.length === 0) return null;

  const accent = accents[Math.min(selected, accents.length - 1)];
  const pattern = classifyAccent(accent, morae.length);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span
        className="flex items-end text-base leading-none"
        title={`Pitch accent: ${PITCH_PATTERN_LABEL[pattern]} [${accent}]`}
      >
        {morae.map((mora, idx) => {
          const high = isMoraHigh(accent, idx + 1);
          const isNucleus = accent > 0 && idx + 1 === accent;
          return (
            <React.Fragment key={idx}>
              <span
                className={`border-t-2 px-0.5 ${
                  high
                    ? 'border-rose-500 text-rose-600'
                    : 'border-transparent text-sky-700'
                }`}
              >
                {mora}
              </span>
              {isNucleus && (
                <span className="-ml-0.5 text-[10px] text-rose-500">▼</span>
              )}
            </React.Fragment>
          );
        })}
      </span>

      {accents.map((value, idx) => {
        const variantPattern = classifyAccent(value, morae.length);
        const active = idx === selected;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setSelected(idx)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight transition-opacity ${
              PILL_CLASS[variantPattern]
            } ${active ? '' : 'opacity-45 hover:opacity-80'}`}
            title={`${PITCH_PATTERN_LABEL[variantPattern]} (accent ${value})`}
          >
            {PITCH_PATTERN_LABEL[variantPattern]} {value}
          </button>
        );
      })}
    </div>
  );
};
