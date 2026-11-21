//! In-house port of opencc-js 1.4.1 by The nk2028 Project (https://github.com/nk2028/opencc-js), MIT and Apache-2.0; see ./LICENSE.
//! Local changes from upstream:
//! - Rust port of the Unicode trie, segmentation and conversion chains in src/main.js.
//! - Expose only Miteiru's five whole-line conversions and index their bundled data on first use.
//! - Store the original dictionary entries in zstd frames. See ./THIRD_PARTY_LICENSES.md.

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
const ST: &[Dictionary] = &[ST_PHRASES[0], ST_PHRASES[1], dict!("STCharacters")];
const TS_PHRASES: &[Dictionary] = &[dict!("TSPhrases")];
const TS: &[Dictionary] = &[TS_PHRASES[0], dict!("TSCharacters")];
const HK: &[Dictionary] = &[dict!("HKVariantsPhrases"), dict!("HKVariants")];
const TW: &[Dictionary] = &[dict!("TWVariantsPhrases"), dict!("TWVariants")];
const TW_REV: &[Dictionary] = &[dict!("TWVariantsRevPhrases"), dict!("TWVariantsRev")];

#[derive(Default)]
struct Trie {
    children: HashMap<char, Trie>,
    value: Option<String>,
}

impl Trie {
    fn load(group: &[Dictionary]) -> Self {
        let mut trie = Self::default();
        // The first dictionary in a group has priority, the last duplicate in one dictionary wins.
        for dict in group.iter().rev() {
            let bytes = zstd::decode_all(*dict).expect("embedded OpenCC dictionary");
            for entry in std::str::from_utf8(&bytes)
                .expect("UTF-8 dictionary")
                .split('|')
            {
                let (key, value) = entry.split_once(' ').expect("OpenCC word pair");
                let mut node = &mut trie;
                for ch in key.chars() {
                    node = node.children.entry(ch).or_default();
                }
                node.value = Some(value.to_owned());
            }
        }
        trie
    }

    fn match_prefix(&self, s: &str) -> Option<(usize, &str)> {
        let mut node = self;
        let mut longest = None;
        for (i, ch) in s.char_indices() {
            let Some(next) = node.children.get(&ch) else {
                break;
            };
            node = next;
            if let Some(value) = node.value.as_deref() {
                longest = Some((i + ch.len_utf8(), value));
            }
        }
        longest
    }

    // Emit contiguous unmatched runs and the longest dictionary match at each position.
    fn scan<'a, 'b>(&'b self, s: &'a str, mut emit: impl FnMut(&'a str, Option<&'b str>)) {
        let mut literal = 0;
        let mut i = 0;
        while i < s.len() {
            if let Some((length, value)) = self.match_prefix(&s[i..]) {
                if i > literal {
                    emit(&s[literal..i], None);
                }
                emit(&s[i..i + length], Some(value));
                i += length;
                literal = i;
            } else {
                i += unmatched_length(&s[i..]);
            }
        }
        if literal < s.len() {
            emit(&s[literal..], None);
        }
    }

    fn convert(&self, s: &str) -> String {
        let mut output = String::with_capacity(s.len());
        self.scan(s, |source, replacement| {
            output.push_str(replacement.unwrap_or(source))
        });
        output
    }
}

// Keep OpenCC's ideographic description sequence handling, including incomplete nested expressions.
fn description_length(s: &str) -> Option<usize> {
    let ch = s.chars().next()?;
    let arity = match ch {
        '⿲' | '⿳' => 3,
        '⿰'..='⿿' => 2,
        _ => return None,
    };
    let mut end = ch.len_utf8();
    for _ in 0..arity {
        let child = s.get(end..)?.chars().next()?;
        end += description_length(&s[end..]).unwrap_or(child.len_utf8());
    }
    Some(end)
}

fn unmatched_length(s: &str) -> usize {
    description_length(s).unwrap_or_else(|| s.chars().next().unwrap().len_utf8())
}

pub struct Converter {
    normalization: Trie,
    segmentation: Option<Trie>,
    chain: Vec<Trie>,
}

impl Converter {
    fn new(segmentation: Option<&[Dictionary]>, chain: &[&[Dictionary]]) -> Self {
        Self {
            normalization: Trie::load(NORMALIZE),
            segmentation: segmentation.map(Trie::load),
            chain: chain.iter().map(|group| Trie::load(group)).collect(),
        }
    }

    pub fn convert(&self, text: &str) -> String {
        let normalized = self.normalization.convert(text);
        let mut segments = Vec::new();
        if let Some(trie) = &self.segmentation {
            trie.scan(&normalized, |source, _| segments.push(source.to_owned()));
        } else {
            segments.push(normalized);
        }
        for trie in &self.chain {
            for s in &mut segments {
                *s = trie.convert(s);
            }
        }
        segments.concat()
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

static T2S: LazyLock<Converter> = LazyLock::new(|| Converter::new(None, &[TS]));
static S2T: LazyLock<Converter> = LazyLock::new(|| Converter::new(None, &[ST]));
static S2HK: LazyLock<Converter> = LazyLock::new(|| Converter::new(Some(ST_PHRASES), &[ST, HK]));
static S2TW: LazyLock<Converter> = LazyLock::new(|| Converter::new(Some(ST_PHRASES), &[ST, TW]));
static TW2S: LazyLock<Converter> =
    LazyLock::new(|| Converter::new(Some(TS_PHRASES), &[TW_REV, TS]));

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
}
