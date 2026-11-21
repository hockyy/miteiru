#[tauri::command]
pub async fn jyutping_batch(texts: Vec<String>) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || miteiru_jyutping::batch(&texts))
    .await.map_err(|error| error.to_string())
}
