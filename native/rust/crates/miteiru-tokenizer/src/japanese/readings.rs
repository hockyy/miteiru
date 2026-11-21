//! Readings in context, after the lattice: numbers and counters, and the few words whose reading the
//! next or previous word decides. The lattice picks each word from its own cost and its neighbours'
//! parts of speech, which cannot say that 一本 is いっぽん, that 二人 is ふたり, or that 行った after an
//! object with を is おこなった. Word boundaries stay as the lattice made them (Miteiru's learner units
//! keep numerals and counters apart: 三 / 人), except that a number written in several kanji becomes
//! one word (二十, 三百), as the tokenizer guidelines ask.

use super::{CounterReading, Kind, Node, Token, Tokenizer};

/// Kanji that write numbers.
const KANJI_DIGITS: &str = "〇一二三四五六七八九十百千万億兆";

pub(super) fn refine(tokenizer: &Tokenizer, tokens: Vec<Token>) -> Vec<Token> {
    let mut tokens = merge_numbers(tokens);
    context(tokenizer, &mut tokens);
    counters(&mut tokens);
    tokens
}

// ---- numbers ---------------------------------------------------------------------------------------

fn is_number(token: &Token) -> bool {
    token.pos == "名詞" && token.pos_detail_1 == "数"
}

fn kanji_digit(character: char) -> Option<u64> {
    "〇一二三四五六七八九"
        .chars()
        .position(|digit| digit == character)
        .map(|value| value as u64)
}

/// The value of a number written in kanji: 二十 (20), 三百五 (305), 二千二十六 (2026), or digit by
/// digit with 〇 (二〇二六). Lists of digits (一二, 五六) are not numbers.
pub fn kanji_number(text: &str) -> Option<u64> {
    if text.is_empty()
        || !text
            .chars()
            .all(|character| KANJI_DIGITS.contains(character))
    {
        return None;
    }
    if text.contains('〇') {
        return text.chars().try_fold(0u64, |value, character| {
            value.checked_mul(10)?.checked_add(kanji_digit(character)?)
        });
    }
    let mut total = 0u64;
    let mut group = 0u64;
    let mut digit: Option<u64> = None;
    let mut small = u64::MAX;
    let mut big = u64::MAX;
    for character in text.chars() {
        match character {
            '十' | '百' | '千' => {
                let unit = match character {
                    '十' => 10,
                    '百' => 100,
                    _ => 1000,
                };
                if unit >= small {
                    return None;
                }
                group += digit.take().unwrap_or(1) * unit;
                small = unit;
            }
            '万' | '億' | '兆' => {
                let unit = match character {
                    '万' => 10_000,
                    '億' => 100_000_000,
                    _ => 1_000_000_000_000,
                };
                group += digit.take().unwrap_or(0);
                // A number does not start with 万 alone (万一 is まんいち, "in case").
                if unit >= big || group == 0 {
                    return None;
                }
                total = total.checked_add(group.checked_mul(unit)?)?;
                group = 0;
                small = u64::MAX;
                big = unit;
            }
            _ => {
                if digit.is_some() {
                    return None;
                }
                digit = Some(kanji_digit(character)?);
            }
        }
    }
    let single = text.chars().count() == 1;
    let structured = text
        .chars()
        .any(|character| "十百千万億兆".contains(character));
    (single || structured).then(|| total + group + digit.unwrap_or(0))
}

/// The value of a number in Arabic digits (ASCII or full width, thousands commas allowed), or None
/// with the last digit when it has a decimal part (3.5).
fn arabic_number(text: &str) -> Option<(Option<u64>, u64)> {
    let digits: String = text
        .chars()
        .filter(|character| !matches!(character, ',' | '，'))
        .map(|character| match character {
            '０'..='９' => {
                char::from_u32(character as u32 - '０' as u32 + '0' as u32).unwrap_or(character)
            }
            '．' => '.',
            other => other,
        })
        .collect();
    if digits.is_empty()
        || !digits
            .chars()
            .all(|character| character.is_ascii_digit() || character == '.')
    {
        return None;
    }
    match digits.split_once('.') {
        Some((_, fraction)) => Some((None, u64::from(fraction.chars().last()?.to_digit(10)?))),
        None => Some((Some(digits.parse().ok()?), 0)),
    }
}

/// How a number ends when read aloud: a counter after it sounds different after いち, ろく, はち,
/// じゅう, ひゃく (いっぽん) and after a final ん (さんぼん, せんぼん, まんぼん, なんぼん).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Ending {
    Digit(u64),
    Ten,
    Hundred,
    Thousand,
    /// 万.
    Man,
    /// 億, 兆.
    Large,
    Zero,
    /// 何 (なん).
    Question,
}

