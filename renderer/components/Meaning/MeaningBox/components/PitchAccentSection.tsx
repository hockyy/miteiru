import React, { useEffect, useMemo, useState } from 'react';
import {
  classifyAccent,
  isMoraHigh,
  isParticleHigh,
  loadPitchAccentMap,
  lookupPitchAccent,
  PITCH_PATTERN_EN,
  PITCH_PATTERN_LABEL,
  splitIntoMorae,
  toHiraganaSafe,
  type PitchAccentMap,
  type PitchPattern,
} from '../../../../utils/pitchAccent';
import { videoConstants } from '../../../../utils/constants';
import { MEANING_SECTION, MEANING_SECTION_LABEL } from '../../meaningBoxTheme';
import type { RomajiedGroup } from '../types';

const PILL_CLASS: Record<PitchPattern, string> = {
  heiban: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  atamadaka: 'border-rose-300 bg-rose-50 text-rose-700',
  nakadaka: 'border-amber-300 bg-amber-50 text-amber-800',
  odaka: 'border-violet-300 bg-violet-50 text-violet-700',
};

const CONTOUR_COLOR = '#e11d48';
const PARTICLE_COLOR = '#94a3b8';
const LABEL_COLOR = '#334155';

const MORA_W = 26;
const PAD_X = 14;
const HIGH_Y = 10;
const LOW_Y = 28;
const LABEL_Y = 45;
const HEIGHT = 50;

type PitchContourProps = {
  morae: string[];
  accent: number;
};

/** OJAD-style pitch contour: a line over per-mora dots, plus a hollow particle dot. */
export const PitchContour = ({ morae, accent }: PitchContourProps) => {
  const n = morae.length;
  const width = PAD_X * 2 + MORA_W * (n + 1);
  const x = (i: number) => PAD_X + MORA_W / 2 + MORA_W * i;
  const y = (high: boolean) => (high ? HIGH_Y : LOW_Y);

  const points = morae.map((_, i) => ({
    cx: x(i),
    cy: y(isMoraHigh(accent, i + 1)),
  }));
  const particle = { cx: x(n), cy: y(isParticleHigh(accent)) };
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label="Pitch accent contour"
      className="max-w-full"
    >
      <polyline
        points={points.map((p) => `${p.cx},${p.cy}`).join(' ')}
        fill="none"
        stroke={CONTOUR_COLOR}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={last.cx}
        y1={last.cy}
        x2={particle.cx}
        y2={particle.cy}
        stroke={PARTICLE_COLOR}
        strokeWidth={2}
        strokeDasharray="3 3"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={4.5} fill={CONTOUR_COLOR} />
      ))}
      <circle
        cx={particle.cx}
        cy={particle.cy}
        r={4}
        fill="#fff"
        stroke={PARTICLE_COLOR}
        strokeWidth={2}
      />
      {morae.map((mora, i) => (
        <text
          key={i}
          x={x(i)}
          y={LABEL_Y}
          textAnchor="middle"
          fontSize={13}
          fill={LABEL_COLOR}
        >
          {mora}
        </text>
      ))}
    </svg>
  );
};

type PitchVariant = {
  key: number;
  surface: string;
  reading: string;
};

const extractVariant = (group: RomajiedGroup): PitchVariant => ({
  key: group.key,
  surface: group.romajied.reduce((acc, token) => acc + token.origin, ''),
  reading: group.romajied
    .flatMap((token) =>
      Array.isArray(token?.separation)
        ? token.separation.map((part) => part?.hiragana ?? '')
        : [],
    )
    .join(''),
});

type PitchAccentRowProps = {
  variant: PitchVariant;
  accents: number[];
  showSurface: boolean;
};

/** One slim row: optional surface label + contour + pattern pills. */
const PitchAccentRow = ({ variant, accents, showSurface }: PitchAccentRowProps) => {
  const [selected, setSelected] = useState(0);
  const morae = useMemo(
    () => splitIntoMorae(toHiraganaSafe(variant.reading)),
    [variant.reading],
  );

  if (morae.length === 0) return null;

  const accent = accents[Math.min(selected, accents.length - 1)];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {showSurface && (
        <span className="text-sm font-semibold text-blue-950">{variant.surface}</span>
      )}
      <div className="max-w-full overflow-x-auto">
        <PitchContour morae={morae} accent={accent} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {accents.map((value, idx) => {
          const variantPattern = classifyAccent(value, morae.length);
          const active = idx === selected;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSelected(idx)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight transition-all ${
                PILL_CLASS[variantPattern]
              } ${active ? 'ring-1 ring-offset-1 ring-blue-300' : 'opacity-45 hover:opacity-90'}`}
              title={`${PITCH_PATTERN_EN[variantPattern]} — accent ${value}`}
            >
              {PITCH_PATTERN_LABEL[variantPattern]} {value}
            </button>
          );
        })}
      </div>
    </div>
  );
};

type PitchAccentSectionProps = {
  romajiedData: RomajiedGroup[];
  lang: string;
};

/** Scrollable-body section with pitch contours for each headword variant. */
export const PitchAccentSection = ({ romajiedData, lang }: PitchAccentSectionProps) => {
  const [map, setMap] = useState<PitchAccentMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (lang !== videoConstants.japaneseLang) return;
    loadPitchAccentMap().then((loaded) => {
      if (!cancelled) setMap(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const rows = useMemo(() => {
    if (!map) return [];
    return romajiedData
      .map(extractVariant)
      .map((variant) => ({
        variant,
        accents: variant.reading
          ? lookupPitchAccent(map, variant.surface, variant.reading)
          : null,
      }))
      .filter((row): row is { variant: PitchVariant; accents: number[] } =>
        Boolean(row.accents?.length),
      );
  }, [map, romajiedData]);

  if (lang !== videoConstants.japaneseLang || rows.length === 0) return null;

  return (
    <section className={MEANING_SECTION}>
      <div className={MEANING_SECTION_LABEL}>Pitch accent</div>
      <div className="space-y-2 px-4 py-3">
        {rows.map(({ variant, accents }) => (
          <PitchAccentRow
            key={variant.key}
            variant={variant}
            accents={accents}
            showSurface={rows.length > 1}
          />
        ))}
      </div>
    </section>
  );
};
