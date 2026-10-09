/**
 * Recognises conjugated Japanese verbs: whether a surface string is a dictionary-form verb inflected
 * through any chain of conjugations and auxiliaries (食べさせられなかった ← 食べる). Replaces jp-verbs'
 * `unconjugate`, which the analyzer only used to answer that yes/no question.
 *
 * The grammar is generated forward from the dictionary form: every rule derives a new form (and its
 * word class) from an earlier one, and a branch is dropped as soon as it can no longer produce the
 * surface. Irregular verbs are listed in IRREGULAR_VERBS; the endings jp-verbs also treated as part
 * of the verb (sentence-final particles and the like) are listed in PLAIN_FORM_ENDINGS.
 */

type VerbClass = "godan" | "ichidan" | "suru" | "kuru" | "zuru";

/** A form in the derivation: its text and what may follow it. */
type Form =
  | { kind: "verb"; text: string; verbClass: VerbClass; irregular?: IrregularVerb }
  // i-adjective-like inflection: ない, たい, らしい (stem + い).
  | { kind: "adjective"; text: string }
  | { kind: "masu"; text: string }
  // て / で form, which takes auxiliary verbs and particles.
  | { kind: "te"; text: string }
  // Complete form: takes nothing but the endings in PLAIN_FORM_ENDINGS (when `plain`).
  | { kind: "final"; text: string; plain: PlainKind | null };

type PlainKind = "dictionary" | "ta" | "negative" | "te" | "polite";

// --- Godan rows -------------------------------------------------------------------------------------------
const GODAN_ENDINGS = "うくぐすつぬぶむる";
const row = (kana: string) => Object.fromEntries([...GODAN_ENDINGS].map((ending, index) => [ending, kana[index]]));
const A_ROW = row("わかがさたなばまら");
const I_ROW = row("いきぎしちにびみり");
const E_ROW = row("えけげせてねべめれ");
const O_ROW = row("おこごそとのぼもろ");
// て-form endings by dictionary ending (た-form: て→た, で→だ).
const TE_ENDING: Record<string, string> = {
  う: "って", つ: "って", る: "って", ぬ: "んで", ぶ: "んで", む: "んで", く: "いて", ぐ: "いで", す: "して"
};

/** Verbs whose forms the regular rules get wrong. Matched against the end of the dictionary form. */
interface IrregularVerb {
  // Godan verbs with an irregular て/た form: 行く → 行って, 問う → 問うて.
  te?: string;
  // ある: plain negative is ない, not あらない.
  negativeIsNai?: boolean;
  // Honorific -aru verbs: masu stem and imperative are -い (くださる → ください, ください).
  honorific?: boolean;
  // Ichidan verbs whose imperative is the bare stem (くれる → くれ).
  bareImperative?: boolean;
}

const IRREGULAR_VERBS: [RegExp, IrregularVerb][] = [
  // 行く and compounds (出て行く, 持っていく), and the contracted ていく (持ってく → 持ってって).
  [/(?:行|逝|往)く$|^いく$|[てで]い?く$/, {te: "って"}],
  [/(?:問|請|乞)う$|^(?:と|こ)う$/, {te: "うて"}],
  [/^ある$|^有る$|^在る$/, {negativeIsNai: true}],
  [/(?:下さ|くださ|為さ|なさ|いらっしゃ|仰しゃ|おっしゃ|御座|ござ)る$/, {honorific: true}],
  [/(?:呉れ|くれ)る$/, {bareImperative: true}],
];

const irregularFor = (verb: string) => IRREGULAR_VERBS.find(([pattern]) => pattern.test(verb))?.[1];

/** Possible classes of a dictionary form; る-verbs may be godan or ichidan, so both are tried. */
const classesOf = (verb: string): VerbClass[] => {
  if (verb === "する" || verb === "為る") return ["suru"];
  // 勉強する is a suru-verb; a kana word ending in する may also be godan (こする = 擦る, ゆする = 揺する).
  if (verb.endsWith("する")) return /[ぁ-ゖ]する$/.test(verb) ? ["suru", "godan"] : ["suru"];
  // 来る and its compounds (持って来る, やってくる), but not 出来る, which is ichidan.
  if (verb === "くる" || verb.endsWith("てくる") || (verb.endsWith("来る") && !verb.endsWith("出来る"))) return ["kuru"];
  if (verb.endsWith("ずる")) return ["zuru"];
  if (verb.endsWith("る")) return ["ichidan", "godan"];
  if (GODAN_ENDINGS.includes(verb.slice(-1))) return ["godan"];
  return [];
};

