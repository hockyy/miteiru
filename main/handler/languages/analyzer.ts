import {isConjugationOf} from "./verbConjugation";
import Japanese from "../japanese";
import Chinese from "../chinese";
import Vietnamese from "../vietnamese";
import {MiteiruJapaneseWordWithSeparations} from "./japaneseAnalysis";
import {analyzeWithUserDictionary, enabledUserDictionaryEntries} from "../../helpers/userDictionary";
import {japaneseTokenizerEntries, japaneseUserDictionaryToken} from '../../helpers/japaneseTokenizerWords';
import {hasExactJapaneseDefault} from '../../helpers/japaneseDictionaryPriority';

export type AnalyzeTextOptions = {
  tokenizerMode: string;
  toneType?: string;
};

export type AnalyzeTextResult = any[];

// Particles that end a verb chain: quotation, nominalizer, and the でしょ of でしょう (a separate word).
const CHAIN_BREAKING_PARTICLES = ["と", "でしょ", "の", "という"];
// Dependent verbs that start their own word (〜てやる, 〜たりする).
const NOT_AUXILIARY_VERBS = ["やる", "する"];
// Auxiliary verbs Kuromoji does not always tag as such (ある after て is 動詞-自立).
const ALWAYS_AUXILIARY_VERBS = ["いる", "ある", "おる", "られる", "れる", "せる", "させる"];

/** Whether a token can continue the verb before it: auxiliaries, particles, and suffix or dependent verbs. */
const continuesVerb = (token: MiteiruJapaneseWordWithSeparations, learnerUnits: boolean, previous?: MiteiruJapaneseWordWithSeparations) => {
  const [pos, detail] = token.pos.split("-");
  if (learnerUnits && pos === '助詞' && !['て', 'で', 'ちゃ', 'じゃ', 'たら', 'だら', 'たり', 'だり', 'ながら', 'ば'].includes(token.origin)) return false;
  if (learnerUnits && ['ちゃ', 'じゃ'].includes(token.origin) && previous?.origin === previous?.basicForm) return false;
  if (learnerUnits && (['らしい', 'よう', 'みたい', 'っす'].includes(token.basicForm)
    || /^(だろ|でしょ)/.test(token.origin))) return false;
  if (ALWAYS_AUXILIARY_VERBS.includes(token.basicForm)) return true;
  if (pos === "助動詞") return true;
  if (pos === "助詞") return !CHAIN_BREAKING_PARTICLES.includes(token.origin);
  if (pos === "動詞" && (detail === "接尾" || detail === "非自立")) return !NOT_AUXILIARY_VERBS.includes(token.basicForm);
  return false;
};

/**
 * Joins each verb with the auxiliaries and particles that conjugate it (食べ|させ|られ|なかっ|た →
 * 食べさせられなかった, base form 食べる): the longest run of following tokens that is still a
 * conjugation of the verb.
 */
export const parseJapaneseVerbs = async (
  res: MiteiruJapaneseWordWithSeparations[],
  {learnerUnits = false}: {learnerUnits?: boolean} = {}
): Promise<MiteiruJapaneseWordWithSeparations[]> => {
  const newRes: MiteiruJapaneseWordWithSeparations[] = [];
  for (let i = 0; i < res.length; i++) {
    if (!res[i].pos.split('-').includes("動詞")) {
      newRes.push(res[i]);
      continue;
    }
    let last = i;
    while (last + 1 < res.length && continuesVerb(res[last + 1], learnerUnits, res[last])) last++;
    const basicForm = res[i].basicForm;
    // surfaces[k]: the chain's first k + 1 tokens.
    const surfaces: string[] = [];
    for (let k = i; k <= last; k++) surfaces.push((surfaces.at(-1) ?? '') + res[k].origin);
    while (last > i && !isConjugationOf(surfaces[last - i], basicForm)) last--;
    if (last === i) {
      newRes.push(res[i]);
      continue;
    }
    const chain = res.slice(i, last + 1);
    newRes.push({
      origin: surfaces[last - i],
      hiragana: chain.map((token) => token.hiragana).join(''),
      basicForm,
      pos: res[i].pos,
      separation: chain.flatMap((token) => token.separation)
    });
    i = last;
  }
  return newRes;
};

export const analyzeText = async (
  sentence: string,
  {tokenizerMode, toneType = "num"}: AnalyzeTextOptions
): Promise<AnalyzeTextResult> => {
  if (!sentence) return [];

  if (tokenizerMode === "jieba" || tokenizerMode === "cantonese") {
    return analyzeDefaultText(sentence, tokenizerMode, toneType);
  }

  if (tokenizerMode === 'kuromoji') {
    const entries = await japaneseTokenizerEntries(await enabledUserDictionaryEntries('ja'), Japanese.Dict.db);
    const tokens = await Japanese.tokenizeUsingKuromoji(sentence, entries);
    const bySurface = new Map(entries.map((entry) => [entry.surface, entry]));
    const separated = Japanese.processKuromojinToSeparations(tokens).map((token) => {
      const entry = bySurface.get(token.origin);
      return entry ? japaneseUserDictionaryToken(entry, toneType) : token;
    });
    return parseJapaneseVerbs(separated, {learnerUnits: Boolean(Japanese.kuromojiTokenizer?.tokenizeWithUserWords)});
  }

  const language = {kuromoji: "ja", cantonese: "yue", jieba: "zh-CN", vietnamese: "vi"}[tokenizerMode];
  return analyzeWithUserDictionary(sentence, language, await enabledUserDictionaryEntries(language),
    (text) => analyzeDefaultText(text, tokenizerMode, toneType), toneType,
    async (entry) => entry.source === 'manual' || language !== 'ja' || !Japanese.Dict.db
      || !await hasExactJapaneseDefault(Japanese.Dict.db, entry.surface));
};

const analyzeDefaultText = async (sentence: string, tokenizerMode: string, toneType: string): Promise<AnalyzeTextResult> => {

  if (tokenizerMode === "kuromoji") {
    const kuromojiEntries = await Japanese.tokenizeUsingKuromoji(sentence);
    const separated = Japanese.processKuromojinToSeparations(kuromojiEntries);
    return parseJapaneseVerbs(separated);
  }

  if (tokenizerMode === "cantonese") {
    return Chinese.getJyutpingForSentence(sentence, toneType);
  }

  if (tokenizerMode === "jieba") {
    return Chinese.tokenizeUsingJieba(sentence, toneType);
  }

  if (tokenizerMode === "vietnamese") {
    if (!Vietnamese.isLoaded) {
      throw new Error("Vietnamese dictionary not loaded");
    }
    return Vietnamese.tokenizeLongestSuffix(sentence);
  }

  return [];
};
