//! A byte-indexed, minimum-cost IPADIC lattice with independent app and user lexicons.

mod dictionary;
mod extras;
pub mod suffix;

use crate::lexicon::{ExtraWord, WordSource};
use dictionary::{short, Dictionary};
pub use extras::{jmdict_words, parse_jmdict_words, DictionaryWord};
use extras::{word_cost, ExtraLexicon};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Token {
    pub word_id: i64,
    pub word_type: String,
    pub word_position: usize,
    pub surface_form: String,
    pub pos: String,
    pub pos_detail_1: String,
    pub pos_detail_2: String,
    pub pos_detail_3: String,
    pub conjugated_type: String,
    pub conjugated_form: String,
    pub basic_form: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reading: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pronunciation: Option<String>,
}

#[derive(Clone, Copy)]
enum Kind {
    Known,
    Unknown,
    App,
    User,
}

struct Node {
    id: u32,
    kind: Kind,
    start: usize,
    end: usize,
    right: u16,
    cost: i64,
    previous: usize,
}

struct Candidate {
    id: u32,
    kind: Kind,
    end: usize,
    left: u16,
    right: u16,
    cost: i32,
}

pub struct Tokenizer {
    dictionary: Dictionary,
    app: ExtraLexicon,
    user: ExtraLexicon,
    pub(crate) lemmas: HashMap<Box<str>, u16>,
    app_readings: Vec<Box<str>>,
    noun_context: (u16, u16),
}

impl Tokenizer {
    pub fn from_directory(directory: &Path) -> Result<Self, String> {
        Self::load_with(|name| dictionary::gzip_asset(directory, name))
    }

    pub fn load_with(read: impl FnMut(&str) -> Result<Vec<u8>, String>) -> Result<Self, String> {
        let dictionary = Dictionary::load(read)?;
        let mut noun_context = (0, 0);
        dictionary.prefixes("猫", |length, key| {
            if length != "猫".len() {
                return;
            }
            for id in dictionary.known.targets(key) {
                if dictionary.known.feature(*id).starts_with("猫,名詞,一般,") {
                    noun_context = (
                        short(&dictionary.known.data, *id as usize) as u16,
                        short(&dictionary.known.data, *id as usize + 2) as u16,
                    );
                }
            }
        });
        Ok(Self {
            dictionary,
            app: ExtraLexicon::default(),
            user: ExtraLexicon::default(),
            lemmas: HashMap::new(),
            app_readings: Vec::new(),
            noun_context,
        })
    }

    pub fn has_surface(&self, surface: &str) -> bool {
        self.dictionary.has_surface(surface)
    }

    pub fn set_user_words(&mut self, words: &[ExtraWord]) {
        self.user = ExtraLexicon::new(
            words
                .iter()
                .filter(|word| word.source != WordSource::AppDictionary)
                .cloned(),
        );
    }

    pub fn set_dictionary_words(&mut self, words: impl IntoIterator<Item = DictionaryWord>) {
        self.set_dictionary_words_with_app(words, false);
    }

    pub fn set_dictionary_words_with_app(
        &mut self,
        words: impl IntoIterator<Item = DictionaryWord>,
        app_words: bool,
    ) {
        self.load_dictionary_words(app_words, |push| {
            for word in words {
                push(word);
            }
            Ok(())
        })
        .expect("infallible dictionary scan");
    }

    pub fn load_dictionary_words(
        &mut self,
        app_words: bool,
        scan: impl FnOnce(&mut dyn FnMut(DictionaryWord)) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut lemmas = HashMap::<Box<str>, u16>::new();
        let mut candidates = BTreeMap::<String, (Box<str>, bool)>::new();
        scan(&mut |word| {
            let length = word.surface.chars().count();
            if app_words
                && (2..=8).contains(&length)
                && word.surface.chars().all(is_kanji)
                && !looks_counted(&word.surface)
                && !self.dictionary.has_surface(&word.surface)
            {
                candidates
                    .entry(word.surface.clone())
                    .and_modify(|(_, noun)| *noun &= word.noun)
                    .or_insert((word.reading.into_boxed_str(), word.noun));
            }
            lemmas
                .entry(word.surface.into_boxed_str())
                .and_modify(|bits| *bits |= word.conditions)
                .or_insert(word.conditions);
        })?;
        let (words, readings): (Vec<_>, Vec<_>) = candidates
            .into_iter()
            .filter(|(_, (_, noun))| *noun)
            .map(|(surface, (reading, _))| {
                (
                    ExtraWord {
                        surface,
                        source: WordSource::AppDictionary,
                    },
                    reading,
                )
            })
            .unzip();
        self.lemmas = lemmas;
        self.app = ExtraLexicon::new(words);
        self.app_readings = readings;
        Ok(())
    }

