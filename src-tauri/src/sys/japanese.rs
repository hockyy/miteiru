use miteiru_tokenizer::japanese::{parse_jmdict_words, Token, Tokenizer};
use miteiru_tokenizer::lexicon::{ExtraWord, WordSource};
use serde::Deserialize;
use std::path::Path;
use std::sync::{Arc, RwLock};
mod batch;

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
  surface: String,
  source: String,
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
      super::fs::read_asset(&directory.join(format!("{name}.dat")).to_string_lossy())
    })?;
    if let Some(path) = jmdict_path.filter(|path| Path::new(path).is_file()) {
      let tables = super::table::Tables::with_budget(512 * 1024);
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

  fn update(&self, path: &str, revision: &str, words: Vec<UserWord>) -> Result<(), String> {
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

  fn tokenize_many(&self, path: &str, texts: &[&str]) -> Result<Vec<Vec<Token>>, String> {
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

#[tauri::command]
pub async fn japanese_load(
  store: tauri::State<'_, JapaneseStore>,
  dict_path: String,
  jmdict_path: Option<String>,
  app_words: Option<bool>,
) -> Result<(), String> {
  let store = store.inner().clone();
  tauri::async_runtime::spawn_blocking(move || {
    store.load(
      &dict_path,
      jmdict_path.as_deref(),
      app_words.unwrap_or(false),
    )
  })
  .await
  .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn japanese_set_words(
  store: tauri::State<'_, JapaneseStore>,
  dict_path: String,
  revision: String,
  words: Vec<UserWord>,
) -> Result<(), String> {
  store.update(&dict_path, &revision, words)
}

#[tauri::command]
pub async fn japanese_tokenize(
  store: tauri::State<'_, JapaneseStore>,
  dict_path: String,
  text: String,
) -> Result<Vec<Token>, String> {
  let store = store.inner().clone();
  tauri::async_runtime::spawn_blocking(move || store.tokenize(&dict_path, &text))
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn japanese_tokenize_batch(
  store: tauri::State<'_, JapaneseStore>,
  dict_path: String,
  texts: Vec<String>,
) -> Result<tauri::ipc::Response, String> {
  let store = store.inner().clone();
  let bytes = tauri::async_runtime::spawn_blocking(move || {
    let lines = texts.iter().map(String::as_str).collect::<Vec<_>>();
    let tokens = store.tokenize_many(&dict_path, &lines)?;
    serde_json::to_vec(&batch::Batch::new(&tokens)).map_err(|error| error.to_string())
  })
  .await
  .map_err(|error| error.to_string())??;
  Ok(tauri::ipc::Response::new(bytes))
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