fn ending_of(value: u64) -> Ending {
    if value == 0 {
        Ending::Zero
    } else if value % 10 != 0 {
        Ending::Digit(value % 10)
    } else if value % 100 != 0 {
        Ending::Ten
    } else if value % 1000 != 0 {
        Ending::Hundred
    } else if value % 10_000 != 0 {
        Ending::Thousand
    } else if value % 100_000_000 != 0 {
        Ending::Man
    } else {
        Ending::Large
    }
}

const DIGIT_READINGS: [&str; 10] = [
    "ゼロ",
    "イチ",
    "ニ",
    "サン",
    "ヨン",
    "ゴ",
    "ロク",
    "ナナ",
    "ハチ",
    "キュウ",
];

/// 1 to 9999, as it is read before 万, 億 or 兆 or at the end of a number.
fn group_reading(value: u64) -> String {
    let (thousands, hundreds, tens, ones) =
        (value / 1000, value / 100 % 10, value / 10 % 10, value % 10);
    let mut reading = String::new();
    match thousands {
        0 => {}
        1 => reading.push_str("セン"),
        3 => reading.push_str("サンゼン"),
        8 => reading.push_str("ハッセン"),
        digit => reading.push_str(&format!("{}セン", DIGIT_READINGS[digit as usize])),
    }
    match hundreds {
        0 => {}
        1 => reading.push_str("ヒャク"),
        3 => reading.push_str("サンビャク"),
        6 => reading.push_str("ロッピャク"),
        8 => reading.push_str("ハッピャク"),
        digit => reading.push_str(&format!("{}ヒャク", DIGIT_READINGS[digit as usize])),
    }
    if tens > 1 {
        reading.push_str(DIGIT_READINGS[tens as usize]);
    }
    if tens > 0 {
        reading.push_str("ジュウ");
    }
    if ones > 0 {
        reading.push_str(DIGIT_READINGS[ones as usize]);
    }
    reading
}

/// A number as it is read: 二十 ニジュウ, 三百 サンビャク, 二〇二六 ニセンニジュウロク, 一兆 イッチョウ.
pub fn number_reading(value: u64) -> String {
    if value == 0 {
        return "ゼロ".into();
    }
    let mut reading = String::new();
    for (unit, name) in [
        (1_000_000_000_000u64, "チョウ"),
        (100_000_000, "オク"),
        (10_000, "マン"),
        (1, ""),
    ] {
        let group = value / unit % 10_000;
        if group == 0 {
            continue;
        }
        let part = group_reading(group);
        reading.push_str(&if name == "チョウ" {
            geminate(&part)
        } else {
            part
        });
        reading.push_str(name);
    }
    reading
}

/// The final mora of a number made っ before a counter: イチ → イッ, ロク → ロッ, ハチ → ハッ,
/// ジュウ → ジュッ, ヒャク (ビャク, ピャク) → ヒャッ.
fn geminate(reading: &str) -> String {
    for (from, to) in [
        ("イチ", "イッ"),
        ("ハチ", "ハッ"),
        ("ロク", "ロッ"),
        ("ジュウ", "ジュッ"),
        ("ジュー", "ジュッ"),
        ("ヒャク", "ヒャッ"),
        ("ビャク", "ビャッ"),
        ("ピャク", "ピャッ"),
    ] {
        if let Some(stem) = reading.strip_suffix(from) {
            return format!("{stem}{to}");
        }
    }
    reading.to_string()
}

/// Several numeral tokens that write one number (二 / 十 → 二十, 三 / 百 → 三百, 何 / 百 → 何百) become
/// one token read as a whole; a number the lattice left unread (二十三, 二〇二六) gets its reading.
fn merge_numbers(tokens: Vec<Token>) -> Vec<Token> {
    let numeral = |token: &Token| {
        is_number(token)
            && token
                .surface_form
                .chars()
                .all(|character| KANJI_DIGITS.contains(character))
    };
    // Most lines have no number in kanji: they pass through untouched.
    if !tokens.iter().any(numeral) {
        return tokens;
    }
    let mut result: Vec<Token> = Vec::with_capacity(tokens.len());
    let mut index = 0;
    while index < tokens.len() {
        let question = tokens[index].surface_form == "何" && is_number(&tokens[index]);
        if !numeral(&tokens[index]) && !question {
            result.push(tokens[index].clone());
            index += 1;
            continue;
        }
        let mut end = index + 1;
        while end < tokens.len() && numeral(&tokens[end]) {
            end += 1;
        }
        // The longest run from here that writes one number.
        let mut taken = None;
        for last in (index + 1..=end).rev() {
            let surface: String = tokens[index..last]
                .iter()
                .map(|token| token.surface_form.as_str())
                .collect();
            let reading = if question {
                match surface.as_str() {
                    "何百" => Some("ナンビャク".to_string()),
                    "何千" => Some("ナンゼン".to_string()),
                    "何万" => Some("ナンマン".to_string()),
                    _ => None,
                }
            } else {
                kanji_number(&surface).map(number_reading)
            };
            if let Some(reading) = reading {
                taken = Some((last, surface, reading));
                break;
            }
        }
        match taken {
            Some((last, surface, reading))
                if last > index + 1 || tokens[index].reading.is_none() =>
            {
                let first = &tokens[index];
                let known = tokens[index..last]
                    .iter()
                    .all(|token| token.word_type == "KNOWN");
                result.push(Token {
                    word_id: first.word_id,
                    word_type: if known { "KNOWN" } else { "UNKNOWN" }.into(),
                    word_position: first.word_position,
                    surface_form: surface.clone(),
                    pos: "名詞".into(),
                    pos_detail_1: "数".into(),
                    pos_detail_2: "*".into(),
                    pos_detail_3: "*".into(),
                    conjugated_type: "*".into(),
                    conjugated_form: "*".into(),
                    basic_form: surface,
                    pronunciation: Some(reading.clone()),
                    reading: Some(reading),
                    counter_reading: None,
                });
                index = last;
            }
            _ => {
                result.push(tokens[index].clone());
                index += 1;
            }
        }
    }
    result
}

