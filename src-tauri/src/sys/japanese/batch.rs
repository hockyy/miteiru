use miteiru_tokenizer::japanese::Token;
use std::collections::HashMap;

type Features<'a> = [&'a str; 6];
type Word<'a> = (
  i64,
  &'a str,
  usize,
  &'a str,
  u32,
  &'a str,
  Option<&'a str>,
  Option<&'a str>,
);

/// An internal IPC envelope; public tokens retain all kuromoji-compatible fields.
/// Repeated POS/conjugation strings and field names need not cross IPC per word.
#[derive(serde::Serialize)]
pub(super) struct Batch<'a> {
  features: Vec<Features<'a>>,
  tokens: Vec<Vec<Word<'a>>>,
}

impl<'a> Batch<'a> {
  pub fn new(lines: &'a [Vec<Token>]) -> Self {
    let mut features = Vec::new();
    let mut indexes = HashMap::new();
    let tokens = lines
      .iter()
      .map(|line| {
        line
          .iter()
          .map(|word| {
            let feature = [
              word.pos.as_str(),
              &word.pos_detail_1,
              &word.pos_detail_2,
              &word.pos_detail_3,
              &word.conjugated_type,
              &word.conjugated_form,
            ];
            let index = *indexes.entry(feature).or_insert_with(|| {
              let index = features.len() as u32;
              features.push(feature);
              index
            });
            (
              word.word_id,
              word.word_type.as_str(),
              word.word_position,
              word.surface_form.as_str(),
              index,
              word.basic_form.as_str(),
              word.reading.as_deref(),
              word.pronunciation.as_deref(),
            )
          })
          .collect()
      })
      .collect();
    Self { features, tokens }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn matches_the_worker_codec_fixture_including_unknown_and_extra_words() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(concat!(
      env!("CARGO_MANIFEST_DIR"),
      "/../tests/fixtures/japanese-token-batch.json"
    )))
    .unwrap();
    let raw: Vec<Vec<Token>> = serde_json::from_value(fixture["raw"].clone()).unwrap();
    assert_eq!(
      serde_json::to_value(Batch::new(&raw)).unwrap(),
      fixture["wire"]
    );
  }
}
