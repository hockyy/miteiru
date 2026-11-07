//! First-run dictionary import, in Rust. The bundled JMdict (110 MB of JSON) and KANJIDIC used to be
//! parsed in the page's worker and sent here 10k keys at a time. Reading them here skips the JS work
//! and the copies between the worker, the page and Rust.
//!
//! The key layout is the one main/dictionary/jmdictDb.ts and kanjidicDb.ts write (they still do for
//! plain `level` in the tests). Each record's value is its text in the file: the files hold compact
//! JSON, one record per line, so it is what `JSON.stringify` of the parsed record gives.

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
}

impl Layout {
  pub fn parse(name: &str) -> Result<Self, String> {
    match name {
      "jmdict" => Ok(Self::Jmdict),
      "kanjidic" => Ok(Self::Kanjidic),
      other => Err(format!("EINVAL: invalid argument, unknown dictionary layout '{other}'")),
    }
  }
}

/// What the page writes last, once the import is complete (levelDictionary.ts openDictionary).
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
  pub dict_date: String,
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
      out.push(("raw/tags".to_string(), Cow::Borrowed(file.tags.get())));
      out.push(("raw/dictRevisions".to_string(), Cow::Borrowed(file.dict_revisions.get())));
      for word in &file.words {
        let keys: WordKeys = serde_json::from_str(word.get()).map_err(|e| bad_file("JMdict word", e))?;
        out.push((format!("raw/words/{}", keys.id), Cow::Borrowed(word.get())));
        for kana in &keys.kana {
          out.push((format!("indexes/kana/{}-{}", kana.text, keys.id), Cow::Owned(keys.id.clone())));
        }
        for kanji in &keys.kanji {
          out.push((format!("indexes/kanji/{}-{}", kanji.text, keys.id), Cow::Owned(keys.id.clone())));
        }
      }
      Ok((out, Metadata { dict_date: file.dict_date, version: file.version }))
    }
    Layout::Kanjidic => {
      let file: KanjidicFile = serde_json::from_str(text).map_err(|e| bad_file("KANJIDIC", e))?;
      out.reserve(file.characters.len());
      for character in &file.characters {
        let keys: CharacterKeys =
          serde_json::from_str(character.get()).map_err(|e| bad_file("KANJIDIC character", e))?;
        out.push((format!("raw/characters/{}", keys.literal), Cow::Borrowed(character.get())));
      }
      Ok((out, Metadata { dict_date: file.dict_date, version: file.version }))
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
    assert_eq!(metadata, Metadata { dict_date: "2023-07-03".into(), version: "3.5.0".into() });
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
    assert_eq!(metadata.dict_date, "2023-07-24");
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
}
