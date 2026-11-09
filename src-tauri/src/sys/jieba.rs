use miteiru_tokenizer::chinese::{Language, Tokenizer};
use miteiru_tokenizer::lexicon::{ExtraWord, WordSource};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::BufReader;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct JiebaStore(Mutex<HashMap<String, Arc<Tokenizer>>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWord {
  surface: String,
  source: String,
}

fn headwords(path: &str) -> Result<Vec<String>, String> {
  let pack = std::path::Path::new(path).with_extension("pack");
  if pack
    .try_exists()
    .map_err(|error| super::fs_err(&error, "stat", path))?
  {
    return super::table::chinese_headwords(&pack.to_string_lossy());
  }
  #[derive(Deserialize)]
  struct Word {
    content: String,
    simplified: Option<String>,
  }
  #[derive(Deserialize)]
  struct Dictionary {
    words: Vec<Word>,
  }
  let bytes = super::fs::read_asset(path)?;
  let dictionary: Dictionary = serde_json::from_slice(&bytes)
    .map_err(|error| format!("EINVAL: dictionary '{path}': {error}"))?;
  Ok(
    dictionary
      .words
      .into_iter()
      .flat_map(|word| std::iter::once(word.content).chain(word.simplified))
      .collect(),
  )
}

impl JiebaStore {
  /// Builds Miteiru's tokenizer from the supplied word list. Packaged builds ship the list
  /// gzipped (`zh.jieba.txt.gz`), so it is read as a language asset.
  #[cfg(test)]
  pub fn load(&self, key: &str, dict_path: &str) -> Result<(), String> {
    self.load_with_headwords(key, dict_path, None)
  }

  pub fn load_with_headwords(
    &self,
    key: &str,
    dict_path: &str,
    dictionary_path: Option<&str>,
  ) -> Result<(), String> {
    let started = std::time::Instant::now();
    let bytes = super::fs::read_asset(dict_path)?;
    let language = if dict_path.contains("yue.jieba") {
      Language::Cantonese
    } else {
      Language::Mandarin
    };
    let mut jieba = Tokenizer::with_dict(&mut BufReader::new(bytes.as_slice()), language)
      .map_err(|e| format!("EINVAL: invalid argument, jieba dictionary '{dict_path}': {e}"))?;
    drop(bytes);
    let base_ms = started.elapsed().as_secs_f64() * 1000.0;
    if let Some(path) = dictionary_path {
      let words = headwords(path)?;
      let stats = jieba.set_app_words(words.iter().map(String::as_str));
      log::info!("Chinese tokenizer: base {base_ms:.1} ms, headwords+overlay {:.1} ms, {} added, {} lexical restorations, {} filtered", started.elapsed().as_secs_f64() * 1000.0 - base_ms, stats.added, stats.restored, stats.filtered);
    }
    self
      .0
      .lock()
      .unwrap()
      .insert(key.to_string(), Arc::new(jieba));
    Ok(())
  }

  pub fn replace_user_words(&self, key: &str, words: Vec<UserWord>) -> Result<(), String> {
    if words.len() > 10_000 {
      return Err("EINVAL: too many user words".into());
    }
    let mut store = self.0.lock().unwrap();
    let mut updated = store
      .get(key)
      .cloned()
      .ok_or_else(|| format!("EINVAL: jieba '{key}' is not loaded"))?
      .as_ref()
      .clone();
    let extra: Result<Vec<_>, _> = words
      .into_iter()
      .map(|word| {
        let source = match word.source.as_str() {
          "manual" => WordSource::UserManual,
          "ai" => WordSource::UserAi,
          _ => return Err("EINVAL: invalid user word source".to_string()),
        };
        Ok(ExtraWord {
          surface: word.surface,
          source,
        })
      })
      .collect();
    updated
      .replace_user_words(&extra?)
      .map_err(|error| format!("EINVAL: {error}"))?;
    store.insert(key.into(), Arc::new(updated));
    Ok(())
  }

  pub fn cut(&self, key: &str, text: &str, hmm: bool) -> Result<Vec<String>, String> {
    let jieba = self
      .0
      .lock()
      .unwrap()
      .get(key)
      .cloned()
      .ok_or_else(|| format!("EINVAL: invalid argument, jieba '{key}' is not loaded"))?;
    Ok(
      jieba
        .cut(text, hmm)
        .into_iter()
        .map(str::to_string)
        .collect(),
    )
  }
}

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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn runtime_dictionary_and_user_words_do_not_replace_base_data() {
    let directory = crate::sys::fs::tests::tmp("chinese-extra");
    let list = directory.join("list.txt");
    let dictionary = directory.join("chinese.json");
    std::fs::write(&list, "我 100\n愛 100\n星際 10\n薯片 20\n").unwrap();
    std::fs::write(
      &dictionary,
      r#"{"words":[{"content":"星際薯片","simplified":"星际薯片"}],"characters":[]}"#,
    )
    .unwrap();
    let store = JiebaStore::default();
    store
      .load_with_headwords(
        "zh",
        list.to_str().unwrap(),
        Some(dictionary.to_str().unwrap()),
      )
      .unwrap();
    assert_eq!(store.0.lock().unwrap()["zh"].app_word_count(), 2);
    let original = store.cut("zh", "我愛星際薯片", true).unwrap();
    store
      .replace_user_words(
        "zh",
        vec![UserWord {
          surface: "愛星際".into(),
          source: "manual".into(),
        }],
      )
      .unwrap();
    assert_eq!(
      store.cut("zh", "我愛星際薯片", true).unwrap(),
      ["我", "愛星際", "薯片"]
    );
    store.replace_user_words("zh", vec![]).unwrap();
    assert_eq!(store.cut("zh", "我愛星際薯片", true).unwrap(), original);
    assert!(store
      .replace_user_words(
        "zh",
        vec![UserWord {
          surface: "字".into(),
          source: "invalid".into()
        }]
      )
      .is_err());
    assert!(store.replace_user_words("missing", vec![]).is_err());
  }

  #[test]
  fn uses_only_the_given_dictionary() {
    let d = crate::sys::fs::tests::tmp("jieba");
    let dict = d.join("dict.txt");
    std::fs::write(&dict, "我 100 r\n爱 100 v\n北京 1000 ns\n天安门 1000 ns\n").unwrap();
    let store = JiebaStore::default();
    store.load("zh", dict.to_str().unwrap()).unwrap();
    assert_eq!(
      store.cut("zh", "我爱北京天安门", false).unwrap(),
      ["我", "爱", "北京", "天安门"]
    );
    assert!(store.cut("other", "x", false).is_err());
    assert!(store
      .load("bad", d.join("missing.txt").to_str().unwrap())
      .unwrap_err()
      .starts_with("ENOENT"));
  }

  #[test]
  fn reads_the_gzipped_dictionary_packaged_builds_ship() {
    use std::io::Write;
    let d = crate::sys::fs::tests::tmp("jieba-gz");
    // Only zh.jieba.txt.gz exists, as in an installed app; the page asks for zh.jieba.txt.
    let gz = std::fs::File::create(d.join("zh.jieba.txt.gz")).unwrap();
    let mut encoder = flate2::write::GzEncoder::new(gz, flate2::Compression::fast());
    encoder
      .write_all("北京 1000 ns\n天安门 1000 ns\n".as_bytes())
      .unwrap();
    encoder.finish().unwrap();
    let store = JiebaStore::default();
    store
      .load("zh", d.join("zh.jieba.txt").to_str().unwrap())
      .unwrap();
    assert_eq!(
      store.cut("zh", "北京天安门", false).unwrap(),
      ["北京", "天安门"]
    );
  }
}
