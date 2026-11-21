//! Rust port of pinyin-pro 3.29.3 by zh-lx (https://github.com/zh-lx/pinyin-pro), MIT; see ../LICENSE.
//! Local changes from upstream:
//! - Embed the complete dict1–dict5 and number-rule data with zstd and index it on first use.
//! - Retain the normal-mode maximum-probability matcher, tone sandhi and numeric type-all output.
//! - Read subtitle lines through a character-aligned OpenCC t2s copy inside the native call.
//! - Expose batches of lines and both string tone conversions. Omit unused modes and mutable dictionaries.

mod dictionary;
mod tones;
pub use tones::convert;

use dictionary::{Dictionary, DICTIONARY};
use serde::Serialize;
use std::borrow::Cow;

fn single(
    dict: &Dictionary,
    ch: char,
    previous: Option<char>,
    next: Option<char>,
) -> Option<&'static str> {
    match ch {
        '々' => return Some(previous.and_then(|c| dict.first(c)).unwrap_or("tóng")),
        '了' if previous.and_then(|c| dict.first(c)).is_none() => return Some("liǎo"),
        '一' | '不' => {
            if previous == next && previous.and_then(|c| dict.first(c)).is_some() {
                return Some(if ch == '一' { "yi" } else { "bu" });
            }
            let ignore = if ch == '一' {
                "的而之后也还是"
            } else {
                "的而之后也还地"
            };
            if let Some(tone) = next
                .filter(|c| !ignore.contains(*c))
                .and_then(|c| dict.first(c))
                .and_then(tones::tone)
            {
                match (ch, tone) {
                    ('一', 4) => return Some("yí"),
                    ('一', 1..=3) => return Some("yì"),
                    ('不', 4) => return Some("bú"),
                    _ => {}
                }
            }
        }
        _ => {}
    }
    dict.first(ch)
}

