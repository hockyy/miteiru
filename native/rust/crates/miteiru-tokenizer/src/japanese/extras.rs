use crate::lexicon::{ExtraWord, WordSource};

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct DictionaryWord {
    pub surface: String,
    pub reading: String,
    pub conditions: u16,
    pub noun: bool,
}

pub fn jmdict_words(record: &serde_json::Value) -> Vec<DictionaryWord> {
    serde_json::from_value::<JmdictRecord>(record.clone())
        .map(JmdictRecord::words)
        .unwrap_or_default()
}

pub fn parse_jmdict_words(record: &str) -> Result<Vec<DictionaryWord>, String> {
    serde_json::from_str::<JmdictRecord>(record)
        .map(JmdictRecord::words)
        .map_err(|error| format!("Invalid JMdict entry: {error}"))
}

#[derive(serde::Deserialize)]
struct WrittenForm {
    text: String,
}

#[derive(serde::Deserialize)]
struct Reading {
    text: String,
    #[serde(default, rename = "appliesToKanji")]
    applies: Vec<String>,
}

#[derive(serde::Deserialize)]
struct Sense {
    #[serde(default, rename = "partOfSpeech")]
    tags: Vec<String>,
}

#[derive(serde::Deserialize)]
struct JmdictRecord {
    #[serde(default)]
    kanji: Vec<WrittenForm>,
    #[serde(default)]
    kana: Vec<Reading>,
    #[serde(default)]
    sense: Vec<Sense>,
}

impl JmdictRecord {
    fn words(self) -> Vec<DictionaryWord> {
        let tags: Vec<_> = self
            .sense
            .iter()
            .flat_map(|sense| &sense.tags)
            .map(String::as_str)
            .collect();
        let conditions = super::suffix::pos_bits(tags.iter().copied());
        let noun = tags.iter().any(|tag| matches!(*tag, "n" | "n-pr"))
            && tags
                .iter()
                .all(|tag| matches!(*tag, "n" | "n-pr" | "vs" | "adj-no" | "adj-na"));
        let mut words = Vec::new();
        for kanji in self.kanji {
            let reading = self
                .kana
                .iter()
                .find(|reading| {
                    reading.applies.is_empty()
                        || reading
                            .applies
                            .iter()
                            .any(|value| value == "*" || value == &kanji.text)
                })
                .map(|reading| reading.text.clone())
                .unwrap_or_default();
            words.push(DictionaryWord {
                surface: kanji.text,
                reading,
                conditions,
                noun,
            });
        }
        for reading in self.kana {
            words.push(DictionaryWord {
                surface: reading.text.clone(),
                reading: reading.text,
                conditions,
                noun: false,
            });
        }
        words
    }
}

#[derive(Default)]
pub(super) struct ExtraLexicon {
    nodes: Vec<(u32, u32, u32)>,
    edges: Vec<(u8, u32)>,
    pub words: Vec<ExtraWord>,
}

impl ExtraLexicon {
    pub fn new(words: impl IntoIterator<Item = ExtraWord>) -> Self {
        let mut words: Vec<_> = words
            .into_iter()
            .filter(|word| !word.surface.is_empty() && word.surface.chars().count() <= 128)
            .collect();
        words.sort_unstable_by(|left, right| left.surface.cmp(&right.surface));
        words.dedup_by(|later, earlier| {
            if later.surface != earlier.surface {
                return false;
            }
            earlier.source = earlier.source.max(later.source);
            true
        });
        words.shrink_to_fit();
        let mut nodes = Vec::with_capacity(words.len() * 4 + 1);
        let mut edges = Vec::with_capacity(words.len() * 4);
        nodes.push((0, 0, u32::MAX));
        let mut stack = vec![(0usize, 0usize, words.len(), 0usize)];
        while let Some((node, mut start, end, depth)) = stack.pop() {
            let terminal = if start < end && words[start].surface.len() == depth {
                start += 1;
                (start - 1) as u32
            } else {
                u32::MAX
            };
            let edge_start = edges.len() as u32;
            while start < end {
                let byte = words[start].surface.as_bytes()[depth];
                let mut next = start + 1;
                while next < end && words[next].surface.as_bytes().get(depth) == Some(&byte) {
                    next += 1;
                }
                let child = nodes.len();
                nodes.push((0, 0, u32::MAX));
                edges.push((byte, child as u32));
                stack.push((child, start, next, depth + 1));
                start = next;
            }
            nodes[node] = (edge_start, edges.len() as u32 - edge_start, terminal);
        }
        nodes.shrink_to_fit();
        edges.shrink_to_fit();
        Self {
            nodes,
            edges,
            words,
        }
    }

    pub fn prefixes(&self, tail: &str, mut found: impl FnMut(usize, usize)) {
        if self.nodes.is_empty() {
            return;
        }
        let mut node = 0;
        for (offset, byte) in tail.bytes().enumerate() {
            let (start, length, _) = self.nodes[node];
            let edges = &self.edges[start as usize..(start + length) as usize];
            let Ok(index) = edges.binary_search_by_key(&byte, |edge| edge.0) else {
                break;
            };
            node = edges[index].1 as usize;
            if self.nodes[node].2 != u32::MAX {
                found(offset + 1, self.nodes[node].2 as usize);
            }
        }
    }

    pub fn memory_bytes(&self) -> usize {
        self.nodes.capacity() * std::mem::size_of::<(u32, u32, u32)>()
            + self.edges.capacity() * std::mem::size_of::<(u8, u32)>()
            + self
                .words
                .iter()
                .map(|word| word.surface.capacity() + std::mem::size_of::<ExtraWord>())
                .sum::<usize>()
    }
}

pub(super) fn word_cost(source: WordSource, length: usize) -> i32 {
    let length = length.min(32) as i32;
    match source {
        WordSource::AppDictionary => 6000 - 300 * length,
        WordSource::UserAi => -8000 - 1000 * length,
        WordSource::UserManual => -16000 - 2000 * length,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_prefixes_and_strongest_source() {
        let lexicon = ExtraLexicon::new([
            ExtraWord {
                surface: "推し".into(),
                source: WordSource::UserAi,
            },
            ExtraWord {
                surface: "推し活".into(),
                source: WordSource::AppDictionary,
            },
            ExtraWord {
                surface: "推し".into(),
                source: WordSource::UserManual,
            },
        ]);
        let mut found = Vec::new();
        lexicon.prefixes("推し活中", |end, index| {
            found.push((end, lexicon.words[index].source))
        });
        assert_eq!(
            found,
            [(6, WordSource::UserManual), (9, WordSource::AppDictionary)]
        );
        assert!(word_cost(WordSource::UserManual, 2) < word_cost(WordSource::UserAi, 2));
        assert!(word_cost(WordSource::UserAi, 2) < word_cost(WordSource::AppDictionary, 2));
    }

    #[test]
    fn jmdict_preserves_reading_restrictions_and_excludes_expressions() {
        let record = serde_json::json!({ "kanji": [{"text":"甲"},{"text":"乙"}], "kana": [
            {"text":"こう","appliesToKanji":["甲"]},{"text":"おつ","appliesToKanji":["乙"]}],
            "sense":[{"partOfSpeech":["n"]}] });
        let words = jmdict_words(&record);
        assert_eq!(words[0].reading, "こう");
        assert_eq!(words[1].reading, "おつ");
        assert!(words[0].noun);
        assert!(!words[2].noun);
        let mut expression = record;
        expression["sense"] = serde_json::json!([{"partOfSpeech":["n","exp"]}]);
        assert!(!jmdict_words(&expression)[0].noun);
    }
}
