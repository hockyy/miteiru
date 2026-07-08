import {getLanguageDisplayName} from "../../languages/manifest";
import {
  buildRubyHtmlFromRomajiedData,
  getDictionaryDefinitions,
  getMeaningEntries,
  getReadingsFromRomajiedData,
  getRomajiedDataForMeaningContent
} from "./meaningEntries";
import {v5 as uuidv5} from 'uuid';

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const toAnkiTsvField = (value) => String(value ?? '')
  .replace(/\r?\n/g, '<br>')
  .replace(/\t/g, ' ');

export const uniqueNonEmpty = (values: unknown[]): string[] => Array.from(new Set(
  values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean)
));

export const buildHtmlList = (values) => {
  const items = uniqueNonEmpty(values);
  if (items.length === 0) return '';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

export const buildExamplesHtml = (examples = []) => {
  const items = examples
    .map((example) => {
      const sentence = typeof example?.sentence === 'string' ? example.sentence.trim() : '';
      const meaning = typeof example?.meaning === 'string' ? example.meaning.trim() : '';
      if (!sentence) {
        return '';
      }
      if (!meaning) {
        return `<li>${escapeHtml(sentence)}</li>`;
      }
      return `<li>${escapeHtml(sentence)}<br><span style="color:#555;font-style:italic;">${escapeHtml(meaning)}</span></li>`;
    })
    .filter(Boolean);

  if (items.length === 0) {
    return '';
  }

  return `<ul>${items.join('')}</ul>`;
};

export const buildHtmlSection = (title, content) => {
  if (!content) return '';
  return `<div><strong>${escapeHtml(title)}</strong><br>${content}</div>`;
};

/** True when the export should use the My Notes deck instead of dictionary Easy/Hard. */
export const hasAnkiNoteContent = (userNote) => {
  if (!userNote) {
    return false;
  }
  return Boolean(
    userNote.definition?.trim()
    || userNote.usageNote?.trim()
    || userNote.funFact?.trim()
    || userNote.examples?.length
    || userNote.relatedTerms?.length
  );
};

export const getAnkiDeckNames = (lang, usesNotes) => {
  const languageName = getLanguageDisplayName(lang);
  if (usesNotes) {
    const notesDeckName = `Miteiru::${languageName}::Notes`;
    return { readingDeckName: notesDeckName, hardDeckName: notesDeckName };
  }
  return {
    readingDeckName: `Miteiru::${languageName}::Easy`,
    hardDeckName: `Miteiru::${languageName}::Hard`,
  };
};

export const safeAnkiFilename = (term) => {
  const safeTerm = String(term || 'card').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
  return `miteiru_anki_${safeTerm || 'card'}.tsv`;
};

const getAnkiCardId = (term, meaningContent, lang) => {
  const mainWord = uniqueNonEmpty([
    term,
    ...(meaningContent?.single || []).map((entry) => entry?.text),
    meaningContent?.content,
    meaningContent?.simplified
  ])[0] || 'card';
  const source = [
    lang,
    String(mainWord).normalize('NFKC').trim()
  ].join('\u001f');

  return `miteiru:${lang || 'unknown'}:${uuidv5(`https://miteiru.hocky.id/anki/${source}`, uuidv5.URL)}`;
};

const getVariantAnkiCardId = (term, meaningContent, lang, variant) => {
  return `${getAnkiCardId(term, meaningContent, lang)}:${variant}`;
};

const buildAnkiCardsForTerm = ({
  term,
  meaningContent,
  lang,
  userNote,
  readings,
  rubyHtml
}) => {
  const dictionaryDefinitions = getDictionaryDefinitions(meaningContent, lang);
  const noteDefinition = userNote?.definition?.trim() || '';
  const usageNote = userNote?.usageNote?.trim() ? escapeHtml(userNote.usageNote.trim()) : '';
  const funFact = userNote?.funFact?.trim() ? escapeHtml(userNote.funFact.trim()) : '';
  const examples = buildExamplesHtml(userNote?.examples || []);
  const relatedTerms = buildHtmlList(userNote?.relatedTerms || []);
  const readingText = readings.length > 0 ? escapeHtml(readings.join(' / ')) : '';
  const usesNotes = hasAnkiNoteContent(userNote);
  const { readingDeckName, hardDeckName } = getAnkiDeckNames(lang, usesNotes);

  const definitionsSection = noteDefinition
    ? buildHtmlSection('Definition', escapeHtml(noteDefinition))
    : buildHtmlSection('Definitions', buildHtmlList(dictionaryDefinitions));

  const studySections = [
    definitionsSection,
    buildHtmlSection('Usage Tip', usageNote),
    buildHtmlSection('Fun Fact', funFact),
    buildHtmlSection('Examples', examples),
    buildHtmlSection('See Also', relatedTerms),
  ].filter(Boolean).join('<hr>');

  const normalFront = [
    `<div style="font-size: 2em;">${rubyHtml || escapeHtml(term)}</div>`,
    readingText ? `<div>${readingText}</div>` : ''
  ].filter(Boolean).join('<br>');

  const normalBack = studySections;

  const hardBack = [
    buildHtmlSection('Readings', readingText),
    studySections,
  ].filter(Boolean).join('<hr>');

  return [
    {
      cardId: getVariantAnkiCardId(term, meaningContent, lang, usesNotes ? 'notes-reading' : 'reading'),
      front: normalFront,
      back: normalBack,
      deckName: readingDeckName,
      tags: uniqueNonEmpty(['miteiru', lang, usesNotes ? 'notes' : '', 'reading']).join(' ')
    },
    {
      cardId: getVariantAnkiCardId(term, meaningContent, lang, usesNotes ? 'notes-hard' : 'hard'),
      front: `<div style="font-size: 2em;">${escapeHtml(term)}</div>`,
      back: hardBack,
      deckName: hardDeckName,
      tags: uniqueNonEmpty(['miteiru', lang, usesNotes ? 'notes' : '', 'hard']).join(' ')
    }
  ];
};

const buildAnkiImportFile = (cards) => [
  '#separator:tab',
  '#html:true',
  '#notetype:Basic',
  '#guid column:1',
  '#deck column:4',
  '#tags column:5',
  ...cards.map(({
    cardId,
    front,
    back,
    deckName,
    tags
  }) => [cardId, front, back, deckName, tags].map(toAnkiTsvField).join('\t'))
].join('\n') + '\n';

const previewHtml = (value) => String(value ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<hr\s*\/?>/gi, '\n---\n')
  .replace(/<\/li>/gi, '\n')
  .replace(/<li>/gi, '- ')
  .replace(/<rt>(.*?)<\/rt>/gi, '($1)')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const truncatePreview = (value, maxLength = 160) => {
  const text = previewHtml(value).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
};

export type AnkiExportMode = 'save' | 'open';

export type AnkiCardPreview = {
  deckName: string;
  tags: string;
  frontPreview: string;
  backPreview: string;
};

export type AnkiExportPreview = {
  cardCount: number;
  decks: string[];
  cards: AnkiCardPreview[];
  moreCount: number;
  mode: AnkiExportMode;
};

const PREVIEW_CARD_LIMIT = 3;

export const buildAnkiExportPreview = (cards, mode: AnkiExportMode = 'save'): AnkiExportPreview => {
  const previewCards = cards.slice(0, PREVIEW_CARD_LIMIT).map((card) => ({
    deckName: card.deckName,
    tags: card.tags,
    frontPreview: truncatePreview(card.front, 120),
    backPreview: truncatePreview(card.back, 180),
  }));

  return {
    cardCount: cards.length,
    decks: uniqueNonEmpty(cards.map((card) => card.deckName)),
    cards: previewCards,
    moreCount: Math.max(0, cards.length - previewCards.length),
    mode,
  };
};

export const safeAnkiAllFilename = (lang) => {
  const safeLang = String(lang || 'cards').replace(/[\\/:*?"<>|\s]+/g, '_');
  return `miteiru_anki_${safeLang}_all.tsv`;
};

export const safeAnkiSentenceFilename = (sentence) => {
  const snippet = String(sentence || 'sentence').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  return `miteiru_anki_sentence_${snippet || 'sentence'}.tsv`;
};

const getSentenceAnkiCardId = (sentence, lang) => {
  const source = [
    lang,
    String(sentence).normalize('NFKC').trim(),
    'sentence-hard',
  ].join('\u001f');

  return `miteiru:${lang || 'unknown'}:${uuidv5(`https://miteiru.hocky.id/anki/${source}`, uuidv5.URL)}`;
};

export const buildSentenceAnkiFrontHtml = (frontText) =>
  `<div style="font-size: 2em;">${escapeHtml(frontText)}</div>`;

export const buildSentenceAnkiBackHtml = ({
  rubyHtml,
  translation,
  note,
}) => [
  rubyHtml ? `<div style="font-size: 1.6em;">${rubyHtml}</div>` : '',
  buildHtmlSection('Translation', escapeHtml(translation)),
  buildHtmlSection('Note', escapeHtml(note)),
].filter(Boolean).join('<hr>');

export const createInitialSentenceAnkiDraft = ({
  sourceSentence,
  lang,
  rubyHtml,
  translation,
  note,
}) => {
  const languageName = getLanguageDisplayName(lang);
  return {
    sourceSentence,
    frontText: sourceSentence,
    rubyHtml,
    translation,
    note,
    lang,
    deckName: `Miteiru::${languageName}::Hard`,
    cardId: getSentenceAnkiCardId(sourceSentence, lang),
  };
};

export const createSentenceAnkiCardFromDraft = (draft) => ({
  cardId: draft.cardId,
  front: buildSentenceAnkiFrontHtml(draft.frontText),
  back: buildSentenceAnkiBackHtml(draft),
  deckName: draft.deckName,
  tags: uniqueNonEmpty(['miteiru', draft.lang, 'sentence', 'hard']).join(' '),
});

export const createSentenceAnkiCard = ({
  sentence,
  lang,
  rubyHtml,
  translation,
  note,
}) => createSentenceAnkiCardFromDraft(createInitialSentenceAnkiDraft({
  sourceSentence: sentence,
  lang,
  rubyHtml,
  translation,
  note,
}));

export const createAnkiCardsForTerm = async ({
  term,
  lang,
  tokenizeMiteiru,
  userNote,
  meaningContent = null,
  romajiedData = null,
  rubyHtml = null
}) => {
  const resolvedMeaningContent = meaningContent || (await getMeaningEntries(term, lang))[0];
  const resolvedRomajiedData = romajiedData || await getRomajiedDataForMeaningContent(term, resolvedMeaningContent, lang, tokenizeMiteiru);
  const readings = getReadingsFromRomajiedData(resolvedRomajiedData);

  return buildAnkiCardsForTerm({
    term,
    meaningContent: resolvedMeaningContent,
    lang,
    userNote,
    readings,
    rubyHtml: rubyHtml ?? buildRubyHtmlFromRomajiedData(resolvedRomajiedData)
  });
};

export const saveAnkiCards = async (cards, defaultPath, confirmExport?) => {
  if (confirmExport) {
    const confirmed = await confirmExport(cards, 'save');
    if (!confirmed) {
      return false;
    }
  }

  const ankiTsv = buildAnkiImportFile(cards);
  return await window.ipc.invoke("saveFile", ["tsv", "txt"], ankiTsv, defaultPath);
};

/** Writes TSV to user-data/anki, reveals it in the file manager, and launches Anki when found. */
export const openAnkiCards = async (cards, filename, confirmExport?) => {
  if (confirmExport) {
    const confirmed = await confirmExport(cards, 'open');
    if (!confirmed) {
      return { ok: false, canceled: true };
    }
  }

  const ankiTsv = buildAnkiImportFile(cards);
  const result = await window.electronAPI.revealAnkiImport(ankiTsv, filename);

  if (!result?.ok) {
    throw new Error(result?.error || 'Could not prepare Anki import file.');
  }

  return {
    ok: true,
    filePath: result.filePath,
    ankiLaunched: Boolean(result.ankiLaunched),
    openedFolderOnly: Boolean(result.openedFolderOnly),
  };
};

export const buildDeckList = (cards) => uniqueNonEmpty(cards.map((card) => card.deckName)).join(', ');
