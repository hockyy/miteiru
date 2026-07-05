import {getLanguageDisplayName} from "../../languages/manifest";
import {
  buildRubyHtmlFromRomajiedData,
  getDictionaryDefinitions,
  getMeaningEntries,
  getReadingsFromRomajiedData,
  getRomajiedDataForMeaningContent
} from "./meaningEntries";
import {v5 as uuidv5} from 'uuid';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const toAnkiTsvField = (value) => String(value ?? '')
  .replace(/\r?\n/g, '<br>')
  .replace(/\t/g, ' ');

const uniqueNonEmpty = (values) => Array.from(new Set(
  values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean)
));

const buildHtmlList = (values) => {
  const items = uniqueNonEmpty(values);
  if (items.length === 0) return '';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const buildHtmlSection = (title, content) => {
  if (!content) return '';
  return `<div><strong>${escapeHtml(title)}</strong><br>${content}</div>`;
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
  const usageNote = userNote?.usageNote ? escapeHtml(userNote.usageNote) : '';
  const examples = buildHtmlList(userNote?.examples || []);
  const relatedTerms = buildHtmlList(userNote?.relatedTerms || []);
  const readingText = readings.length > 0 ? escapeHtml(readings.join(' / ')) : '';
  const languageName = getLanguageDisplayName(lang);
  const normalDeckName = `Miteiru::${languageName}::Easy`;
  const hardDeckName = `Miteiru::${languageName}::Hard`;

  const normalFront = [
    `<div style="font-size: 2em;">${rubyHtml || escapeHtml(term)}</div>`,
    readingText ? `<div>${readingText}</div>` : ''
  ].filter(Boolean).join('<br>');

  const normalBack = [
    buildHtmlSection('Definitions', buildHtmlList(dictionaryDefinitions)),
    buildHtmlSection('Usage Note', usageNote),
    buildHtmlSection('Example Sentences', examples),
    buildHtmlSection('Related Terms', relatedTerms)
  ].filter(Boolean).join('<hr>');

  const hardBack = [
    buildHtmlSection('Readings', readingText),
    buildHtmlSection('Definitions', buildHtmlList(dictionaryDefinitions)),
    buildHtmlSection('Usage Note', usageNote),
    buildHtmlSection('Example Sentences', examples),
    buildHtmlSection('Related Terms', relatedTerms)
  ].filter(Boolean).join('<hr>');

  return [
    {
      cardId: getVariantAnkiCardId(term, meaningContent, lang, 'reading'),
      front: normalFront,
      back: normalBack,
      deckName: normalDeckName,
      tags: uniqueNonEmpty(['miteiru', lang, 'reading']).join(' ')
    },
    {
      cardId: getVariantAnkiCardId(term, meaningContent, lang, 'hard'),
      front: `<div style="font-size: 2em;">${escapeHtml(term)}</div>`,
      back: hardBack,
      deckName: hardDeckName,
      tags: uniqueNonEmpty(['miteiru', lang, 'hard']).join(' ')
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

const buildAnkiPreview = (cards, mode = 'save') => {
  const previewCards = cards.slice(0, 4).map((card, index) => [
    `Card ${index + 1}`,
    `Deck: ${card.deckName}`,
    `Tags: ${card.tags}`,
    `ID: ${card.cardId}`,
    `Front:\n${previewHtml(card.front) || '(empty)'}`,
    `Back:\n${previewHtml(card.back) || '(empty)'}`
  ].join('\n'));

  const remaining = cards.length > previewCards.length
    ? `\n\n...and ${cards.length - previewCards.length} more cards.`
    : '';

  const footer = mode === 'open'
    ? 'Press OK to save the import file, reveal it in your file manager, and open Anki if installed.'
    : 'Press OK to choose where to save, or Cancel to stop.';

  return [
    `Export ${cards.length} Anki card${cards.length === 1 ? '' : 's'}?`,
    '',
    previewCards.join('\n\n---\n\n'),
    remaining,
    '',
    footer,
  ].join('\n');
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

export const saveAnkiCards = async (cards, defaultPath) => {
  if (!window.confirm(buildAnkiPreview(cards, 'save'))) {
    return false;
  }

  const ankiTsv = buildAnkiImportFile(cards);
  return await window.ipc.invoke("saveFile", ["tsv", "txt"], ankiTsv, defaultPath);
};

/** Writes TSV to user-data/anki, reveals it in the file manager, and launches Anki when found. */
export const openAnkiCards = async (cards, filename) => {
  if (!window.confirm(buildAnkiPreview(cards, 'open'))) {
    return { ok: false, canceled: true };
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