fn visit(text: &str, mut emit: impl FnMut(char, Option<&'static str>)) {
    if text.is_empty() {
        return;
    }
    let chars: Vec<char> = text.chars().collect();
    let dict = &*DICTIONARY;
    let phrases = dict.phrases(&chars);
    let mut matches = phrases.iter().peekable();
    let mut i = 0;
    while i < chars.len() {
        if let Some(hit) = matches.next_if(|hit| hit.start == i) {
            if hit.length() > 1 {
                let mut readings = hit.pinyin().split(' ');
                for &ch in &chars[i..i + hit.length()] {
                    emit(ch, Some(readings.next().unwrap_or("")));
                }
                i += hit.length();
                continue;
            }
        }
        emit(
            chars[i],
            single(
                dict,
                chars[i],
                i.checked_sub(1).map(|j| chars[j]),
                chars.get(i + 1).copied(),
            ),
        );
        i += 1;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    origin: char,
    pub pinyin: String,
    initial: String,
    #[serde(rename = "final")]
    final_: String,
    first: String,
    final_head: String,
    final_body: String,
    final_tail: String,
    num: u8,
    is_zh: bool,
    polyphonic: Vec<String>,
    in_zh_range: bool,
    result: String,
}

fn full_reading(origin: char, source: Option<&str>) -> Reading {
    const INITIALS: &[&str] = &[
        "zh", "ch", "sh", "z", "c", "s", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
        "j", "q", "x", "r", "y", "w",
    ];
    const DOUBLE_FINALS: &[&str] = &[
        "ia", "ian", "iang", "iao", "ie", "iu", "iong", "ua", "uai", "uan", "uang", "ue", "ui",
        "uo", "üan", "üe", "van", "ve",
    ];
    let raw = origin.to_string();
    let pinyin = source.map(tones::numbered).unwrap_or_default();
    let initial = INITIALS
        .iter()
        .copied()
        .find(|initial| pinyin.starts_with(initial))
        .unwrap_or("");
    let mut final_part = pinyin[initial.len()..].to_owned();
    if matches!(initial, "j" | "q" | "x")
        && matches!(
            final_part.as_str(),
            "uān"
                | "uán"
                | "uǎn"
                | "uàn"
                | "uan"
                | "uē"
                | "ué"
                | "uě"
                | "uè"
                | "ue"
                | "ūn"
                | "ún"
                | "ǔn"
                | "ùn"
                | "un"
                | "ū"
                | "ú"
                | "ǔ"
                | "ù"
                | "u"
        )
    {
        for (from, to) in [('u', 'ü'), ('ū', 'ǖ'), ('ú', 'ǘ'), ('ǔ', 'ǚ'), ('ù', 'ǜ')] {
            if final_part.starts_with(from) {
                final_part = final_part.replacen(from, &to.to_string(), 1);
                break;
            }
        }
    }
    let mut parts = final_part.chars();
    let head = if DOUBLE_FINALS.contains(&tones::without_tone(&final_part).as_str()) {
        parts.next()
    } else {
        None
    };
    let body = parts.next();
    let all = DICTIONARY.all(origin);
    let mut polyphonic = Vec::new();
    if !pinyin.is_empty() {
        polyphonic.push(pinyin.clone());
        if let Some(all) = all {
            polyphonic.extend(
                all.split(' ')
                    .filter(|&other| other != pinyin)
                    .map(str::to_owned),
            );
        }
    }
    let is_zh = source.is_some();
    let result = if is_zh { pinyin.clone() } else { raw.clone() };
    Reading {
        origin,
        pinyin,
        initial: initial.to_owned(),
        first: result.chars().take(1).collect(),
        final_head: head.into_iter().collect(),
        final_body: body.into_iter().collect(),
        final_tail: parts.collect(),
        final_: final_part,
        num: tones::tone(source.unwrap_or(&raw)).unwrap_or(0),
        is_zh,
        polyphonic,
        in_zh_range: all.is_some(),
        result,
    }
}

pub fn full(text: &str) -> Vec<Reading> {
    let mut items = Vec::new();
    visit(text, |origin, reading| {
        items.push(full_reading(origin, reading))
    });
    items
}

/// Keep offsets in Unicode characters. Some OpenCC phrase substitutions can change the length.
fn reading_source(text: &str, simplify: bool) -> Cow<'_, str> {
    if simplify && !text.is_empty() {
        let converted = miteiru_opencc::converter("t2s")
            .expect("built-in t2s route")
            .convert(text);
        if converted != text && converted.chars().count() == text.chars().count() {
            return Cow::Owned(converted);
        }
    }
    Cow::Borrowed(text)
}

#[derive(Serialize)]
pub struct OriginalReading {
    origin: char,
    pinyin: String,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum Line {
    Full(Vec<Reading>),
    Original(Vec<OriginalReading>),
}

/// Match sentencePinyin: a converted line keeps only its original characters and their chosen pinyin.
pub fn line(text: &str, simplify: bool) -> Line {
    match reading_source(text, simplify) {
        Cow::Borrowed(source) => Line::Full(full(source)),
        Cow::Owned(source) => {
            let mut originals = text.chars();
            let mut items = Vec::new();
            visit(&source, |_, reading| {
                items.push(OriginalReading {
                    origin: originals.next().expect("character-aligned reading source"),
                    pinyin: reading.map(tones::numbered).unwrap_or_default(),
                })
            });
            Line::Original(items)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn whole_line_polyphones_and_tone_sandhi() {
        let values: Vec<_> = full("吃了饭，银行行长说不说𬺓🙂")
            .into_iter()
            .map(|item| item.pinyin)
            .collect();
        assert_eq!(
            values,
            [
                "chi1", "le0", "fan4", "", "yin2", "hang2", "hang2", "zhang3", "shuo1", "bu0",
                "shuo1", "chu3", ""
            ]
        );
    }
    #[test]
    fn conversions_keep_spacing_erhua_and_neutral_tone_rules() {
        assert_eq!(convert("ḿ̌ ê̄̌ m̄̀", false), "m̌2 ê̌1 m̀1");
        assert_eq!(
            convert("  nü3 dian3r er2 ma0 ma5", true),
            "  nǚ diǎnr ér ma ma5"
        );
        assert_eq!(convert("nǚ diǎnr ér  m̌", false), "nü3 dian3r er2  m3");
    }
}
