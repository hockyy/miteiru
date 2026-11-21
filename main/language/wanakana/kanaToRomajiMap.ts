import {getSubTreeOf, mapValues, transform, type MappingTree} from "./kanaMapping";

const BASIC_ROMAJI = {
  あ:'a',    い:'i',   う:'u',   え:'e',    お:'o',
  か:'ka',   き:'ki',  く:'ku',  け:'ke',   こ:'ko',
  さ:'sa',   し:'shi', す:'su',  せ:'se',   そ:'so',
  た:'ta',   ち:'chi', つ:'tsu', て:'te',   と:'to',
  な:'na',   に:'ni',  ぬ:'nu',  ね:'ne',   の:'no',
  は:'ha',   ひ:'hi',  ふ:'fu',  へ:'he',   ほ:'ho',
  ま:'ma',   み:'mi',  む:'mu',  め:'me',   も:'mo',
  ら:'ra',   り:'ri',  る:'ru',  れ:'re',   ろ:'ro',
  や:'ya',   ゆ:'yu',  よ:'yo',
  わ:'wa',   ゐ:'wi',  ゑ:'we',  を:'wo',
  ん: 'n',
  が:'ga',   ぎ:'gi',  ぐ:'gu',  げ:'ge',   ご:'go',
  ざ:'za',   じ:'ji',  ず:'zu',  ぜ:'ze',   ぞ:'zo',
  だ:'da',   ぢ:'ji',  づ:'zu',  で:'de',   ど:'do',
  ば:'ba',   び:'bi',  ぶ:'bu',  べ:'be',   ぼ:'bo',
  ぱ:'pa',   ぴ:'pi',  ぷ:'pu',  ぺ:'pe',   ぽ:'po',
  // Upstream stores these compound keys literally. Splitting them into branches would change ヴァ from "vua" to "va".
  ゔぁ:'va', ゔぃ:'vi', ゔ:'vu',  ゔぇ:'ve', ゔぉ:'vo',
};

const SPECIAL_SYMBOLS = {
  '。': '.',
  '、': ',',
  '：': ':',
  '・': '/',
  '！': '!',
  '？': '?',
  '〜': '~',
  'ー': '-',
  '「': '‘',
  '」': '’',
  '『': '“',
  '』': '”',
  '［': '[',
  '］': ']',
  '（': '(',
  '）': ')',
  '｛': '{',
  '｝': '}',
  '　': ' ',
};

// んい -> n'i
const AMBIGUOUS_VOWELS = ['あ', 'い', 'う', 'え', 'お', 'や', 'ゆ', 'よ'];
const SMALL_Y = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };
const SMALL_Y_EXTRA = { ぃ: 'yi', ぇ: 'ye' };
const SMALL_AIUEO = {
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
};
const YOON_KANA = [
  'き',
  'に',
  'ひ',
  'み',
  'り',
  'ぎ',
  'び',
  'ぴ',
  'ゔ',
  'く',
  'ふ',
];
const YOON_EXCEPTIONS = {
  し: 'sh',
  ち: 'ch',
  じ: 'j',
  ぢ: 'j',
};
const SMALL_KANA = {
  っ: '',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
};

const SOKUON_WHITELIST: Record<string, string> = {
  b: 'b',
  c: 't',
  d: 'd',
  f: 'f',
  g: 'g',
  h: 'h',
  j: 'j',
  k: 'k',
  m: 'm',
  p: 'p',
  q: 'q',
  r: 'r',
  s: 's',
  t: 't',
  v: 'v',
  w: 'w',
  x: 'x',
  z: 'z',
};

let kanaToHepburnMap: MappingTree | undefined;

export function getKanaToHepburnTree(): MappingTree {
  return kanaToHepburnMap ??= createKanaToHepburnMap();
}

function createKanaToHepburnMap(): MappingTree {
  const romajiTree = transform(BASIC_ROMAJI);
  const subtreeOf = (sequence: string) => getSubTreeOf(romajiTree, sequence);
  const setTrans = (sequence: string, value: string) => { subtreeOf(sequence).value = value; };

  for (const [kana, romaji] of Object.entries(SPECIAL_SYMBOLS)) setTrans(kana, romaji);
  for (const [kana, romaji] of [...Object.entries(SMALL_Y), ...Object.entries(SMALL_AIUEO)]) {
    setTrans(kana, romaji);
  }

  for (const kana of YOON_KANA) {
    const firstRomajiChar = subtreeOf(kana).value![0];
    for (const [yKana, yRomaji] of [...Object.entries(SMALL_Y), ...Object.entries(SMALL_Y_EXTRA)]) {
      setTrans(kana + yKana, firstRomajiChar + yRomaji);
    }
  }

  for (const [kana, romaji] of Object.entries(YOON_EXCEPTIONS)) {
    // じゃ -> ja, じぃ -> jyi, じぇ -> je
    for (const [yKana, yRomaji] of Object.entries(SMALL_Y)) setTrans(kana + yKana, romaji + yRomaji[1]);
    setTrans(kana + "ぃ", romaji + "yi");
    setTrans(kana + "ぇ", romaji + "e");
  }

  romajiTree.children["っ"] = mapValues(romajiTree, (value) => (SOKUON_WHITELIST[value.charAt(0)] ?? "") + value);
  for (const [kana, romaji] of Object.entries(SMALL_KANA)) setTrans(kana, romaji);
  for (const kana of AMBIGUOUS_VOWELS) setTrans("ん" + kana, "n'" + subtreeOf(kana).value);
  return romajiTree;
}
