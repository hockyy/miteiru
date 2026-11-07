use jieba_rs::Jieba;
use std::collections::HashMap;
use std::io::BufReader;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct JiebaStore(Mutex<HashMap<String, Arc<Jieba>>>);

impl JiebaStore {
  /// Builds a Jieba from only the given dictionary file (it replaces the built-in one). Packaged
  /// builds ship it gzipped (`zh.jieba.txt.gz`), so it is read as a language asset.
  pub fn load(&self, key: &str, dict_path: &str) -> Result<(), String> {
    let bytes = super::fs::read_asset(dict_path)?;
    let jieba = Jieba::with_dict(&mut BufReader::new(bytes.as_slice()))
      .map_err(|e| format!("EINVAL: invalid argument, jieba dictionary '{dict_path}': {e}"))?;
    self.0.lock().unwrap().insert(key.to_string(), Arc::new(jieba));
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
    Ok(jieba.cut(text, hmm).into_iter().map(str::to_string).collect())
  }
}

#[tauri::command]
pub async fn jieba_load(
  store: tauri::State<'_, JiebaStore>,
  key: String,
  dict_path: String,
) -> Result<(), String> {
  store.load(&key, &dict_path)
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
  fn uses_only_the_given_dictionary() {
    let d = crate::sys::fs::tests::tmp("jieba");
    let dict = d.join("dict.txt");
    std::fs::write(&dict, "我 100 r\n爱 100 v\n北京 1000 ns\n天安门 1000 ns\n").unwrap();
    let store = JiebaStore::default();
    store.load("zh", dict.to_str().unwrap()).unwrap();
    assert_eq!(store.cut("zh", "我爱北京天安门", false).unwrap(), ["我", "爱", "北京", "天安门"]);
    assert!(store.cut("other", "x", false).is_err());
    assert!(store.load("bad", d.join("missing.txt").to_str().unwrap()).unwrap_err().starts_with("ENOENT"));
  }

  #[test]
  fn reads_the_gzipped_dictionary_packaged_builds_ship() {
    use std::io::Write;
    let d = crate::sys::fs::tests::tmp("jieba-gz");
    // Only zh.jieba.txt.gz exists, as in an installed app; the page asks for zh.jieba.txt.
    let gz = std::fs::File::create(d.join("zh.jieba.txt.gz")).unwrap();
    let mut encoder = flate2::write::GzEncoder::new(gz, flate2::Compression::fast());
    encoder.write_all("北京 1000 ns\n天安门 1000 ns\n".as_bytes()).unwrap();
    encoder.finish().unwrap();
    let store = JiebaStore::default();
    store.load("zh", d.join("zh.jieba.txt").to_str().unwrap()).unwrap();
    assert_eq!(store.cut("zh", "北京天安门", false).unwrap(), ["北京", "天安门"]);
  }
}
