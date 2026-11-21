// JSON strings are Unicode. Use code units only for the rare JS subtitle containing a lone surrogate.
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(untagged)]
pub enum Line {
  Text(String),
  Units(Vec<u16>),
}

#[tauri::command]
pub async fn opencc_convert_batch(mode: String, lines: Vec<Line>) -> Result<Vec<Line>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let converter = miteiru_langdata::opencc::converter(&mode)?;
    Ok(lines.into_iter().map(|line| match line {
      Line::Text(text) => Line::Text(converter.convert(&text)),
      Line::Units(units) => Line::Units(converter.convert_utf16(&units)),
    }).collect())
  }).await.map_err(|e| e.to_string())?
}