const verb = (text: string, verbClass: VerbClass): Form => ({kind: "verb", text, verbClass, irregular: irregularFor(text)});
const final = (text: string, plain: PlainKind | null = null): Form => ({kind: "final", text, plain});

/** た-form (and たら, たり) from a て-form. */
const taForms = (te: string): Form[] => {
  const ta = te.slice(0, -1) + (te.endsWith("で") ? "だ" : "た");
  return [final(ta, "ta"), final(ta + "ら"), final(ta + "り")];
};

// Stems of the -suru verb (勉強する → 勉強し, 勉強さ, 勉強せ).
const suruForms = (text: string): Form[] => {
  const stem = text.slice(0, -2);
  return [
    {kind: "adjective", text: stem + "しない"},
    final(stem + "せず"), final(stem + "せぬ"), final(stem + "せん", "negative"), final(stem + "しまい"), final(stem + "するまい"),
    {kind: "masu", text: stem + "します"}, final(stem + "し"), final(stem + "すれ"),
    final(stem + "しながら"), final(stem + "しなさい"),
    {kind: "adjective", text: stem + "したい"},
    {kind: "te", text: stem + "して"},
    ...taForms(stem + "して"),
    final(stem + "すれば"), final(stem + "すりゃ"),
    final(stem + "しよう", "dictionary"), final(stem + "しろ"), final(stem + "せよ"),
    verb(stem + "される", "ichidan"), verb(stem + "させる", "ichidan"), verb(stem + "させられる", "ichidan"),
    verb(stem + "できる", "ichidan")
  ];
};

const kuruForms = (text: string): Form[] => {
  const kanji = text.endsWith("来る");
  const stem = text.slice(0, kanji ? -1 : -2);
  const [ko, ki, ku] = kanji ? [stem, stem, stem] : [stem + "こ", stem + "き", stem + "く"];
  return [
    {kind: "adjective", text: ko + "ない"}, final(ko + "ず"), final(ko + "ぬ"), final(ko + "ん", "negative"),
    {kind: "masu", text: ki + "ます"}, final(ki), final(ku + "れ"), final(ki + "ながら"), final(ki + "なさい"), {kind: "adjective", text: ki + "たい"},
    {kind: "te", text: ki + "て"}, ...taForms(ki + "て"),
    final(ku + "れば"), final(ku + "りゃ"), final(ko + "よう", "dictionary"), final(ko + "い"), final(ku + "るまい"), final(ko + "まい"),
    verb(ko + "られる", "ichidan"), verb(ko + "れる", "ichidan"), verb(ko + "させる", "ichidan")
  ];
};

const zuruForms = (text: string): Form[] => {
  // 信ずる: 信じない, 信ぜず, 信じます, 信じて, 信ずれば (and the ichidan 信じる forms).
  const stem = text.slice(0, -2);
  return [
    ...inflect(verb(stem + "じる", "ichidan")),
    final(stem + "ぜず"), final(stem + "ぜぬ"), final(stem + "ずれば"), final(stem + "ぜよ")
  ];
};