// ---- counters ----------------------------------------------------------------------------------------

/// How a counter's first sound changes after a number.
#[derive(Clone, Copy)]
enum Sound {
    /// は-row: ぽん after a number made っ (いっ, ろっ, はっ, じゅっ, ひゃっ); after a final ん (三, 何,
    /// 千, 万) ぼん (本, 杯, 匹) or ぷん (分, 泊, 発); after よん ぷん for some (よんぷん), not others
    /// (よんほん).
    H { after_n: char, after_four: bool },
    /// か-row: the number before it becomes っ after 1, 6, 8, 10, 100; 階 and 軒 voice after 三 and 何
    /// (さんがい, なんげん).
    K { voiced_after_n: bool },
    /// さ-row: っ after 1, 8, 10; 足 voices after 三, 何 and 千 (さんぞく).
    S { voiced_after_n: bool },
    /// た-row: っ after 1, 8, 10.
    T,
    /// ぱ-row loanwords (ページ): っ after 1, 6, 8, 10, 100.
    P,
}

/// Counters by surface, with their plain reading (katakana, as IPADIC writes readings).
const COUNTERS: &[(&str, &str, Sound)] = &[
    (
        "本",
        "ホン",
        Sound::H {
            after_n: 'b',
            after_four: false,
        },
    ),
    (
        "杯",
        "ハイ",
        Sound::H {
            after_n: 'b',
            after_four: false,
        },
    ),
    (
        "匹",
        "ヒキ",
        Sound::H {
            after_n: 'b',
            after_four: false,
        },
    ),
    (
        "遍",
        "ヘン",
        Sound::H {
            after_n: 'b',
            after_four: false,
        },
    ),
    (
        "分",
        "フン",
        Sound::H {
            after_n: 'p',
            after_four: true,
        },
    ),
    (
        "泊",
        "ハク",
        Sound::H {
            after_n: 'p',
            after_four: true,
        },
    ),
    (
        "発",
        "ハツ",
        Sound::H {
            after_n: 'p',
            after_four: true,
        },
    ),
    (
        "歩",
        "ホ",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "編",
        "ヘン",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "篇",
        "ヘン",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "品",
        "ヒン",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "票",
        "ヒョウ",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "敗",
        "ハイ",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "版",
        "ハン",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "片",
        "ヘン",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "服",
        "フク",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "拍",
        "ハク",
        Sound::H {
            after_n: 'p',
            after_four: false,
        },
    ),
    (
        "個",
        "コ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "箇",
        "コ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "回",
        "カイ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "階",
        "カイ",
        Sound::K {
            voiced_after_n: true,
        },
    ),
    (
        "軒",
        "ケン",
        Sound::K {
            voiced_after_n: true,
        },
    ),
    (
        "件",
        "ケン",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "曲",
        "キョク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "局",
        "キョク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "缶",
        "カン",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "巻",
        "カン",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "課",
        "カ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "科",
        "カ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "画",
        "カク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "客",
        "キャク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "脚",
        "キャク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "球",
        "キュウ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "級",
        "キュウ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "機",
        "キ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "基",
        "キ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "期",
        "キ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "句",
        "ク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "区",
        "ク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "校",
        "コウ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "項",
        "コウ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "戸",
        "コ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "か月",
        "カゲツ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "ヶ月",
        "カゲツ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "ヵ月",
        "カゲツ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "カ月",
        "カゲツ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "ケ月",
        "カゲツ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "箇月",
        "カゲツ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "か所",
        "カショ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "ヶ所",
        "カショ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "カ所",
        "カショ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "箇所",
        "カショ",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "か国",
        "カコク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "ヶ国",
        "カコク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "カ国",
        "カコク",
        Sound::K {
            voiced_after_n: false,
        },
    ),
    (
        "冊",
        "サツ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "歳",
        "サイ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "才",
        "サイ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "足",
        "ソク",
        Sound::S {
            voiced_after_n: true,
        },
    ),
    (
        "隻",
        "セキ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "席",
        "セキ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "種",
        "シュ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "首",
        "シュ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "周",
        "シュウ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "週",
        "シュウ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "週間",
        "シュウカン",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "章",
        "ショウ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "勝",
        "ショウ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "社",
        "シャ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "世紀",
        "セイキ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "戦",
        "セン",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "色",
        "ショク",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "室",
        "シツ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "セット",
        "セット",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    (
        "センチ",
        "センチ",
        Sound::S {
            voiced_after_n: false,
        },
    ),
    ("頭", "トウ", Sound::T),
    ("通", "ツウ", Sound::T),
    ("着", "チャク", Sound::T),
    ("丁", "チョウ", Sound::T),
    ("点", "テン", Sound::T),
    ("滴", "テキ", Sound::T),
    ("等", "トウ", Sound::T),
    ("対", "ツイ", Sound::T),
    ("棟", "トウ", Sound::T),
    ("艇", "テイ", Sound::T),
    ("店", "テン", Sound::T),
    ("トン", "トン", Sound::T),
    ("ページ", "ページ", Sound::P),
    ("パーセント", "パーセント", Sound::P),
    ("ポイント", "ポイント", Sound::P),
    ("パック", "パック", Sound::P),
    ("ピース", "ピース", Sound::P),
    ("ペア", "ペア", Sound::P),
    ("ポンド", "ポンド", Sound::P),
];

/// The first kana of `kana` moved from one row to another (ホン → ボン).
fn shift(kana: &str, from: &str, to: &str) -> String {
    let mut characters = kana.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };
    match from.chars().position(|character| character == first) {
        Some(index) => to.chars().nth(index).map_or_else(
            || kana.to_string(),
            |shifted| format!("{shifted}{}", characters.as_str()),
        ),
        None => kana.to_string(),
    }
}

