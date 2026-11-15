//! The Japanese tokenizer's commands. The store (miteiru-langdata, with its tests) is shared with the
//! headless language server's addon, so both tokenize the same way.

pub use miteiru_langdata::japanese::{JapaneseStore, UserWord};
use miteiru_tokenizer::japanese::Token;
mod batch;

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