const godanForms = (text: string, irregular?: IrregularVerb): Form[] => {
  const ending = text.slice(-1);
  const stem = text.slice(0, -1);
  const a = stem + A_ROW[ending];
  const i = stem + (irregular?.honorific ? "い" : I_ROW[ending]);
  const e = stem + E_ROW[ending];
  const te = stem + (irregular?.te ?? TE_ENDING[ending]);
  return [
    irregular?.negativeIsNai ? {kind: "adjective", text: "ない"} : {kind: "adjective", text: a + "ない"},
    final(a + "ず"), final(a + "ぬ"), final(a + "ん", "negative"),
    {kind: "masu", text: i + "ます"}, final(i), final(e), final(i + "ながら"),final(i + "なさい"), {kind: "adjective", text: i + "たい"},
    verb(i + "たがる", "godan"),
    {kind: "te", text: te}, ...taForms(te),
    // Colloquial ば: 書けば → 書きゃ, 帰れば → 帰りゃ, 買えば → 買や.
    final(e + "ば"), final(stem + (ending === "う" ? "や" : I_ROW[ending] + "ゃ")),
    final(irregular?.honorific ? i : e),
    final(stem + O_ROW[ending] + "う", "dictionary"), final(text + "まい"),
    verb(e + "る", "ichidan"), // potential
    verb(a + "れる", "ichidan"), // passive
    verb(a + "せる", "ichidan"), // causative
    verb(a + "す", "godan"), // short causative
    verb(a + "される", "ichidan") // short causative-passive
  ];
};

const ichidanForms = (text: string, irregular?: IrregularVerb): Form[] => {
  const stem = text.slice(0, -1);
  return [
    {kind: "adjective", text: stem + "ない"}, final(stem + "ず"), final(stem + "ぬ"), final(stem + "ん", "negative"),
    {kind: "masu", text: stem + "ます"}, final(stem), final(stem + "れ"), final(stem + "ながら"),final(stem + "なさい"), {kind: "adjective", text: stem + "たい"},
    verb(stem + "たがる", "godan"),
    {kind: "te", text: stem + "て"}, ...taForms(stem + "て"),
    final(stem + "れば"), final(stem + "りゃ"),
    final(stem + "ろ"), final(stem + "よ"), ...(irregular?.bareImperative ? [final(stem)] : []),
    final(stem + "よう", "dictionary"), final(stem + "まい"), final(text + "まい"),
    verb(stem + "られる", "ichidan"), // potential / passive
    verb(stem + "れる", "ichidan"), // colloquial potential (ら抜き)
    verb(stem + "させる", "ichidan"), // causative
    verb(stem + "さす", "godan") // short causative
  ];
};

const adjectiveForms = (text: string): Form[] => {
  // ない / たい / らしい: stem + い.
  const stem = text.slice(0, -1);
  const forms: Form[] = [
    final(stem + "かった", "ta"), final(stem + "かったら"), final(stem + "かったり"),
    final(stem + "くて"), final(stem + "く"), final(stem + "くても"), final(stem + "くては"), final(stem + "くちゃ"),
    final(stem + "ければ"), final(stem + "きゃ"), final(stem + "かろう"),
    {kind: "masu", text: stem + "くあります"}, final(stem + "そう"), {kind: "adjective", text: stem + "くない"}
  ];
  // 〜くなる (食べなくなる, 食べたくなる) inflects as a verb: 食べなくなった.
  forms.push(verb(stem + "くなる", "godan"));
  if (text.endsWith("ない")) forms.push(final(stem + "いで"), final(stem + "さそう"));
  return forms;
};

const masuForms = (text: string): Form[] => {
  const stem = text.slice(0, -1); // 食べま
  return [
    final(stem + "した", "ta"), final(stem + "したら"), final(stem + "したり"), final(stem + "して"),
    final(stem + "せん", "negative"), final(stem + "せんでした", "ta"), final(stem + "しょう", "polite"), final(stem + "せ")
  ];
};

const teForms = (text: string): Form[] => {
  const voiced = text.endsWith("で");
  const stem = text.slice(0, -1);
  const contracted = stem + (voiced ? "じゃ" : "ちゃ");
  return [
    verb(text + "いる", "ichidan"), verb(text + "る", "ichidan"), // ている / てる
    verb(text + "おる", "godan"), verb(text + "ある", "godan"),
    verb(text + "おく", "godan"), verb(stem + (voiced ? "ど" : "と") + "く", "godan"), // ておく / とく
    verb(text + "しまう", "godan"), verb(contracted + "う", "godan"), verb(stem + (voiced ? "じま" : "ちま") + "う", "godan"),
    verb(text + "いく", "godan"), verb(text + "く", "godan"), verb(text + "くる", "kuru"), verb(text + "みる", "ichidan"),
    // Giving and receiving: てもらう, ていただく, てくれる, てくださる, てあげる.
    verb(text + "もらう", "godan"), verb(text + "いただく", "godan"), verb(text + "くれる", "ichidan"),
    verb(text + "くださる", "godan"), verb(text + "あげる", "ichidan"),
    final(text + "は"), final(text + "も"), final(contracted), final(text + "ください"),
    {kind: "adjective", text: text + "ほしい"}
  ];
};

