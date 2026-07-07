import React from 'react';
import {
  MEANING_READING_BUBBLE,
  MEANING_READING_BUBBLE_CHARACTER,
} from '../../../meaningBoxTheme';

type BubbleEntryReadingProps = {
  readings: unknown[] | null | undefined;
  /** Defaults to the standard blue reading chip style. */
  bubbleClass?: string;
};

/** Renders a row of small pill chips (readings, tags, links, etc.). */
export const BubbleEntryReading = ({
  readings,
  bubbleClass = MEANING_READING_BUBBLE,
}: BubbleEntryReadingProps) => (
  <div className="flex flex-wrap gap-2">
    {readings?.map((value, index) => {
      if (!value) {
        return null;
      }
      return (
        <div key={`bubble-${index}`} className={bubbleClass}>
          {value as React.ReactNode}
        </div>
      );
    })}
  </div>
);

export const CHARACTER_FIELD_ROW_CLASS =
  'flex flex-row flex-wrap gap-2 text-red-700 text-sm font-semibold';

export const CHARACTER_FIELD_LABEL_CLASS = 'shrink-0 font-bold capitalize text-red-800';

type EntryFieldListProps = {
  fields: Record<string, unknown>;
  bubbleClass?: string;
  /** When true, skip empty arrays (used by Hanzi metadata rows). */
  skipEmptyArrays?: boolean;
};

/**
 * Label + chip rows for kanji/hanzi detail sections (readings, links, mnemonics, …).
 * Shared by {@link KanjiEntry} and {@link HanziEntry}.
 */
export const EntryFieldList = ({
  fields,
  bubbleClass = MEANING_READING_BUBBLE_CHARACTER,
  skipEmptyArrays = false,
}: EntryFieldListProps) => (
  <>
    {Object.entries(fields).map(([label, value], index) => {
      if (skipEmptyArrays && Array.isArray(value) && value.filter(Boolean).length === 0) {
        return null;
      }
      if (!value) {
        return null;
      }

      return (
        <div key={index} className={CHARACTER_FIELD_ROW_CLASS}>
          <div className={CHARACTER_FIELD_LABEL_CLASS}>{label}:</div>
          <BubbleEntryReading readings={value as unknown[]} bubbleClass={bubbleClass} />
        </div>
      );
    })}
  </>
);
