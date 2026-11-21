import {getSubTreeOf, mapValues, transform, type MappingTree} from "./kanaMapping";

// NOTE: not exactly kunrei shiki, for example ぢゃ -> dya instead of zya, to avoid name clashing
const BASIC_KUNREI = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  k: { a: 'か', i: 'き', u: 'く', e: 'け', o: 'こ', },
  s: { a: 'さ', i: 'し', u: 'す', e: 'せ', o: 'そ', },
  t: { a: 'た', i: 'ち', u: 'つ', e: 'て', o: 'と', },
  n: { a: 'な', i: 'に', u: 'ぬ', e: 'ね', o: 'の', },
  h: { a: 'は', i: 'ひ', u: 'ふ', e: 'へ', o: 'ほ', },
  m: { a: 'ま', i: 'み', u: 'む', e: 'め', o: 'も', },
  y: { a: 'や', u: 'ゆ', o: 'よ' },
  r: { a: 'ら', i: 'り', u: 'る', e: 'れ', o: 'ろ', },
  w: { a: 'わ', i: 'ゐ', e: 'ゑ', o: 'を', },
  g: { a: 'が', i: 'ぎ', u: 'ぐ', e: 'げ', o: 'ご', },
  z: { a: 'ざ', i: 'じ', u: 'ず', e: 'ぜ', o: 'ぞ', },
  d: { a: 'だ', i: 'ぢ', u: 'づ', e: 'で', o: 'ど', },
  b: { a: 'ば', i: 'び', u: 'ぶ', e: 'べ', o: 'ぼ', },
  p: { a: 'ぱ', i: 'ぴ', u: 'ぷ', e: 'ぺ', o: 'ぽ', },
  v: { a: 'ゔぁ', i: 'ゔぃ', u: 'ゔ', e: 'ゔぇ', o: 'ゔぉ', },
};

const SPECIAL_SYMBOLS = {
  '.': '。',
  ',': '、',
  ':': '：',
  '/': '・',
  '!': '！',
  '?': '？',
  '~': '〜',
  '-': 'ー',
  '‘': '「',
  '’': '」',
  '“': '『',
  '”': '』',
  '[': '［',
  ']': '］',
  '(': '（',
  ')': '）',
  '{': '｛',
  '}': '｝',
};

const CONSONANTS = {
  k: 'き',
  s: 'し',
  t: 'ち',
  n: 'に',
  h: 'ひ',
  m: 'み',
  r: 'り',
  g: 'ぎ',
  z: 'じ',
  d: 'ぢ',
  b: 'び',
  p: 'ぴ',
  v: 'ゔ',
  q: 'く',
  f: 'ふ',
};
const SMALL_Y = { ya: 'ゃ', yi: 'ぃ', yu: 'ゅ', ye: 'ぇ', yo: 'ょ' };
const SMALL_VOWELS = { a: 'ぁ', i: 'ぃ', u: 'ぅ', e: 'ぇ', o: 'ぉ' };

// typing one should be the same as having typed the other instead
const ALIASES = {
  sh: 'sy', // sha -> sya
  ch: 'ty', // cho -> tyo
  cy: 'ty', // cyo -> tyo
  chy: 'ty', // chyu -> tyu
  shy: 'sy', // shya -> sya
  j: 'zy', // ja -> zya
  jy: 'zy', // jye -> zye

  // exceptions to above rules
  shi: 'si',
  chi: 'ti',
  tsu: 'tu',
  ji: 'zi',
  fu: 'hu',
};

// xtu -> っ
const SMALL_LETTERS = Object.assign(
  {
    tu: 'っ',
    wa: 'ゎ',
    ka: 'ヵ',
    ke: 'ヶ',
  },
  SMALL_VOWELS,
  SMALL_Y
);

// don't follow any notable patterns
const SPECIAL_CASES = {
  yi: 'い',
  wu: 'う',
  ye: 'いぇ',
  wi: 'うぃ',
  we: 'うぇ',
  kwa: 'くぁ',
  whu: 'う',
  // because it's not thya for てゃ but tha
  // and tha is not てぁ, but てゃ
  tha: 'てゃ',
  thu: 'てゅ',
  tho: 'てょ',
  dha: 'でゃ',
  dhu: 'でゅ',
  dho: 'でょ',
};

const AIUEO_CONSTRUCTIONS = {
  wh: 'う',
  kw: 'く',
  qw: 'く',
  q: 'く',
  gw: 'ぐ',
  sw: 'す',
  ts: 'つ',
  th: 'て',
  tw: 'と',
  dh: 'で',
  dw: 'ど',
  fw: 'ふ',
  f: 'ふ',
};

let romajiToKanaMap: MappingTree | undefined;

export function getRomajiToKanaTree(): MappingTree {
  return romajiToKanaMap ??= createRomajiToKanaMap();
}

function createRomajiToKanaMap(): MappingTree {
  const kanaTree = transform(BASIC_KUNREI);
  const subtreeOf = (sequence: string) => getSubTreeOf(kanaTree, sequence);

  // kyo -> き + ょ
  for (const [consonant, yKana] of Object.entries(CONSONANTS)) {
    for (const [romaji, kana] of Object.entries(SMALL_Y)) subtreeOf(consonant + romaji).value = yKana + kana;
  }
  for (const [symbol, kana] of Object.entries(SPECIAL_SYMBOLS)) subtreeOf(symbol).value = kana;

  // うぃ, くぃ, etc.
  for (const [consonant, aiueoKana] of Object.entries(AIUEO_CONSTRUCTIONS)) {
    for (const [vowel, kana] of Object.entries(SMALL_VOWELS)) {
      subtreeOf(consonant + vowel).value = aiueoKana + kana;
    }
  }
  for (const romaji of ["n", "n'", "xn"]) subtreeOf(romaji).value = "ん";

  // Copy k before adding exceptions such as chi and cha.
  kanaTree.children.c = JSON.parse(JSON.stringify(kanaTree.children.k));
  for (const [romaji, alternative] of Object.entries(ALIASES)) {
    const parent = subtreeOf(romaji.slice(0, -1));
    parent.children[romaji.slice(-1)] = JSON.parse(JSON.stringify(subtreeOf(alternative)));
  }

  const aliases = [...Object.entries(ALIASES), ["c", "k"]];
  for (const [kunrei, kana] of Object.entries(SMALL_LETTERS)) {
    const xSubtree = subtreeOf("x" + kunrei);
    xSubtree.value = kana;
    // ltu -> xtu -> っ
    subtreeOf("l" + kunrei.slice(0, -1)).children[kunrei.slice(-1)] = xSubtree;
    for (const [alias, romaji] of aliases) {
      if (!kunrei.startsWith(romaji)) continue;
      const alternative = kunrei.replace(romaji, alias);
      // ltsu -> ltu -> っ
      for (const prefix of ["l", "x"]) {
        const parent = subtreeOf(prefix + alternative.slice(0, -1));
        parent.children[alternative.slice(-1)] = subtreeOf(prefix + kunrei);
      }
    }
  }

  for (const [romaji, kana] of Object.entries(SPECIAL_CASES)) subtreeOf(romaji).value = kana;

  // kka, tta, etc. The n branch must still read nn as んん.
  for (const consonant of [...Object.keys(CONSONANTS), "c", "y", "w", "j"]) {
    const subtree = kanaTree.children[consonant];
    subtree.children[consonant] = mapValues(subtree, (value) => "っ" + value);
  }
  delete kanaTree.children.n.children.n;
  return kanaTree;
}