    pub fn app_word_count(&self) -> usize {
        self.app.words.len()
    }

    pub fn memory_bytes(&self) -> usize {
        self.dictionary.memory_bytes()
            + self.app.memory_bytes()
            + self.user.memory_bytes()
            + self.lemmas.capacity() * (std::mem::size_of::<(Box<str>, u16)>() + 1)
            + self.lemmas.keys().map(|key| key.len()).sum::<usize>()
            + self.app_readings.capacity() * std::mem::size_of::<Box<str>>()
            + self
                .app_readings
                .iter()
                .map(|reading| reading.len())
                .sum::<usize>()
    }

    pub fn tokenize(&self, text: &str) -> Vec<Token> {
        if text.is_empty() {
            return Vec::new();
        }
        let mut group_ends = vec![0; text.len() + 1];
        let mut following = None;
        for (start, character) in text.char_indices().rev() {
            let (category, definition) = self.dictionary.category(character);
            let end = match following {
                Some((next_category, next_end))
                    if definition.group && category == next_category =>
                {
                    next_end
                }
                _ => start + character.len_utf8(),
            };
            group_ends[start] = end;
            following = Some((category, end));
        }
        let mut ends: Vec<Vec<usize>> = vec![Vec::new(); text.len() + 1];
        let mut nodes = vec![Node {
            id: 0,
            kind: Kind::Known,
            start: 0,
            end: 0,
            right: 0,
            cost: 0,
            previous: 0,
        }];
        ends[0].push(0);
        let mut candidates = Vec::with_capacity(32);
        for (start, character) in text.char_indices() {
            if ends[start].is_empty() {
                continue;
            }
            candidates.clear();
            let tail = &text[start..];
            self.dictionary.prefixes(tail, |length, key| {
                for id in self.dictionary.known.targets(key) {
                    candidates.push(self.candidate(*id, Kind::Known, start + length, 0));
                }
            });
            let known = !candidates.is_empty();
            if needs_normalization(character) {
                let (normalized, offsets) = normalized_prefix(tail);
                self.dictionary.prefixes(&normalized, |length, key| {
                    if let Some(Some(original)) = offsets.get(length) {
                        for id in self.dictionary.known.targets(key) {
                            candidates.push(self.candidate(
                                *id,
                                Kind::Known,
                                start + original,
                                200,
                            ));
                        }
                    }
                });
            }
            for (lexicon, kind) in [(&self.app, Kind::App), (&self.user, Kind::User)] {
                lexicon.prefixes(tail, |length, index| {
                    candidates.push(Candidate {
                        id: index as u32,
                        kind,
                        end: start + length,
                        left: self.noun_context.0,
                        right: self.noun_context.1,
                        cost: word_cost(
                            lexicon.words[index].source,
                            tail[..length].chars().count(),
                        ),
                    })
                });
            }
            let (category_id, category) = self.dictionary.category(character);
            if let Some((length, numeric)) = shape_length(tail) {
                let mut previous = text[..start].chars().rev();
                let preceding = previous.next();
                let numeric_char = |character: char| {
                    character.is_ascii_digit()
                        || ('０'..='９').contains(&character)
                        || is_han_number(character)
                };
                let continuation = numeric
                    && preceding.is_some_and(|character| {
                        numeric_char(character)
                            || character.is_ascii_alphabetic()
                            || (matches!(character, '.' | '．' | ',' | ':' | '：')
                                && previous.next().is_some_and(numeric_char))
                    });
                let longest = candidates
                    .iter()
                    .map(|candidate| candidate.end - start)
                    .max()
                    .unwrap_or(0);
                if !continuation
                    && length > longest
                    && (numeric || start + length != group_ends[start])
                {
                    let template = self.dictionary.category(if numeric { '0' } else { 'A' }).0;
                    for id in self.dictionary.unknown.targets(template) {
                        let mut candidate = self.candidate(*id, Kind::Unknown, start + length, 0);
                        if numeric {
                            candidate.cost = candidate
                                .cost
                                .min(1000 - 1000 * tail[..length].chars().count() as i32);
                        }
                        candidates.push(candidate);
                    }
                }
            }
            if !known || category.invoke {
                let length = group_ends[start] - start;
                for id in self.dictionary.unknown.targets(category_id) {
                    candidates.push(self.candidate(*id, Kind::Unknown, start + length, 0));
                }
            }
            for candidate in &candidates {
                let mut best = i64::MAX;
                let mut previous = 0;
                for predecessor in &ends[start] {
                    let node = &nodes[*predecessor];
                    let cost = node.cost
                        + i64::from(self.dictionary.connection(node.right, candidate.left))
                        + i64::from(candidate.cost);
                    if cost < best {
                        best = cost;
                        previous = *predecessor;
                    }
                }
                let index = nodes.len();
                nodes.push(Node {
                    id: candidate.id,
                    kind: candidate.kind,
                    start,
                    end: candidate.end,
                    right: candidate.right,
                    cost: best,
                    previous,
                });
                ends[candidate.end].push(index);
            }
        }
        let Some(mut index) = ends[text.len()].iter().copied().min_by_key(|index| {
            nodes[*index].cost + i64::from(self.dictionary.connection(nodes[*index].right, 0))
        }) else {
            return Vec::new();
        };
        let mut path = Vec::new();
        while index != 0 {
            path.push(index);
            index = nodes[index].previous;
        }
        path.reverse();
        let mut position = 1;
        path.into_iter()
            .map(|index| {
                let node = &nodes[index];
                let surface = &text[node.start..node.end];
                let token = self.format(node, surface, position);
                position += surface.chars().count();
                token
            })
            .collect()
    }

