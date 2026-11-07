//! Development builds only: packaged builds read the dictionaries from data tables (sys/table.rs,
//! docs/DATA_FORMAT.md) and never import. Without a table, the first load imports the JSON here.
//!
//! First-run dictionary import, in Rust. The bundled JMdict (110 MB of JSON) and KANJIDIC used to be
//! parsed in the page's worker and sent here 10k keys at a time. Reading them here skips the JS work
//! and the copies between the worker, the page and Rust.
//!
//! The key layouts are the ones main/dictionary/jmdictDb.ts, kanjidicDb.ts and chineseDictionaryDb.ts
//! write (they still do for plain `level` in the tests). Each record's value is its text in the file
//! with the whitespace between tokens removed (compact_json), which is what `JSON.stringify` of the
//! parsed record gives: JMdict holds compact JSON already, the Chinese files are Python's
//! `json.dumps` with spaces after `:` and `,`.

use std::borrow::Cow;

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::value::RawValue;

use super::kv::{self, Op};

/// Which dictionary a file is, and so which keys it becomes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Layout {
  Jmdict,
  Kanjidic,
  /// CC-CEDICT (chinese.json) and CantoDict (cantodict.json).
  Chinese,
}

impl Layout {
  pub fn parse(name: &str) -> Result<Self, String> {
    match name {
      "jmdict" => Ok(Self::Jmdict),
      "kanjidic" => Ok(Self::Kanjidic),
      "chinese" => Ok(Self::Chinese),
      other => Err(format!("EINVAL: invalid argument, unknown dictionary layout '{other}'")),
    }
  }
}

/// What the page writes last, once the import is complete (levelDictionary.ts openDictionary).
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
  /// JMdict and KANJIDIC have one; the Chinese dictionaries only a version.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub dict_date: Option<String>,
  pub version: String,
}

#[derive(Deserialize)]
struct Text {
  text: String,
}

#[derive(Deserialize)]
struct WordKeys {
  id: String,
  #[serde(default)]
  kanji: Vec<Text>,
  #[serde(default)]
  kana: Vec<Text>,
}

#[derive(Deserialize)]
struct CharacterKeys {
  literal: String,
}

#[derive(Deserialize)]
struct ChineseKeys {
  id: serde_json::Value,
  #[serde(default)]
  content: Option<String>,
  #[serde(default)]
  simplified: Option<String>,
}

#[derive(Deserialize)]
struct ChineseFile<'a> {
  version: String,
  #[serde(borrow)]
  words: Vec<&'a RawValue>,
  #[serde(borrow)]
  characters: Vec<&'a RawValue>,
}

/// `text` (one JSON value) without the whitespace between its tokens, as `JSON.stringify` writes
/// it; strings, escapes included, stay as they are. Borrowed when there is nothing to remove.
pub fn compact_json(text: &str) -> Cow<'_, str> {
  let is_space = |b: u8| matches!(b, b' ' | b'\t' | b'\n' | b'\r');
  // JSON's structure is ASCII, so bytes can be scanned without splitting a UTF-8 character.
  let (mut in_string, mut escaped) = (false, false);
  let mut keep = |b: u8| -> bool {
    if in_string {
      if escaped {
        escaped = false;
      } else if b == b'\\' {
        escaped = true;
      } else if b == b'"' {
        in_string = false;
      }
      true
    } else if b == b'"' {
      in_string = true;
      true
    } else {
      !is_space(b)
    }
  };
  let bytes = text.as_bytes();
  let Some(first) = bytes.iter().position(|&b| !keep(b)) else {
    return Cow::Borrowed(text);
  };
  let mut out = Vec::with_capacity(text.len());
  out.extend_from_slice(&bytes[..first]);
  out.extend(bytes[first + 1..].iter().copied().filter(|&b| keep(b)));
  // Only ASCII whitespace was removed, so the rest is still UTF-8.
  Cow::Owned(String::from_utf8(out).expect("removing ASCII whitespace keeps UTF-8 valid"))
}

/// The id a record is stored under, as the page's template string would write it.
fn id_text(id: &serde_json::Value) -> String {
  match id {
    serde_json::Value::String(s) => s.clone(),
    other => other.to_string(),
  }
}

