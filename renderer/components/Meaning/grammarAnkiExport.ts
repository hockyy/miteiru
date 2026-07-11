import { v5 as uuidv5 } from 'uuid';
import { getLanguageDisplayName } from '../../languages/manifest';
import {
  GrammarNotesDatabase,
  GrammarUserData,
  JpGrammarEntry,
} from '../../types/jpGrammar';
import {
  buildExamplesHtml,
  buildHtmlList,
  buildHtmlSection,
  escapeHtml,
  uniqueNonEmpty,
} from './ankiExport';

/** True when saved grammar notes have exportable AI content. */
export const hasGrammarAnkiContent = (userData: GrammarUserData | null | undefined): boolean => {
  if (!userData) {
    return false;
  }

  return Boolean(
    userData.usageNote?.trim()
    || userData.funFact?.trim()
    || userData.examples?.length
    || userData.relatedGrammar?.length,
  );
};

export const getGrammarDeckName = (lang: string): string => {
  const languageName = getLanguageDisplayName(lang);
  return `Miteiru::${languageName}::Grammar`;
};

const getGrammarAnkiCardId = (grammarId: string, lang: string, variant: string): string => {
  const source = [lang, 'grammar', grammarId, variant].join('\u001f');
  return `miteiru:${lang || 'unknown'}:${uuidv5(`https://miteiru.hocky.id/anki/${source}`, uuidv5.URL)}`;
};

const buildGrammarFrontHtml = (entry: JpGrammarEntry): string => {
  const levelBadge = `<span style="display:inline-block;font-size:0.75em;font-weight:bold;padding:0.15em 0.5em;border-radius:0.25em;background:#e0e7ff;color:#312e81;">${escapeHtml(entry.level)}</span>`;

  return [
    levelBadge,
    `<div style="font-size: 2em;">${escapeHtml(entry.form)}</div>`,
    entry.reading ? `<div style="color:#4338ca;">${escapeHtml(entry.reading)}</div>` : '',
  ].filter(Boolean).join('<br>');
};

const buildGrammarBackHtml = (entry: JpGrammarEntry, userData: GrammarUserData): string => {
  const usageNote = userData.usageNote?.trim() ? escapeHtml(userData.usageNote.trim()) : '';
  const funFact = userData.funFact?.trim() ? escapeHtml(userData.funFact.trim()) : '';
  const examples = buildExamplesHtml(userData.examples || []);
  const relatedGrammar = buildHtmlList(userData.relatedGrammar || []);

  return [
    buildHtmlSection('Meaning', escapeHtml(entry.meaning)),
    buildHtmlSection('Usage Tip', usageNote),
    buildHtmlSection('Examples', examples),
    buildHtmlSection('Fun Fact', funFact),
    buildHtmlSection('Related Grammar', relatedGrammar),
  ].filter(Boolean).join('<hr>');
};

export const buildAnkiCardsForGrammarEntry = (
  entry: JpGrammarEntry,
  userData: GrammarUserData,
  lang: string,
) => {
  const deckName = getGrammarDeckName(lang);
  const levelTag = entry.level.toLowerCase();

  return [{
    cardId: getGrammarAnkiCardId(entry.id, lang, 'reading'),
    front: buildGrammarFrontHtml(entry),
    back: buildGrammarBackHtml(entry, userData),
    deckName,
    tags: uniqueNonEmpty(['miteiru', lang, 'grammar', levelTag, 'reading']).join(' '),
  }];
};

export const collectGrammarAnkiCards = (
  catalogEntries: JpGrammarEntry[],
  grammarNotes: GrammarNotesDatabase,
  lang: string,
) => {
  const entryById = new Map(catalogEntries.map((entry) => [entry.id, entry]));
  const cards = [];

  for (const [grammarId, rawUserData] of Object.entries(grammarNotes)) {
    if (!hasGrammarAnkiContent(rawUserData)) {
      continue;
    }

    const entry = entryById.get(grammarId);
    if (!entry) {
      continue;
    }

    cards.push(...buildAnkiCardsForGrammarEntry(entry, rawUserData, lang));
  }

  return cards;
};
