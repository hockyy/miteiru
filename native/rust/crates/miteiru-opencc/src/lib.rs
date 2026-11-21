//! In-house Rust port of opencc-js 1.4.1 by The nk2028 Project (https://github.com/nk2028/opencc-js), MIT and Apache-2.0; see ./LICENSE.
//! Local changes from upstream:
//! - Rust port of the Unicode trie, segmentation and conversion chains in src/main.js.
//! - Expose only Miteiru's five whole-line conversions and index their bundled data on first use.
//! - Store the original dictionary entries in zstd frames. See ./THIRD_PARTY_LICENSES.md.
//! - Share indexes across routes, mark segmentation phrases, and borrow unchanged text.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::LazyLock;

type Dictionary = &'static [u8];
macro_rules! dict {
    ($name:literal) => {
        include_bytes!(concat!("../data/", $name, ".zst"))
    };
}
const NORMALIZE: &[Dictionary] = &[dict!("CJK_Compatibility_Ideographs")];
const ST_PHRASES: &[Dictionary] = &[
    dict!("STPhrases"),
    dict!("STPhrases_GeneratedFromRegionalPhrases"),
];
const ST_CHARS: &[Dictionary] = &[dict!("STCharacters")];
const TS_PHRASES: &[Dictionary] = &[dict!("TSPhrases")];
const TS_CHARS: &[Dictionary] = &[dict!("TSCharacters")];
const HK: &[Dictionary] = &[dict!("HKVariantsPhrases"), dict!("HKVariants")];
const TW: &[Dictionary] = &[dict!("TWVariantsPhrases"), dict!("TWVariants")];
const TW_REV: &[Dictionary] = &[dict!("TWVariantsRevPhrases"), dict!("TWVariantsRev")];

#[derive(Default)]
struct Node {
    children: Vec<(char, u32)>,
    value: Option<Box<str>>,
    phrase: bool,
}

struct Trie {
    // A direct first-character lookup avoids hashing every subtitle character, including misses.
    // Index zero is reserved for a missing entry. The other nodes share one arena.
    bmp: Box<[u32]>,
    astral: HashMap<char, u32>,
    nodes: Vec<Node>,
}

impl Trie {
    fn load(words: &[Dictionary], phrases: &[Dictionary]) -> Self {
        let mut trie = Self {
            bmp: vec![0; 65536].into_boxed_slice(),
            astral: HashMap::new(),
            nodes: vec![Node::default()],
        };
        // Higher priority groups are inserted last. Segmentation and conversion share terminals.
        for (group, phrase) in [(words, false), (phrases, true)] {
            for dict in group.iter().rev() {
                let bytes = zstd::decode_all(*dict).expect("embedded OpenCC dictionary");
                for entry in std::str::from_utf8(&bytes)
                    .expect("UTF-8 dictionary")
                    .split('|')
                {
                    let (key, value) = entry.split_once(' ').expect("OpenCC word pair");
                    trie.insert(key, value, phrase);
                }
            }
        }
        trie
    }

    fn insert(&mut self, key: &str, value: &str, phrase: bool) {
        let mut chars = key.chars();
        let first = chars.next().expect("nonempty OpenCC key");
        let root = if (first as usize) < self.bmp.len() {
            &mut self.bmp[first as usize]
        } else {
            self.astral.entry(first).or_default()
        };
        if *root == 0 {
            *root = self.nodes.len() as u32;
            self.nodes.push(Node::default());
        }
        let mut id = *root as usize;
        for ch in chars {
            let next = self.nodes.len() as u32;
            let edges = &mut self.nodes[id].children;
            id = match edges.binary_search_by_key(&ch, |edge| edge.0) {
                Ok(at) => edges[at].1 as usize,
                Err(at) => {
                    edges.insert(at, (ch, next));
                    self.nodes.push(Node::default());
                    next as usize
                }
            };
        }
        self.nodes[id].value = Some(value.into());
        self.nodes[id].phrase = phrase;
    }