    fn candidate(&self, id: u32, kind: Kind, end: usize, penalty: i32) -> Candidate {
        let entries = if matches!(kind, Kind::Unknown) {
            &self.dictionary.unknown
        } else {
            &self.dictionary.known
        };
        let offset = id as usize;
        Candidate {
            id,
            kind,
            end,
            left: short(&entries.data, offset) as u16,
            right: short(&entries.data, offset + 2) as u16,
            cost: i32::from(short(&entries.data, offset + 4)) + penalty,
        }
    }

    fn format(&self, node: &Node, surface: &str, position: usize) -> Token {
        let unknown = matches!(node.kind, Kind::Unknown);
        let extra = matches!(node.kind, Kind::App | Kind::User);
        let entries = if unknown {
            &self.dictionary.unknown
        } else {
            &self.dictionary.known
        };
        let features: Vec<_> = if extra {
            Vec::new()
        } else {
            entries.feature(node.id).split(',').collect()
        };
        let field = |index| features.get(index).copied().unwrap_or("*").to_string();
        let reading = if matches!(node.kind, Kind::App) {
            Some(self.app_readings[node.id as usize].to_string())
        } else if unknown || extra {
            None
        } else {
            features.get(8).map(|value| (*value).to_string())
        };
        Token {
            word_id: if extra {
                -(node.id as i64) - 1
            } else {
                node.id as i64
            },
            word_type: if unknown { "UNKNOWN" } else { "KNOWN" }.into(),
            word_position: position,
            surface_form: surface.into(),
            pos: if extra { "名詞".into() } else { field(1) },
            pos_detail_1: if extra { "一般".into() } else { field(2) },
            pos_detail_2: field(3),
            pos_detail_3: field(4),
            conjugated_type: field(5),
            conjugated_form: field(6),
            basic_form: if extra { surface.into() } else { field(7) },
            pronunciation: if unknown || matches!(node.kind, Kind::User) {
                None
            } else if extra {
                reading.clone()
            } else {
                features.get(9).map(|value| (*value).into())
            },
            reading,
        }
    }

    pub fn tokenize_with_suffixes(&self, text: &str) -> Vec<Token> {
        suffix::join(self.tokenize(text), &self.lemmas, |tail| {
            self.tokenize(tail)
        })
    }
}

fn is_kanji(character: char) -> bool {
    matches!(character as u32, 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0x20000..=0x2ffff)
        || character == '々'
}

fn is_han_number(character: char) -> bool {
    "〇零一二三四五六七八九十百千万億兆".contains(character)
}

fn looks_counted(surface: &str) -> bool {
    let rest = surface.trim_start_matches(is_han_number);
    rest.len() != surface.len()
        && (rest.chars().count() <= 1
            || rest.starts_with(|character: char| {
                "人年月日歳才回番階枚個本頭匹羽台冊杯度時分秒割組面点級円銭".contains(character)
            }))
}

fn needs_normalization(character: char) -> bool {
    matches!(character as u32, 0xff01..=0xff5e | 0xff66..=0xff9f)
}

