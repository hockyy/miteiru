//! The Chinese tokenizers' commands (Mandarin and Cantonese, by key). The store (miteiru-langdata,
//! with its tests) is shared with the headless language server's addon, so both cut text the same way.

pub use miteiru_langdata::chinese::{JiebaStore, TaggedWord, UserWord};

#[tauri::command]
pub async fn jieba_load(
  store: tauri::State<'_, JiebaStore>,
  key: String,
  dict_path: String,
  dictionary_path: Option<String>,
) -> Result<(), String> {
  store.load_with_headwords(&key, &dict_path, dictionary_path.as_deref())
}

#[tauri::command]
pub async fn jieba_user_words(
  store: tauri::State<'_, JiebaStore>,
  key: String,
  words: Vec<UserWord>,
) -> Result<(), String> {
  store.replace_user_words(&key, words)
}

#[tauri::command]
pub async fn jieba_cut(
  store: tauri::State<'_, JiebaStore>,
  key: String,
  text: String,
  hmm: bool,
) -> Result<Vec<String>, String> {
  store.cut(&key, &text, hmm)
}

#[tauri::command]
pub async fn jieba_cut_tagged(
  store: tauri::State<'_, JiebaStore>,
  key: String,
  text: String,
  hmm: bool,
) -> Result<Vec<TaggedWord>, String> {
  store.cut_tagged(&key, &text, hmm)
}