    fn match_prefix(&self, text: &str, first: char, phrases_only: bool) -> Option<(usize, &str)> {
        let id = if (first as usize) < self.bmp.len() {
            self.bmp[first as usize]
        } else {
            *self.astral.get(&first)?
        };
        if id == 0 {
            return None;
        }
        let mut node = &self.nodes[id as usize];
        let mut longest = None;
        let mut end = first.len_utf8();
        loop {
            if !phrases_only || node.phrase {
                if let Some(value) = node.value.as_deref() {
                    longest = Some((end, value));
                }
            }
            if node.children.is_empty() {
                break;
            }
            let Some(ch) = text[end..].chars().next() else {
                break;
            };
            let Ok(at) = node.children.binary_search_by_key(&ch, |edge| edge.0) else {
                break;
            };
            node = &self.nodes[node.children[at].1 as usize];
            end += ch.len_utf8();
        }
        longest
    }

    fn matches(&self, text: &str, phrases_only: bool, mut emit: impl FnMut(usize, usize, &str)) {
        let mut i = 0;
        let mut description_ends = None;
        while i < text.len() {
            let ch = text[i..].chars().next().unwrap();
            if let Some((length, value)) = self.match_prefix(&text[i..], ch, phrases_only) {
                emit(i, i + length, value);
                i += length;
            } else if description_arity(ch) != 0 {
                i = description_ends.get_or_insert_with(|| description_boundaries(text))[i];
            } else {
                i += ch.len_utf8();
            }
        }
    }

    // Copy only up to the last changed match. A line with no replacements stays borrowed.
    fn write_changes(&self, text: &str, out: &mut String) -> usize {
        let mut last = 0;
        self.matches(text, false, |start, end, replacement| {
            if &text[start..end] != replacement {
                out.push_str(&text[last..start]);
                out.push_str(replacement);
                last = end;
            }
        });
        last
    }

    fn replace<'a>(&self, text: &'a str) -> Cow<'a, str> {
        let mut out = String::new();
        let last = self.write_changes(text, &mut out);
        if last == 0 {
            return Cow::Borrowed(text);
        }
        out.push_str(&text[last..]);
        Cow::Owned(out)
    }
}

fn description_arity(ch: char) -> usize {
    match ch {
        '⿲' | '⿳' => 3,
        '⿰'..='⿿' => 2,
        _ => 0,
    }
}

// Compute nested description ends from right to left when a line contains an operator. An
// incomplete expression consumes only the operator, exactly as upstream's recursive fallback.
fn description_boundaries(text: &str) -> Vec<usize> {
    let mut ends = vec![text.len(); text.len() + 1];
    for (i, ch) in text.char_indices().rev() {
        let next = i + ch.len_utf8();
        let mut end = next;
        for _ in 0..description_arity(ch) {
            if end == text.len() {
                end = next;
                break;
            }
            end = ends[end];
        }
        ends[i] = end;
    }
    ends
}

static NORMALIZATION: LazyLock<Trie> = LazyLock::new(|| Trie::load(NORMALIZE, &[]));
static TRADITIONAL: LazyLock<Trie> = LazyLock::new(|| Trie::load(ST_CHARS, ST_PHRASES));
static SIMPLIFIED: LazyLock<Trie> = LazyLock::new(|| Trie::load(TS_CHARS, TS_PHRASES));
static HONG_KONG: LazyLock<Trie> = LazyLock::new(|| Trie::load(HK, &[]));
static TAIWAN: LazyLock<Trie> = LazyLock::new(|| Trie::load(TW, &[]));
static FROM_TAIWAN: LazyLock<Trie> = LazyLock::new(|| Trie::load(TW_REV, &[]));

pub struct Converter {
    first: &'static Trie,
    regional: Option<RegionalPass>,
}

struct RegionalPass {
    segmentation: &'static Trie,
    second: &'static Trie,
}

impl Converter {
    fn simple(first: &'static Trie) -> Self {
        Self {
            first,
            regional: None,
        }
    }