/// Ids made unique in file order, as chineseDictionaryDb.ts storageIds does: cantodict.json's
/// character list is two lists whose ids both start at 0, so a repeat gets `~<index>`.
fn storage_ids(ids: Vec<String>) -> Vec<String> {
  let mut used = std::collections::HashSet::new();
  ids
    .into_iter()
    .enumerate()
    .map(|(index, id)| {
      let id = if used.contains(&id) { format!("{id}~{index}") } else { id };
      used.insert(id.clone());
      id
    })
    .collect()
}

/// Every substring of `text`, by character (levelDictionary.ts allSubstrings).
fn all_substrings(text: &str, into: &mut std::collections::HashSet<String>) {
  let chars: Vec<char> = text.chars().collect();
  for start in 0..chars.len() {
    for end in start + 1..=chars.len() {
      into.insert(chars[start..end].iter().collect());
    }
  }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JmdictFile<'a> {
  version: String,
  dict_date: String,
  #[serde(borrow)]
  tags: &'a RawValue,
  #[serde(borrow)]
  dict_revisions: &'a RawValue,
  #[serde(borrow)]
  words: Vec<&'a RawValue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct KanjidicFile<'a> {
  version: String,
  dict_date: String,
  #[serde(borrow)]
  characters: Vec<&'a RawValue>,
}

fn bad_file(what: &str, e: impl std::fmt::Display) -> String {
  format!("EINVAL: invalid argument, {what}: {e}")
}

/// The keys and values a dictionary file becomes, values borrowed from `text`.
pub fn entries<'a>(text: &'a str, layout: Layout) -> Result<(Vec<(String, Cow<'a, str>)>, Metadata), String> {
  let mut out = Vec::new();
  match layout {
    Layout::Jmdict => {
      let file: JmdictFile = serde_json::from_str(text).map_err(|e| bad_file("JMdict", e))?;
      out.reserve(file.words.len() * 4 + 2);
      out.push(("raw/tags".to_string(), compact_json(file.tags.get())));
      out.push(("raw/dictRevisions".to_string(), compact_json(file.dict_revisions.get())));
      for word in &file.words {
        let keys: WordKeys = serde_json::from_str(word.get()).map_err(|e| bad_file("JMdict word", e))?;
        out.push((format!("raw/words/{}", keys.id), compact_json(word.get())));
        for kana in &keys.kana {
          out.push((format!("indexes/kana/{}-{}", kana.text, keys.id), Cow::Owned(keys.id.clone())));
        }
        for kanji in &keys.kanji {
          out.push((format!("indexes/kanji/{}-{}", kanji.text, keys.id), Cow::Owned(keys.id.clone())));
        }
      }
      Ok((out, Metadata { dict_date: Some(file.dict_date), version: file.version }))
    }
    Layout::Kanjidic => {
      let file: KanjidicFile = serde_json::from_str(text).map_err(|e| bad_file("KANJIDIC", e))?;
      out.reserve(file.characters.len());
      for character in &file.characters {
        let keys: CharacterKeys =
          serde_json::from_str(character.get()).map_err(|e| bad_file("KANJIDIC character", e))?;
        out.push((format!("raw/characters/{}", keys.literal), compact_json(character.get())));
      }
      Ok((out, Metadata { dict_date: Some(file.dict_date), version: file.version }))
    }
    Layout::Chinese => {
      let file: ChineseFile = serde_json::from_str(text).map_err(|e| bad_file("Chinese dictionary", e))?;
      let keys_of = |records: &[&RawValue]| -> Result<Vec<ChineseKeys>, String> {
        records
          .iter()
          .map(|record| serde_json::from_str(record.get()).map_err(|e| bad_file("Chinese dictionary entry", e)))
          .collect()
      };
      let words = keys_of(&file.words)?;
      let word_ids = storage_ids(words.iter().map(|w| id_text(&w.id)).collect());
      let mut substrings = std::collections::HashSet::new();
      for ((record, word), id) in file.words.iter().zip(&words).zip(&word_ids) {
        out.push((format!("raw/words/{id}"), compact_json(record.get())));
        // The traditional and simplified forms, each once and only when present.
        let mut forms: Vec<&str> = Vec::new();
        for form in [word.content.as_deref(), word.simplified.as_deref()].into_iter().flatten() {
          if !form.is_empty() && !forms.contains(&form) {
            forms.push(form);
          }
        }
        substrings.clear();
        for form in &forms {
          out.push((format!("indexes/{form}-{id}"), Cow::Owned(id.clone())));
          all_substrings(form, &mut substrings);
        }
        for substring in &substrings {
          out.push((format!("partial/{substring}-{id}"), Cow::Owned(id.clone())));
        }
      }
      let characters = keys_of(&file.characters)?;
      let character_ids = storage_ids(characters.iter().map(|c| id_text(&c.id)).collect());
      for ((record, character), id) in file.characters.iter().zip(&characters).zip(&character_ids) {
        out.push((format!("raw/char/{id}"), compact_json(record.get())));
        let content = character.content.as_deref().unwrap_or("undefined");
        out.push((format!("indexchar/{content}-{id}"), Cow::Owned(id.clone())));
      }
      Ok((out, Metadata { dict_date: None, version: file.version }))
    }
  }
}

/// Writes a dictionary file into an empty store in bulk mode (kv::set_bulk): one transaction, so a
/// failed or interrupted import leaves nothing behind. Returns the metadata the page writes last.
pub fn import(conn: &mut Connection, text: &str, layout: Layout) -> Result<Metadata, String> {
  let (entries, metadata) = entries(text, layout)?;
  kv::set_bulk(conn, true)?;
  let written = entries.chunks(50_000).try_for_each(|chunk| {
    let ops: Vec<Op> = chunk.iter().map(|(key, value)| Op::Put(key, value)).collect();
    kv::batch(conn, &ops)
  });
  // Bulk mode ends either way: it commits what was written, or finds the failed batch rolled it back.
  let ended = kv::set_bulk(conn, false);
  written.and(ended).map(|_| metadata)
}

/// A bundled dictionary file's text, plain or gzipped (sys::fs::read_asset).
pub fn read_asset_text(path: &str) -> Result<String, String> {
  String::from_utf8(super::fs::read_asset(path)?).map_err(|e| bad_file(path, e))
}

/// Imports the dictionary file at `path` into the open store `handle` (an empty one: the page
/// deletes the old database first) and returns `{dictDate, version}`.
#[tauri::command]
pub async fn kv_import_dictionary(
  kv: tauri::State<'_, kv::Kv>,
  handle: u32,
  path: String,
  layout: String,
) -> Result<Metadata, String> {
  let layout = Layout::parse(&layout)?;
  let text = read_asset_text(&path)?;
  kv.with(handle, |conn| import(conn, &text, layout))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::sys::fs::tests::tmp;
  use std::io::Write;

  const JMDICT: &str = r#"{
"version": "3.5.0",
"dictDate": "2023-07-03",
"dictRevisions": ["1.09","1.08"],
"tags": {"v1":"Ichidan verb","n":"noun (common) (futsuumeishi)"},
"words": [
{"id":"1358280","kanji":[{"common":true,"text":"食べる","tags":[]},{"common":false,"text":"喰べる","tags":["iK"]}],"kana":[{"common":true,"text":"たべる","tags":[],"appliesToKanji":["*"]}],"sense":[{"partOfSpeech":["v1","vt"],"gloss":[{"lang":"eng","text":"to eat","type":null}]}]},
{"id":"1000000","kanji":[],"kana":[{"common":false,"text":"ヽ","tags":[],"appliesToKanji":["*"]}],"sense":[]}
]
}"#;

  #[test]
  fn jmdict_becomes_the_layout_jmdict_db_ts_writes() {
    let (entries, metadata) = entries(JMDICT, Layout::Jmdict).unwrap();
    let keys: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(
      keys,
      [
        "raw/tags",
        "raw/dictRevisions",
        "raw/words/1358280",
        "indexes/kana/たべる-1358280",
        "indexes/kanji/食べる-1358280",
        "indexes/kanji/喰べる-1358280",
        "raw/words/1000000",
        "indexes/kana/ヽ-1000000",
      ]
    );
    let value = |key: &str| entries.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_ref()).unwrap();
    // Each record is stored as its own text in the file, which is what JSON.stringify gives back.
    assert!(value("raw/words/1358280").starts_with(r#"{"id":"1358280","kanji":"#));
    assert_eq!(value("raw/dictRevisions"), r#"["1.09","1.08"]"#);
    assert_eq!(value("indexes/kana/たべる-1358280"), "1358280");
    let tags: serde_json::Value = serde_json::from_str(value("raw/tags")).unwrap();
    assert_eq!(tags["v1"], "Ichidan verb");
    assert_eq!(metadata, Metadata { dict_date: Some("2023-07-03".into()), version: "3.5.0".into() });
  }

  #[test]
  fn kanjidic_becomes_one_record_per_character() {
    let text = r#"{"version":"3.5.0","dictDate":"2023-07-24","characters":[
{"literal":"亜","grade":8},
{"literal":"唖","grade":null}
]}"#;
    let (entries, metadata) = entries(text, Layout::Kanjidic).unwrap();
    assert_eq!(entries[0].0, "raw/characters/亜");
    assert_eq!(entries[0].1, r#"{"literal":"亜","grade":8}"#);
    assert_eq!(entries[1].0, "raw/characters/唖");
    assert_eq!(metadata.dict_date.as_deref(), Some("2023-07-24"));
  }

  #[test]
  fn imports_into_the_store_and_reads_gzipped_assets() {
    let dir = tmp("dict-import");
    let plain = dir.join("jmdict.json");
    let gz = std::fs::File::create(dir.join("jmdict.json.gz")).unwrap();
    let mut encoder = flate2::write::GzEncoder::new(gz, flate2::Compression::fast());
    encoder.write_all(JMDICT.as_bytes()).unwrap();
    encoder.finish().unwrap();
    // Only the .gz exists, as in packaged builds.
    let text = read_asset_text(&plain.to_string_lossy()).unwrap();
    assert_eq!(text, JMDICT);
    let mut conn = kv::open_db(&dir.join("db").to_string_lossy()).unwrap();
    let metadata = import(&mut conn, &text, Layout::Jmdict).unwrap();
    assert_eq!(metadata.version, "3.5.0");
    assert_eq!(kv::get(&conn, "indexes/kanji/食べる-1358280").unwrap().as_deref(), Some("1358280"));
    assert!(conn.is_autocommit());
    // Bad input: nothing is written, and the error says which file.
    assert!(import(&mut conn, "{\"words\": 3}", Layout::Jmdict).unwrap_err().contains("JMdict"));
    assert!(read_asset_text(&dir.join("missing.json").to_string_lossy()).unwrap_err().starts_with("ENOENT"));
    assert!(Layout::parse("cedict").is_err());
  }

  #[test]
  fn compact_json_removes_whitespace_between_tokens_only() {
    let text = "{\"id\": \"0\", \"meaning\": [\"a, b\", \"say \\\"hi\\\" \"], \"n\": null}";
    assert_eq!(compact_json(text), r#"{"id":"0","meaning":["a, b","say \"hi\" "],"n":null}"#);
    assert!(matches!(compact_json(r#"{"a":[1,2]}"#), Cow::Borrowed(_)));
    assert_eq!(compact_json("[ \"漢 字\" ,\n 1 ]"), r#"["漢 字",1]"#);
  }

  #[test]
  fn chinese_dictionaries_become_the_layout_chinese_dictionary_db_ts_writes() {
    // Python json.dumps spacing; a repeated character id, as in cantodict.json; an empty simplified form.
    let text = r#"{"version": "2023-08-24", "words": [{"id": "0", "content": "中國", "simplified": "中国", "meaning": ["China"]}, {"id": "1", "content": "好", "simplified": ""}], "characters": [{"id": "0", "content": "我"}, {"id": "0", "content": "四"}]}"#;
    let (entries, metadata) = entries(text, Layout::Chinese).unwrap();
    let mut keys: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).collect();
    keys.sort();
    assert_eq!(
      keys,
      [
        "indexchar/四-0~1",
        "indexchar/我-0",
        "indexes/中国-0",
        "indexes/中國-0",
        "indexes/好-1",
        "partial/中-0",
        "partial/中国-0",
        "partial/中國-0",
        "partial/国-0",
        "partial/國-0",
        "partial/好-1",
        "raw/char/0",
        "raw/char/0~1",
        "raw/words/0",
        "raw/words/1",
      ]
    );
    let value = |key: &str| entries.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_ref()).unwrap();
    assert_eq!(value("raw/words/0"), r#"{"id":"0","content":"中國","simplified":"中国","meaning":["China"]}"#);
    assert_eq!(value("raw/char/0~1"), r#"{"id":"0","content":"四"}"#);
    assert_eq!(value("indexchar/四-0~1"), "0~1");
    assert_eq!(metadata, Metadata { dict_date: None, version: "2023-08-24".into() });
  }
}
