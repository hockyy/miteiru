import React from 'react';
import {
  MEANING_ENTRY,
  MEANING_ENTRY_CHARACTER,
  MEANING_GLOSS,
  MEANING_GLOSS_INDEX,
  MEANING_TAG,
  MEANING_TAG_CHARACTER,
  MEANING_TAG_ROW,
  MEANING_TAG_ROW_CHARACTER,
} from '../../../meaningBoxTheme';

type CharacterTagRowProps = {
  tags: string[];
};

/** Red metadata pills shown at the top of single-character entries. */
export const CharacterTagRow = ({ tags }: CharacterTagRowProps) => (
  <div className={MEANING_TAG_ROW_CHARACTER}>
    {tags.map((label, index) => (
      <div key={index} className={`unselectable ${MEANING_TAG_CHARACTER}`}>
        {label}
      </div>
    ))}
  </div>
);

type TagPillRowProps = {
  children: React.ReactNode;
};

/** Blue metadata pills for word-level dictionary senses. */
export const TagPillRow = ({ children }: TagPillRowProps) => (
  <div className={MEANING_TAG_ROW}>{children}</div>
);

export const TagPill = ({ children }: { children: React.ReactNode }) => (
  <div className={MEANING_TAG}>{children}</div>
);

type GlossLineProps = {
  index: number;
  children: React.ReactNode;
};

export const GlossLine = ({ index, children }: GlossLineProps) => (
  <div className={MEANING_GLOSS}>
    <span className={MEANING_GLOSS_INDEX}>{index}.</span>
    {children}
  </div>
);

type WordEntryCardProps = {
  children: React.ReactNode;
  glossIndex: number;
  gloss: React.ReactNode;
};

/** Standard dictionary sense card: tag row + numbered gloss. */
export const WordEntryCard = ({ children, glossIndex, gloss }: WordEntryCardProps) => (
  <div className={MEANING_ENTRY}>
    <TagPillRow>{children}</TagPillRow>
    <GlossLine index={glossIndex}>{gloss}</GlossLine>
  </div>
);

type CharacterEntryShellProps = {
  tags: string[];
  children: React.ReactNode;
};

/** Wrapper for kanji / hanzi character pages (red accent, metadata row). */
export const CharacterEntryShell = ({ tags, children }: CharacterEntryShellProps) => (
  <div className={MEANING_ENTRY_CHARACTER}>
    <CharacterTagRow tags={tags} />
    {children}
  </div>
);

type InfoFieldsEntryProps = {
  /** Keys starting with `$` render without a label prefix (e.g. comments). */
  info: Record<string, string | undefined | null>;
  gloss: React.ReactNode;
};

/**
 * Chinese / Vietnamese dictionary layouts share the same shape:
 * a row of info tags followed by a single gloss line.
 */
export const InfoFieldsEntry = ({ info, gloss }: InfoFieldsEntryProps) => (
  <WordEntryCard
    glossIndex={1}
    gloss={gloss}
  >
    {Object.entries(info).map(([key, value]) => {
      if (!value) {
        return null;
      }
      return (
        <TagPill key={key}>
          {!key.startsWith('$') && <strong>{key}:</strong>} {value}
        </TagPill>
      );
    })}
  </WordEntryCard>
);
