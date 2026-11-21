//! Node-API addon for the headless language server (main/headless/nativeAddon.ts).
//!
//! It exposes the same engines the desktop app's backend commands use (src-tauri/src/sys/japanese.rs,
//! jieba.rs, table.rs), from the shared crate miteiru-langdata, so a program that starts the headless
//! server gets exactly the tokens and dictionary records the app shows. main/headless/nodeSys.ts maps
//! the app's `sys(...)` command names onto these functions; every error is the same
//! "<CODE>: <detail>" string the app's commands return.
//!
//! Slow work (loading a dictionary, tokenizing) runs on libuv's thread pool and returns a Promise;
//! the quick lookups are synchronous.

use std::sync::LazyLock;

use miteiru_langdata::chinese::{JiebaStore, UserWord as ChineseWord};
use miteiru_langdata::japanese::{JapaneseStore, UserWord as JapaneseWord};
use miteiru_langdata::table::Tables;
use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Task};
use napi_derive::napi;

/// Bumped when a function's name or shape changes, so the JS side can refuse a stale build.
#[napi]
pub const ADDON_API: u32 = 3;

static JAPANESE: LazyLock<JapaneseStore> = LazyLock::new(JapaneseStore::default);
static CHINESE: LazyLock<JiebaStore> = LazyLock::new(JiebaStore::default);
static TABLES: LazyLock<Tables> = LazyLock::new(Tables::default);

fn failure(message: String) -> napi::Error {
  napi::Error::from_reason(message)
}

/// One of the learner's own words ("Your dictionary"): `source` is `manual` or `ai`.
#[napi(object)]
pub struct UserWord {
  pub surface: String,
  pub source: String,
}

// ---- Japanese ------------------------------------------------------------------------------

pub struct JapaneseLoad {
  dict_path: String,
  jmdict_path: Option<String>,
  app_words: bool,
}

impl Task for JapaneseLoad {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> napi::Result<()> {
    JAPANESE.load(&self.dict_path, self.jmdict_path.as_deref(), self.app_words).map_err(failure)
  }

  fn resolve(&mut self, _env: Env, _output: ()) -> napi::Result<()> {
    Ok(())
  }
}

/// `japanese_load`: loads the IPADIC tables in `dictPath` (and the JMdict lemmas of `jmdictPath`).
#[napi]
pub fn japanese_load(dict_path: String, jmdict_path: Option<String>, app_words: Option<bool>) -> AsyncTask<JapaneseLoad> {
  AsyncTask::new(JapaneseLoad { dict_path, jmdict_path, app_words: app_words.unwrap_or(false) })
}

/// `japanese_set_words`: the learner's words; a revision already applied is skipped.
#[napi]
pub fn japanese_set_words(dict_path: String, revision: String, words: Vec<UserWord>) -> napi::Result<()> {
  let words = words.into_iter().map(|word| JapaneseWord { surface: word.surface, source: word.source }).collect();
  JAPANESE.update(&dict_path, &revision, words).map_err(failure)
}

pub struct JapaneseTokenize {
  dict_path: String,
  texts: Vec<String>,
}

impl Task for JapaneseTokenize {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> napi::Result<String> {
    let lines: Vec<&str> = self.texts.iter().map(String::as_str).collect();
    let tokens = JAPANESE.tokenize_many(&self.dict_path, &lines).map_err(failure)?;
    serde_json::to_string(&tokens).map_err(|error| failure(error.to_string()))
  }

  fn resolve(&mut self, _env: Env, output: String) -> napi::Result<String> {
    Ok(output)
  }
}

/// `japanese_tokenize_batch`: the kuromoji-shaped tokens of each line, as JSON text (an array per line).
/// At most 128 lines and one MiB, as in the app.
#[napi]
pub fn japanese_tokenize_batch(dict_path: String, texts: Vec<String>) -> AsyncTask<JapaneseTokenize> {
  AsyncTask::new(JapaneseTokenize { dict_path, texts })
}

// ---- Chinese -------------------------------------------------------------------------------

#[napi]
pub fn opencc_convert_batch(mode: String, lines: Vec<napi::bindgen_prelude::Utf16String>) -> napi::Result<Vec<napi::bindgen_prelude::Utf16String>> {
  let converter = miteiru_langdata::opencc::converter(&mode).map_err(failure)?;
  Ok(lines.iter().map(|line| converter.convert_utf16(line).into()).collect())
}

#[napi]
pub fn jyutping_batch(texts: Vec<String>) -> napi::Result<String> {
  let rows: Vec<_> = texts.iter().map(|text| miteiru_jyutping::readings(text)).collect();
  serde_json::to_string(&rows).map_err(|error| failure(error.to_string()))
}

pub struct ChineseLoad {
  key: String,
  dict_path: String,
  dictionary_path: Option<String>,
}

impl Task for ChineseLoad {
  type Output = ();
  type JsValue = ();

  fn compute(&mut self) -> napi::Result<()> {
    CHINESE.load_with_headwords(&self.key, &self.dict_path, self.dictionary_path.as_deref()).map_err(failure)
  }

  fn resolve(&mut self, _env: Env, _output: ()) -> napi::Result<()> {
    Ok(())
  }
}

/// `jieba_load`: builds the Mandarin or Cantonese tokenizer (by the word list's name) under `key`.
#[napi]
pub fn jieba_load(key: String, dict_path: String, dictionary_path: Option<String>) -> AsyncTask<ChineseLoad> {
  AsyncTask::new(ChineseLoad { key, dict_path, dictionary_path })
}

/// `jieba_cut`: the words of `text`.
#[napi]
pub fn jieba_cut(key: String, text: String, hmm: bool) -> napi::Result<Vec<String>> {
  CHINESE.cut(&key, &text, hmm).map_err(failure)
}

/// `jieba_user_words`: replaces the learner's words of the tokenizer under `key`.
#[napi]
pub fn jieba_user_words(key: String, words: Vec<UserWord>) -> napi::Result<()> {
  let words = words.into_iter().map(|word| ChineseWord { surface: word.surface, source: word.source }).collect();
  CHINESE.replace_user_words(&key, words).map_err(failure)
}

// ---- Data tables ---------------------------------------------------------------------------

/// `table_open`: a handle to the table at `path`, shared with earlier opens of the same path.
#[napi]
pub fn table_open(path: String) -> napi::Result<u32> {
  TABLES.open(&path).map_err(failure)
}

/// `table_close`: drops one reference to the handle.
#[napi]
pub fn table_close(handle: u32) {
  TABLES.close(handle);
}

/// `table_get_many`: each key's value, null for a key the table lacks.
#[napi]
pub fn table_get_many(handle: u32, keys: Vec<String>) -> napi::Result<Vec<Option<String>>> {
  TABLES.get_many(handle, &keys).map_err(failure)
}

/// `table_values`: the values of the keys in [gte, lt), in key order; `limit` < 0 means all.
#[napi]
pub fn table_values(handle: u32, gte: Option<String>, lt: Option<String>, limit: i64) -> napi::Result<Vec<String>> {
  TABLES.values(handle, gte.as_deref(), lt.as_deref(), limit).map_err(failure)
}

// ---- Assets --------------------------------------------------------------------------------

/// `fs_read_asset`: a language asset's bytes, plain or from its `.zst` / `.gz` copy.
#[napi]
pub fn read_asset(path: String) -> napi::Result<Buffer> {
  miteiru_langdata::asset::read_asset(&path).map(Buffer::from).map_err(failure)
}
