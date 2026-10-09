import {isConjugationOf} from "./verbConjugation";
import Japanese from "../japanese";
import Chinese from "../chinese";
import Vietnamese from "../vietnamese";
import {MiteiruJapaneseWordWithSeparations} from "./japaneseAnalysis";

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
const continuesVerb = (token: MiteiruJapaneseWordWithSeparations) => {
  const [pos, detail] = token.pos.split("-");
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
  res: MiteiruJapaneseWordWithSeparations[]
): Promise<MiteiruJapaneseWordWithSeparations[]> => {
  const newRes: MiteiruJapaneseWordWithSeparations[] = [];
  for (let i = 0; i < res.length; i++) {
    if (!res[i].pos.split('-').includes("動詞")) {
      newRes.push(res[i]);
      continue;
    }
    let last = i;
    while (last + 1 < res.length && continuesVerb(res[last + 1])) last++;
    const basicForm = res[i].basicForm;
    const surfaceUpTo = (end: number) => res.slice(i, end + 1).map((token) => token.origin).join('');
    while (last > i && !isConjugationOf(surfaceUpTo(last), basicForm)) last--;
    if (last === i) {
      newRes.push(res[i]);
      continue;
    }
    const chain = res.slice(i, last + 1);
    newRes.push({
      origin: surfaceUpTo(last),
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
