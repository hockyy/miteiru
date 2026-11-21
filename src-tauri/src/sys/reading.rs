#[tauri::command]
pub async fn jyutping_batch(texts: Vec<String>) -> Result<Vec<Vec<Option<&'static str>>>, String> {
  tauri::async_runtime::spawn_blocking(move || texts.iter().map(|text| miteiru_jyutping::readings(text)).collect())
    .await.map_err(|error| error.to_string())
}