const inflect = (form: Form): Form[] => {
  if (form.kind === "adjective") return adjectiveForms(form.text);
  if (form.kind === "masu") return masuForms(form.text);
  if (form.kind === "te") return teForms(form.text);
  if (form.kind !== "verb") return [];
  switch (form.verbClass) {
    case "suru":
      return suruForms(form.text);
    case "kuru":
      return kuruForms(form.text);
    case "zuru":
      return zuruForms(form.text);
    case "ichidan":
      return ichidanForms(form.text, form.irregular);
    case "godan":
      return GODAN_ENDINGS.includes(form.text.slice(-1)) ? godanForms(form.text, form.irregular) : [];
  }
};

/**
 * Endings jp-verbs also counted as part of a plain verb form (食べるね, 食べたよ, 食べるだろう), kept so
 * the analyzer groups words as before. They are particles and auxiliaries, not inflections.
 */
const SENTENCE_ENDINGS = ["か", "かな", "から", "けど", "さ", "ぜ", "ぞ", "な", "ね", "のに", "よ", "よね", "わ"];
const PLAIN_FORM_ENDINGS: Record<PlainKind, string[]> = {
  dictionary: [...SENTENCE_ENDINGS, "だろう", "らしい", "らしく", "らしくて", "べきだ", "まい"],
  ta: [...SENTENCE_ENDINGS, "だろう", "らしい", "らしく", "らしくて"],
  negative: [...SENTENCE_ENDINGS, "だろう", "らしい", "らしく", "らしくて"],
  polite: [...SENTENCE_ENDINGS],
  te: ["か", "から", "よ"]
};

const plainKindOf = (form: Form): PlainKind | null => {
  if (form.kind === "verb") return "dictionary";
  // ない, たい, らしい take the same endings; べきだ / まい follow only verbs.
  if (form.kind === "adjective") return "negative";
  if (form.kind === "masu") return "polite";
  if (form.kind === "te") return "te";
  return form.plain;
};

/** The part of a form's text that every form derived from it keeps (used to prune the search). */
const keptPrefix = (form: Form): string => {
  if (form.kind === "final") return form.text;
  // ある → ない shares nothing.
  if (form.kind === "verb" && form.irregular?.negativeIsNai) return "";
  if (form.kind === "verb" && (form.verbClass === "suru" || form.verbClass === "zuru")) return form.text.slice(0, -2);
  if (form.kind === "verb" && form.verbClass === "kuru") return form.text.endsWith("来る") ? form.text.slice(0, -1) : form.text.slice(0, -2);
  return form.text.slice(0, -1);
};

const MAX_DERIVATIONS = 8;

/** Whether `surface` is the verb `dictionaryForm` itself or any conjugation of it. */
export const isConjugationOf = (surface: string, dictionaryForm: string): boolean => {
  if (!surface || !dictionaryForm) return false;
  if (surface === dictionaryForm) return true;
  const seen = new Set<string>();
  let frontier: Form[] = classesOf(dictionaryForm).map((verbClass) => verb(dictionaryForm, verbClass));
  for (let depth = 0; depth <= MAX_DERIVATIONS && frontier.length > 0; depth++) {
    const next: Form[] = [];
    for (const form of frontier) {
      const key = `${form.kind}:${form.kind === "verb" ? form.verbClass : ""}:${form.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (form.text === surface) return true;
      const plain = plainKindOf(form);
      if (plain && surface.startsWith(form.text) && PLAIN_FORM_ENDINGS[plain].includes(surface.slice(form.text.length))) return true;
      if (!surface.startsWith(keptPrefix(form))) continue;
      next.push(...inflect(form));
    }
    frontier = next;
  }
  return false;
};