fn shape_length(text: &str) -> Option<(usize, bool)> {
    let first = text.chars().next()?;
    let digit = |character: char| character.is_ascii_digit() || ('０'..='９').contains(&character);
    let latin = |character: char| {
        character.is_ascii_alphabetic()
            || ('Ａ'..='Ｚ').contains(&character)
            || ('ａ'..='ｚ').contains(&character)
    };
    let mut numeric = digit(first) || is_han_number(first);
    if !numeric && !latin(first) && !matches!(first, '#' | '@') {
        return None;
    }
    let mut end = 0;
    let mut count = 0;
    for (offset, character) in text.char_indices().take(256) {
        count += 1;
        let next = text[offset + character.len_utf8()..].chars().next();
        let allowed = if numeric {
            if digit(character) || is_han_number(character) {
                true
            } else if matches!(character, 'D' | 'G' | 'K')
                && text[..offset].chars().all(digit)
                && next.is_none_or(|character| !latin(character) && !digit(character))
            {
                numeric = false;
                true
            } else if matches!(character, '.' | '．' | ':' | '：') {
                next.is_some_and(digit)
            } else if matches!(character, '%' | '％') {
                end = offset + character.len_utf8();
                break;
            } else if character == ',' {
                let mut following = text[offset + 1..].chars();
                following
                    .by_ref()
                    .take(3)
                    .filter(|character| digit(*character))
                    .count()
                    == 3
                    && following.next().is_none_or(|character| !digit(character))
            } else {
                false
            }
        } else {
            latin(character)
                || digit(character)
                || character == '_'
                || (offset == 0
                    && matches!(character, '#' | '@')
                    && next.is_some_and(|character| latin(character) || digit(character)))
                || (offset > 0
                    && matches!(character, '-' | '－' | '\'' | '’' | '.')
                    && next.is_some_and(|character| latin(character) || digit(character)))
        };
        if !allowed {
            break;
        }
        end = offset + character.len_utf8();
    }
    if count >= 256 {
        return None;
    }
    (end > first.len_utf8()).then_some((end, numeric))
}

fn normalized_prefix(text: &str) -> (String, Vec<Option<usize>>) {
    let mut normalized = String::new();
    let mut offsets = vec![Some(0)];
    let mut characters = text.char_indices().peekable();
    for _ in 0..128 {
        let Some((start, character)) = characters.next() else {
            break;
        };
        if !needs_normalization(character) {
            break;
        }
        let mut end = start + character.len_utf8();
        if characters
            .peek()
            .is_some_and(|(_, next)| matches!(*next, '\u{ff9e}' | '\u{ff9f}'))
        {
            let (offset, next) = characters.next().unwrap();
            end = offset + next.len_utf8();
        }
        normalized.extend(text[start..end].nfkc());
        offsets.resize(normalized.len() + 1, None);
        offsets[normalized.len()] = Some(end);
    }
    (normalized, offsets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalization_preserves_original_boundaries() {
        let (text, offsets) = normalized_prefix("ｶﾞｯﾂＰＣ１２です");
        assert_eq!(text, "ガッツPC12");
        assert_eq!(offsets[text.len()], Some("ｶﾞｯﾂＰＣ１２".len()));
        assert_eq!(offsets[1], None);
    }

    #[test]
    fn malformed_dictionary_returns_error() {
        assert!(Tokenizer::load_with(|_| Ok(vec![0; 3])).is_err());
    }

    #[test]
    fn subtitle_shapes_stop_at_script_and_punctuation_boundaries() {
        for (text, expected, numeric) in [
            ("Wi-Fiで", "Wi-Fi", false),
            ("USB-Cを", "USB-C", false),
            ("abc123です", "abc123", false),
            ("3D映画", "3D", false),
            ("#tag。", "#tag", false),
            ("3.5秒", "3.5", true),
            ("20%です", "20%", true),
            ("12:30に", "12:30", true),
            ("1,980円", "1,980", true),
            ("五百円", "五百", true),
        ] {
            assert_eq!(
                shape_length(text),
                Some((expected.len(), numeric)),
                "{text}"
            );
        }
        assert_eq!(shape_length("1,2人"), None);
        assert_eq!(shape_length("2.5kg"), Some((3, true)));
        assert_eq!(shape_length("500ml"), Some((3, true)));
        assert_eq!(shape_length("1万2000円"), Some(("1万2000".len(), true)));
        assert!(looks_counted("一兎"));
        assert!(looks_counted("一番上"));
        assert!(!looks_counted("三角形"));
    }
}