const H_ROW: &str = "ハヒフヘホ";
const B_ROW: &str = "バビブベボ";
const P_ROW: &str = "パピプペポ";
const K_ROW: &str = "カキクケコ";
const G_ROW: &str = "ガギグゲゴ";
const S_ROW: &str = "サシスセソ";
const Z_ROW: &str = "ザジズゼゾ";

/// A number before a counter: its value when known, how it ends, and whether it is written in kanji
/// (a kanji number's own reading changes too: いっ, はっ, よ; Arabic digits have no reading).
struct Number {
    value: Option<u64>,
    ending: Ending,
    kanji: bool,
}

fn number(token: &Token) -> Option<Number> {
    if !is_number(token) {
        return None;
    }
    if token.surface_form == "何" {
        return Some(Number {
            value: None,
            ending: Ending::Question,
            kanji: true,
        });
    }
    if let Some(value) = kanji_number(&token.surface_form) {
        return Some(Number {
            value: Some(value),
            ending: ending_of(value),
            kanji: true,
        });
    }
    let (value, last) = arabic_number(&token.surface_form)?;
    let ending = value.map_or(
        if last == 0 {
            Ending::Zero
        } else {
            Ending::Digit(last)
        },
        ending_of,
    );
    Some(Number {
        value,
        ending,
        kanji: false,
    })
}

