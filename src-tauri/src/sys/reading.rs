#[tauri::command]
pub async fn jyutping_batch(texts: Vec<String>) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || miteiru_jyutping::batch(&texts))
    .await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn pinyin_batch(texts: Vec<String>, simplify: bool) -> Result<Vec<miteiru_pinyin::Line>, String> {
  tauri::async_runtime::spawn_blocking(move || texts.iter().map(|text| miteiru_pinyin::line(text, simplify)).collect())
    .await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn convert_pinyin_batch(texts: Vec<String>, to_symbols: bool) -> Result<Vec<String>, String> {
  tauri::async_runtime::spawn_blocking(move || texts.iter().map(|text| miteiru_pinyin::convert(text, to_symbols)).collect())
    .await.map_err(|error| error.to_string())
}
