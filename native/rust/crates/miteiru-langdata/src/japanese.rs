//! The Japanese tokenizer as the desktop app's commands (src-tauri/src/sys/japanese.rs) and the Node
//! addon (crates/miteiru-node) use it: one loaded dictionary, keyed by its folder, with the learner's
//! own words layered on top.

use miteiru_tokenizer::japanese::{parse_jmdict_words, Token, Tokenizer};
use miteiru_tokenizer::lexicon::{ExtraWord, WordSource};
use serde::Deserialize;
use std::path::Path;
use std::sync::{Arc, RwLock};

struct Loaded {
  path: String,
  jmdict_path: Option<String>,
  app_words: bool,
  tokenizer: Tokenizer,
  revision: String,
}

#[derive(Default, Clone)]
pub struct JapaneseStore(Arc<RwLock<Option<Loaded>>>);

#[derive(Deserialize)]
pub struct UserWord {
  pub surface: String,
  pub source: String,
}

impl JapaneseStore {
  pub fn load(&self, path: &str, jmdict_path: Option<&str>, app_words: bool) -> Result<(), String> {
    let mut state = self
      .0
      .write()
      .map_err(|_| "Japanese tokenizer lock poisoned")?;
    if state.as_ref().is_some_and(|loaded| {
      loaded.path == path
        && loaded.jmdict_path.as_deref() == jmdict_path
        && loaded.app_words == app_words
    }) {
      return Ok(());
    }
    let directory = Path::new(path);
    let mut tokenizer = Tokenizer::load_with(|name| {
      crate::asset::read_asset(&directory.join(format!("{name}.dat")).to_string_lossy())
    })?;
    if let Some(path) = jmdict_path.filter(|path| Path::new(path).is_file()) {
      let tables = crate::table::Tables::with_budget(512 * 1024);
      let handle = tables.open(path)?;
      let scanned = tokenizer.load_dictionary_words(app_words, |push| {
        tables.visit_values(handle, "raw/words/", |value| {
          for word in parse_jmdict_words(value)? {
            push(word);
          }
          Ok(())
        })
      });
      tables.close(handle);
      scanned?;
    }
    *state = Some(Loaded {
      path: path.into(),
      jmdict_path: jmdict_path.map(str::to_string),
      app_words,
      tokenizer,
      revision: String::new(),
    });
    Ok(())
  }

  pub fn update(&self, path: &str, revision: &str, words: Vec<UserWord>) -> Result<(), String> {
    let mut state = self
      .0
      .write()
      .map_err(|_| "Japanese tokenizer lock poisoned")?;
    let loaded = state
      .as_mut()
      .filter(|loaded| loaded.path == path)
      .ok_or("Japanese dictionary is not loaded")?;
    if loaded.revision != revision {
      if words.len() > 2000 {
        return Err("Too many Japanese user words".into());
      }
      let words = words
        .into_iter()
        .map(|word| {
          Ok(ExtraWord {
            surface: word.surface,
            source: match word.source.as_str() {
              "manual" => WordSource::UserManual,
              "ai" => WordSource::UserAi,
              _ => return Err("Invalid Japanese word source".to_string()),
            },
          })
        })
        .collect::<Result<Vec<_>, String>>()?;
      loaded.tokenizer.set_user_words(&words);
      loaded.revision = revision.into();
    }
    Ok(())
  }

  pub fn tokenize(&self, path: &str, text: &str) -> Result<Vec<Token>, String> {
    Ok(self.tokenize_many(path, &[text])?.remove(0))
  }

  pub fn tokenize_many(&self, path: &str, texts: &[&str]) -> Result<Vec<Vec<Token>>, String> {
    if texts.len() > 128 || texts.iter().map(|text| text.len()).sum::<usize>() > 1024 * 1024 {
      return Err("Japanese batch exceeds 128 lines or one MiB".into());
    }
    let state = self
      .0
      .read()
      .map_err(|_| "Japanese tokenizer lock poisoned")?;
    let loaded = state
      .as_ref()
      .filter(|loaded| loaded.path == path)
      .ok_or("Japanese dictionary is not loaded")?;
    Ok(
      texts
        .iter()
        .map(|text| loaded.tokenizer.tokenize_with_suffixes(text))
        .collect(),
    )
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn refuses_unloaded_paths_and_missing_dictionary() {
    let store = JapaneseStore::default();
    assert!(store.tokenize("missing", "日本語").is_err());
    assert!(store.update("missing", "1", Vec::new()).is_err());
    assert!(store.load("missing", None, false).is_err());
  }
}
