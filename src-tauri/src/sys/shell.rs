use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn shell_open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
  app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Empty string on success, the error message otherwise (like Electron's shell.openPath).
#[tauri::command]
pub async fn shell_open_path(app: tauri::AppHandle, path: String) -> Result<String, String> {
  Ok(match app.opener().open_path(path, None::<&str>) {
    Ok(()) => String::new(),
    Err(e) => e.to_string(),
  })
}

#[tauri::command]
pub async fn shell_show_item(app: tauri::AppHandle, path: String) -> Result<(), String> {
  app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}