    fn regional(segmentation: &'static Trie, first: &'static Trie, second: &'static Trie) -> Self {
        Self {
            first,
            regional: Some(RegionalPass {
                segmentation,
                second,
            }),
        }
    }

    pub fn convert(&self, text: &str) -> String {
        let normalized = NORMALIZATION.replace(text);
        let Some(region) = &self.regional else {
            return self.first.replace(&normalized).into_owned();
        };
        let mut out = String::with_capacity(normalized.len());
        let mut append = |segment: &str| {
            let first = self.first.replace(segment);
            let last = region.second.write_changes(&first, &mut out);
            out.push_str(&first[last..]);
        };
        let mut last = 0;
        region
            .segmentation
            .matches(&normalized, true, |start, end, _| {
                if last < start {
                    append(&normalized[last..start]);
                }
                append(&normalized[start..end]);
                last = end;
            });
        if last < normalized.len() {
            append(&normalized[last..]);
        }
        out
    }

    /// JavaScript strings can contain lone UTF-16 surrogates. Like U+FFFD they are unmatched
    /// single code points. Restore each original code unit after conversion, including literal
    /// replacement characters (none of the twelve dictionaries consumes or produces U+FFFD).
    pub fn convert_utf16(&self, units: &[u16]) -> Vec<u16> {
        if let Ok(text) = String::from_utf16(units) {
            return self.convert(&text).encode_utf16().collect();
        }
        let mut originals = char::decode_utf16(units.iter().copied()).filter_map(|ch| match ch {
            Ok(char::REPLACEMENT_CHARACTER) => Some(0xfffd),
            Err(e) => Some(e.unpaired_surrogate()),
            _ => None,
        });
        self.convert(&String::from_utf16_lossy(units))
            .encode_utf16()
            .map(|unit| {
                if unit == 0xfffd {
                    originals.next().unwrap()
                } else {
                    unit
                }
            })
            .collect()
    }
}

static T2S: LazyLock<Converter> = LazyLock::new(|| Converter::simple(&SIMPLIFIED));
static S2T: LazyLock<Converter> = LazyLock::new(|| Converter::simple(&TRADITIONAL));
static S2HK: LazyLock<Converter> =
    LazyLock::new(|| Converter::regional(&TRADITIONAL, &TRADITIONAL, &HONG_KONG));
static S2TW: LazyLock<Converter> =
    LazyLock::new(|| Converter::regional(&TRADITIONAL, &TRADITIONAL, &TAIWAN));
static TW2S: LazyLock<Converter> =
    LazyLock::new(|| Converter::regional(&SIMPLIFIED, &FROM_TAIWAN, &SIMPLIFIED));

pub fn converter(mode: &str) -> Result<&'static Converter, String> {
    Ok(match mode {
        "t2s" => &T2S,
        "s2t" => &S2T,
        "s2hk" => &S2HK,
        "s2tw" => &S2TW,
        "tw2s" => &TW2S,
        _ => return Err(format!("EINVAL: unknown OpenCC conversion {mode}")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phrases_regions_and_scalar_boundaries() {
        for (mode, input, expected) in [
            ("t2s", "頭髮乾淨", "头发干净"),
            ("s2t", "一只手表", "一隻手錶"),
            ("s2hk", "里面", "裏面"),
            ("s2tw", "台湾语言", "臺灣語言"),
            ("tw2s", "臺灣語言", "台湾语言"),
            ("s2t", "𠮷⿰言马车", "𠮷⿰言马車"),
        ] {
            let cc = converter(mode).unwrap();
            assert_eq!(cc.convert(input), expected);
            assert_eq!(cc.convert(""), "");
        }
        assert!(converter("unknown").is_err());
    }

    #[test]
    fn complete_and_incomplete_nested_descriptions_keep_their_original_boundaries() {
        let cc = converter("s2t").unwrap();
        assert_eq!(cc.convert("⿰⿱车"), "⿰⿱车");
        let expression = "⿰".repeat(256) + &"车".repeat(257);
        assert_eq!(cc.convert(&(expression.clone() + "龙")), expression + "龍");
    }
}