/// What happens to a kanji number's own reading before a counter.
#[derive(Debug, PartialEq, Eq)]
enum NumberChange {
    /// A reading of its own: 一人 ヒト・リ, 三日 ミッ・カ, 二十歳 ハタ・チ.
    Whole(&'static str),
    /// Its last digit read another way: 四人 よ, 四月 し, 九時 く, 七時 しち.
    LastDigit(&'static str),
    /// Its last mora made っ: いっ, ろっ, はっ, じゅっ, ひゃっ.
    Geminate,
}

struct Counted {
    number: Option<NumberChange>,
    counter: String,
}

/// The readings of a number and the counter after it, when the pair reads other than its parts.
/// `date`: the counter follows a month (四月一日). `fraction`: の and a number follow (三分の一).
fn counted(number: &Number, counter: &str, date: bool, fraction: bool) -> Option<Counted> {
    let digit = |wanted: u64| number.ending == Ending::Digit(wanted);
    let exact = |wanted: u64| number.value == Some(wanted);
    let pair = |change: Option<NumberChange>, counter: &str| {
        Some(Counted {
            number: change,
            counter: counter.to_string(),
        })
    };
    match counter {
        "人" => {
            return if exact(1) {
                pair(Some(NumberChange::Whole("ヒト")), "リ")
            } else if exact(2) {
                pair(Some(NumberChange::Whole("フタ")), "リ")
            } else if digit(4) {
                pair(Some(NumberChange::LastDigit("ヨ")), "ニン")
            } else {
                None
            };
        }
        "日" => {
            const DAYS: &[(u64, &str)] = &[
                (2, "フツ"),
                (3, "ミッ"),
                (4, "ヨッ"),
                (5, "イツ"),
                (6, "ムイ"),
                (7, "ナノ"),
                (8, "ヨウ"),
                (9, "ココノ"),
                (10, "トオ"),
                (14, "ジュウヨッ"),
                (20, "ハツ"),
                (24, "ニジュウヨッ"),
            ];
            if exact(1) && date {
                return pair(Some(NumberChange::Whole("ツイ")), "タチ");
            }
            if let Some((_, prefix)) = DAYS.iter().find(|(value, _)| exact(*value)) {
                return pair(Some(NumberChange::Whole(prefix)), "カ");
            }
            let change = if digit(7) {
                Some(NumberChange::LastDigit("シチ"))
            } else if digit(9) {
                Some(NumberChange::LastDigit("ク"))
            } else {
                None
            };
            return pair(change, "ニチ");
        }
        "月" => {
            if number.ending != Ending::Question
                && !number.value.is_some_and(|value| (1..=12).contains(&value))
            {
                return None;
            }
            let change = match number.value {
                Some(4) => Some(NumberChange::LastDigit("シ")),
                Some(7) => Some(NumberChange::LastDigit("シチ")),
                Some(9) => Some(NumberChange::LastDigit("ク")),
                _ => None,
            };
            return pair(change, "ガツ");
        }
        "時" | "時間" => {
            let change = if digit(4) {
                NumberChange::LastDigit("ヨ")
            } else if digit(7) {
                NumberChange::LastDigit("シチ")
            } else if digit(9) {
                NumberChange::LastDigit("ク")
            } else {
                return None;
            };
            return pair(Some(change), if counter == "時" { "ジ" } else { "ジカン" });
        }
        "年" | "円" => {
            return digit(4).then(|| Counted {
                number: Some(NumberChange::LastDigit("ヨ")),
                counter: if counter == "年" { "ネン" } else { "エン" }.to_string(),
            });
        }
        "歳" | "才" if exact(20) && number.kanji => {
            return pair(Some(NumberChange::Whole("ハタ")), "チ")
        }
        "分" if fraction => return pair(None, "ブン"),
        _ => {}
    }
    let (_, plain, sound) = COUNTERS
        .iter()
        .find(|(surface, _, _)| *surface == counter)?;
    let after_n = matches!(
        number.ending,
        Ending::Digit(3) | Ending::Question | Ending::Thousand | Ending::Man
    );
    let wide = matches!(sound, Sound::H { .. } | Sound::K { .. } | Sound::P);
    let geminates = match number.ending {
        Ending::Digit(1) | Ending::Digit(8) | Ending::Ten => true,
        Ending::Digit(6) | Ending::Hundred => wide,
        _ => false,
    };
    let reading = match sound {
        Sound::H {
            after_n: voiced,
            after_four,
        } => {
            if geminates || (digit(4) && *after_four) {
                shift(plain, H_ROW, P_ROW)
            } else if after_n {
                shift(plain, H_ROW, if *voiced == 'b' { B_ROW } else { P_ROW })
            } else {
                plain.to_string()
            }
        }
        Sound::K {
            voiced_after_n: true,
        } if matches!(number.ending, Ending::Digit(3) | Ending::Question) => {
            shift(plain, K_ROW, G_ROW)
        }
        Sound::S {
            voiced_after_n: true,
        } if matches!(
            number.ending,
            Ending::Digit(3) | Ending::Question | Ending::Thousand
        ) =>
        {
            shift(plain, S_ROW, Z_ROW)
        }
        _ => plain.to_string(),
    };
    Some(Counted {
        number: geminates.then_some(NumberChange::Geminate),
        counter: reading,
    })
}

/// A kanji number's reading after `change`.
fn renumber(reading: &str, change: &NumberChange, ending: Ending) -> String {
    match change {
        NumberChange::Whole(whole) => (*whole).to_string(),
        NumberChange::Geminate => geminate(reading),
        NumberChange::LastDigit(to) => {
            let forms: &[&str] = match ending {
                Ending::Digit(4) => &["ヨン", "シ", "ヨ"],
                Ending::Digit(7) => &["ナナ", "シチ"],
                Ending::Digit(9) => &["キュウ", "ク"],
                _ => &[],
            };
            forms
                .iter()
                .find_map(|from| reading.strip_suffix(from).map(|stem| format!("{stem}{to}")))
                .unwrap_or_else(|| reading.to_string())
        }
    }
}

/// Whether the token at `index` names a month: 四月, 十二月 or 何月 as one word, or 4 / 月.
fn month(tokens: &[Token], index: usize) -> bool {
    let token = &tokens[index];
    match token.surface_form.strip_suffix('月') {
        Some("") => index > 0 && number(&tokens[index - 1]).is_some(),
        Some(head) => head == "何" || kanji_number(head).is_some() || arabic_number(head).is_some(),
        None => false,
    }
}

/// An isolated count also has a pronunciation as a whole. Digits have a spoken value even when
/// their token has no furigana, and native counters have bound forms (一皿 ひとさら, 二箱 ふたはこ).
fn counter_reading(
    amount: &Number,
    counter: &Token,
    counted: Option<&Counted>,
) -> Option<CounterReading> {
    let unit = counter.surface_form.as_str();
    let plain = counter.reading.as_deref()?;
    let number = match amount.ending {
        Ending::Question => "ナン".to_string(),
        _ => number_reading(amount.value?),
    };
    let (number, reading) = match unit {
        "つ" => {
            let stems = [
                "ヒト",
                "フタ",
                "ミッ",
                "ヨッ",
                "イツ",
                "ムッ",
                "ナナ",
                "ヤッ",
                "ココノ",
            ];
            let index = usize::try_from(amount.value?.checked_sub(1)?).ok()?;
            (stems.get(index)?.to_string(), "ツ")
        }
        "皿" | "箱" | "袋" if matches!(amount.value, Some(1 | 2)) => (
            (if amount.value == Some(1) {
                "ヒト"
            } else {
                "フタ"
            })
            .into(),
            plain,
        ),
        "羽" => match amount.ending {
            Ending::Digit(3) | Ending::Question | Ending::Thousand | Ending::Man => (number, "バ"),
            Ending::Digit(6 | 8) | Ending::Ten | Ending::Hundred => (geminate(&number), "パ"),
            _ => (number, "ワ"),
        },
        "月" if counted.is_none() => return None,
        _ => match counted {
            Some(pair) => {
                let number = pair.number.as_ref().map_or(number.clone(), |change| {
                    renumber(&number, change, amount.ending)
                });
                (number, pair.counter.as_str())
            }
            None => (number, plain),
        },
    };
    Some(CounterReading {
        number,
        counter: reading.into(),
        base: plain.into(),
    })
}

fn counters(tokens: &mut [Token]) {
    for index in 1..tokens.len() {
        let counter = &tokens[index];
        let classifier = counter.pos == "名詞"
            && counter.pos_detail_1 == "接尾"
            && counter.pos_detail_2 == "助数詞";
        // IPADIC also splits 2つ and 4月, tagging the unit as an auxiliary or ordinary noun.
        let isolated = tokens.len() == 2;
        if !classifier && !(isolated && matches!(counter.surface_form.as_str(), "つ" | "月")) {
            continue;
        }
        let previous = &tokens[index - 1];
        let amount =
            if isolated && previous.surface_form == "何" && previous.pos_detail_1 == "代名詞" {
                Some(Number {
                    value: None,
                    ending: Ending::Question,
                    kanji: true,
                })
            } else {
                number(previous)
            };
        let Some(amount) = amount else {
            continue;
        };
        let date = index >= 2 && month(tokens, index - 2);
        let fraction = tokens
            .get(index + 1)
            .is_some_and(|token| token.surface_form == "の")
            && tokens
                .get(index + 2)
                .is_some_and(|token| number(token).is_some());
        let pair = counted(&amount, &counter.surface_form, date, fraction);
        if isolated {
            tokens[index].counter_reading = counter_reading(&amount, counter, pair.as_ref());
        }
        if !classifier || !is_number(&tokens[index - 1]) {
            continue;
        }
        let Some(Counted {
            number: change,
            counter: reading,
        }) = pair
        else {
            continue;
        };
        if let Some(change) = change.filter(|_| amount.kanji) {
            let previous = &mut tokens[index - 1];
            if let Some(current) = previous.reading.as_deref() {
                let updated = renumber(current, &change, amount.ending);
                previous.pronunciation = Some(updated.clone());
                previous.reading = Some(updated);
            }
        }
        let counter = &mut tokens[index];
        counter.pronunciation = Some(reading.clone());
        counter.reading = Some(reading);
    }
}

// ---- words the context decides ---------------------------------------------------------------------

/// Nouns that count like counters after 何 (何文字 なんもじ, 何種類 なんしゅるい).
const COUNTING_NOUNS: &[&str] = &[
    "文字", "種類", "時間", "週間", "日間", "年間", "年生", "番目", "曜日", "回目", "人目", "日目",
    "年目", "倍", "割", "歳", "才", "名", "秒", "円", "度", "点", "番", "位", "台", "冊", "枚",
    "個", "本", "杯", "階", "件", "回", "人", "日", "年", "月", "時", "分",
];

fn context(tokenizer: &Tokenizer, tokens: &mut [Token]) {
    for index in 0..tokens.len() {
        let token = &tokens[index];
        let replacement = if token.surface_form == "行っ"
            && token.pos == "動詞"
            && matches!(token.basic_form.as_str(), "行う" | "行く")
        {
            // 行った: おこなった after an object with を in the same clause, いった otherwise.
            let wanted = if has_object(tokens, index) {
                "行う"
            } else {
                "行く"
            };
            let form = token.conjugated_form.as_str();
            (token.basic_form != wanted)
                .then(|| {
                    tokenizer.known_token(&token.surface_form, token.word_position, |fields| {
                        fields[1] == "動詞" && fields[7] == wanted && fields[6] == form
                    })
                })
                .flatten()
        } else if token.surface_form == "何"
            && token.pos == "名詞"
            && token.pos_detail_1 == "代名詞"
            && token.reading.as_deref() == Some("ナニ")
        {
            // 何の, 何と, 何だ, 何です, 何て, and 何 before a counting noun read なん.
            let nan = tokens.get(index + 1).is_some_and(|next| {
                (matches!(next.pos.as_str(), "助詞" | "助動詞")
                    && matches!(
                        next.surface_form.as_str(),
                        "の" | "と" | "だ" | "です" | "て" | "でしょ" | "だろ"
                    ))
                    || (next.pos == "名詞"
                        && (next.pos_detail_2 == "助数詞"
                            || COUNTING_NOUNS.contains(&next.surface_form.as_str())))
            });
            nan.then(|| {
                tokenizer.known_token("何", token.word_position, |fields| {
                    fields[1] == "名詞" && fields[2] == "代名詞" && fields[8] == "ナン"
                })
            })
            .flatten()
        } else if token.pos == "名詞"
            && token.pos_detail_1 == "固有名詞"
            && token.pos_detail_2 == "地域"
            && token.pos_detail_3 == "国"
            && token.surface_form.chars().count() == 1
        {
            // 米から: a one-kanji country abbreviation standing alone is the plain noun (こめ); in 日米
            // or 米大統領 it stays the country.
            let alone_before =
                index == 0 || !matches!(tokens[index - 1].pos.as_str(), "名詞" | "接頭詞");
            let alone_after = tokens
                .get(index + 1)
                .is_none_or(|next| matches!(next.pos.as_str(), "助詞" | "助動詞" | "記号"));
            (alone_before && alone_after)
                .then(|| {
                    tokenizer.known_token(&token.surface_form, token.word_position, |fields| {
                        fields[1] == "名詞" && fields[2] == "一般"
                    })
                })
                .flatten()
        } else {
            None
        };
        if let Some(replacement) = replacement {
            tokens[index] = replacement;
        }
    }
}

/// Whether the clause before `index` has an object marked with を (no verb, adjective, auxiliary,
/// conjunctive particle or punctuation in between) and no destination に or へ right before the verb.
fn has_object(tokens: &[Token], index: usize) -> bool {
    if index > 0
        && tokens[index - 1].pos == "助詞"
        && matches!(tokens[index - 1].surface_form.as_str(), "に" | "へ")
    {
        return false;
    }
    for token in tokens[..index].iter().rev() {
        if token.pos == "助詞" && token.surface_form == "を" {
            return true;
        }
        if matches!(token.pos.as_str(), "動詞" | "形容詞" | "助動詞" | "記号")
            || token.pos_detail_1 == "接続助詞"
        {
            return false;
        }
    }
    false
}

impl Tokenizer {
    /// The dictionary's cheapest entry for `surface` that `accept` takes (its features split on
    /// commas: surface, part of speech, three details, conjugation type and form, base, reading,
    /// pronunciation), as a token at `position`.
    pub(super) fn known_token(
        &self,
        surface: &str,
        position: usize,
        accept: impl Fn(&[&str]) -> bool,
    ) -> Option<Token> {
        let mut best: Option<(i16, u32)> = None;
        self.dictionary.prefixes(surface, |length, key| {
            if length != surface.len() {
                return;
            }
            for id in self.dictionary.known.targets(key) {
                let feature = self.dictionary.known.feature(*id);
                let fields: Vec<&str> = feature.split(',').collect();
                if fields.len() > 8 && accept(&fields) {
                    let cost =
                        super::dictionary::short(&self.dictionary.known.data, *id as usize + 4);
                    if best.is_none_or(|(lowest, _)| cost < lowest) {
                        best = Some((cost, *id));
                    }
                }
            }
        });
        best.map(|(_, id)| {
            let node = Node {
                id,
                kind: Kind::Known,
                start: 0,
                end: 0,
                right: 0,
                cost: 0,
                previous: 0,
            };
            self.format(&node, surface, position)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_in_kanji_have_values_and_readings() {
        for (text, value, reading) in [
            ("二十", 20, "ニジュウ"),
            ("三百", 300, "サンビャク"),
            ("六百", 600, "ロッピャク"),
            ("八千", 8000, "ハッセン"),
            ("三千五百", 3500, "サンゼンゴヒャク"),
            ("二千二十六", 2026, "ニセンニジュウロク"),
            ("二〇二六", 2026, "ニセンニジュウロク"),
            ("十六", 16, "ジュウロク"),
            ("一万", 10_000, "イチマン"),
            ("十万", 100_000, "ジュウマン"),
            ("一兆", 1_000_000_000_000, "イッチョウ"),
        ] {
            assert_eq!(kanji_number(text), Some(value), "{text}");
            assert_eq!(number_reading(value), reading, "{text}");
        }
        for list in ["一二", "五六", "十十", "百十百", "万一", "億"] {
            assert_eq!(kanji_number(list), None, "{list}");
        }
    }

    fn read(number: &str, counter: &str, date: bool) -> String {
        let (parsed, reading) = match kanji_number(number) {
            Some(value) => (
                Number {
                    value: Some(value),
                    ending: ending_of(value),
                    kanji: true,
                },
                number_reading(value),
            ),
            None => (
                Number {
                    value: None,
                    ending: Ending::Question,
                    kanji: true,
                },
                "ナン".to_string(),
            ),
        };
        match counted(&parsed, counter, date, false) {
            Some(Counted {
                number: change,
                counter,
            }) => {
                let numeral = change.map_or_else(
                    || reading.clone(),
                    |change| renumber(&reading, &change, parsed.ending),
                );
                format!("{numeral}{counter}")
            }
            None => format!("{reading}={counter}"),
        }
    }

    #[test]
    fn counters_change_by_how_the_number_ends() {
        for (number, counter, expected) in [
            ("一", "本", "イッポン"),
            ("二", "本", "ニホン"),
            ("三", "本", "サンボン"),
            ("四", "本", "ヨンホン"),
            ("六", "本", "ロッポン"),
            ("八", "本", "ハッポン"),
            ("十", "本", "ジュッポン"),
            ("百", "本", "ヒャッポン"),
            ("三百", "本", "サンビャッポン"),
            ("千", "本", "センボン"),
            ("一万", "本", "イチマンボン"),
            ("何", "本", "ナンボン"),
            ("三", "分", "サンプン"),
            ("四", "分", "ヨンプン"),
            ("五", "分", "ゴフン"),
            ("一", "個", "イッコ"),
            ("六", "個", "ロッコ"),
            ("十", "個", "ジュッコ"),
            ("三", "階", "サンガイ"),
            ("何", "階", "ナンガイ"),
            ("三", "回", "サンカイ"),
            ("一", "か月", "イッカゲツ"),
            ("一", "冊", "イッサツ"),
            ("六", "冊", "ロクサツ"),
            ("三", "足", "サンゾク"),
            ("一", "点", "イッテン"),
            ("十", "ページ", "ジュッページ"),
            ("一", "人", "ヒトリ"),
            ("二", "人", "フタリ"),
            ("四", "人", "ヨニン"),
            ("十一", "人", "ジュウイチ=人"),
            ("三", "日", "ミッカ"),
            ("十", "日", "トオカ"),
            ("二十", "日", "ハツカ"),
            ("十七", "日", "ジュウシチニチ"),
            ("一", "日", "イチニチ"),
            ("四", "月", "シガツ"),
            ("九", "時", "クジ"),
            ("四", "年", "ヨネン"),
            ("二十", "歳", "ハタチ"),
            ("一", "歳", "イッサイ"),
            ("八", "歳", "ハッサイ"),
        ] {
            assert_eq!(read(number, counter, false), expected, "{number}{counter}");
        }
        assert_eq!(read("一", "日", true), "ツイタチ");
    }

    #[test]
    fn counters_after_digits_change_only_the_counter() {
        let number = number(&Token {
            word_id: -1,
            word_type: "UNKNOWN".into(),
            word_position: 1,
            surface_form: "３".into(),
            pos: "名詞".into(),
            pos_detail_1: "数".into(),
            pos_detail_2: "*".into(),
            pos_detail_3: "*".into(),
            conjugated_type: "*".into(),
            conjugated_form: "*".into(),
            basic_form: "*".into(),
            reading: None,
            pronunciation: None,
            counter_reading: None,
        })
        .unwrap();
        assert!(!number.kanji);
        assert_eq!(
            counted(&number, "本", false, false).unwrap().counter,
            "ボン"
        );
        assert_eq!(counted(&number, "分", false, true).unwrap().counter, "ブン");
    }
}
