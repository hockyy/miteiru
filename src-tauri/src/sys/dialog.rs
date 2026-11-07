use serde::Deserialize;
use std::path::Path;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

#[derive(Deserialize)]
pub struct Filter {
  pub name: String,
  pub extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OpenOptions {
  pub title: Option<String>,
  pub multiple: bool,
  pub directory: bool,
  pub filters: Vec<Filter>,
  pub default_path: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveOptions {
  pub title: Option<String>,
  pub default_path: Option<String>,
  pub filters: Vec<Filter>,
}

fn paths(v: Vec<FilePath>) -> Vec<String> {
  v.into_iter()
    .filter_map(|p| p.into_path().ok())
    .map(|p| p.to_string_lossy().into_owned())
    .collect()
}

fn apply<R: tauri::Runtime>(
  mut b: FileDialogBuilder<R>,
  title: &Option<String>,
  filters: &[Filter],
  default_path: &Option<String>,
  is_save: bool,
) -> FileDialogBuilder<R> {
  if let Some(t) = title {
    b = b.set_title(t);
  }
  for f in filters {
    let exts: Vec<&str> =
      f.extensions.iter().map(|e| e.trim_start_matches('.')).filter(|e| *e != "*").collect();
    if !exts.is_empty() {
      b = b.add_filter(&f.name, &exts);
    }
  }
  if let Some(p) = default_path.as_deref().filter(|p| !p.is_empty()) {
    let path = Path::new(p);
    if path.is_dir() {
      b = b.set_directory(path);
    } else if let Some(parent) = path.parent().filter(|d| d.is_dir()) {
      b = b.set_directory(parent);
      if is_save {
        if let Some(name) = path.file_name() {
          b = b.set_file_name(name.to_string_lossy());
        }
      }
    }
  }
  b
}

#[tauri::command]
pub async fn dialog_open(
  app: tauri::AppHandle,
  window: tauri::WebviewWindow,
  options: Option<OpenOptions>,
) -> Result<Option<Vec<String>>, String> {
  let o = options.unwrap_or_default();
  tauri::async_runtime::spawn_blocking(move || {
    let b = apply(app.dialog().file().set_parent(&window), &o.title, &o.filters, &o.default_path, false);
    let picked = match (o.directory, o.multiple) {
      (true, true) => b.blocking_pick_folders(),
      (true, false) => b.blocking_pick_folder().map(|p| vec![p]),
      (false, true) => b.blocking_pick_files(),
      (false, false) => b.blocking_pick_file().map(|p| vec![p]),
    };
    picked.map(paths).filter(|v| !v.is_empty())
  })
  .await
  .map_err(|e| format!("EIO: i/o error, dialog: {e}"))
}

#[tauri::command]
pub async fn dialog_save(
  app: tauri::AppHandle,
  window: tauri::WebviewWindow,
  options: Option<SaveOptions>,
) -> Result<Option<String>, String> {
  let o = options.unwrap_or_default();
  tauri::async_runtime::spawn_blocking(move || {
    let b = apply(app.dialog().file().set_parent(&window), &o.title, &o.filters, &o.default_path, true);
    b.blocking_save_file()
      .and_then(|p| p.into_path().ok())
      .map(|p| p.to_string_lossy().into_owned())
  })
  .await
  .map_err(|e| format!("EIO: i/o error, dialog: {e}"))
}
