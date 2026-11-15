//! Read-only data tables (MTRPACK2, docs/DATA_FORMAT.md) for the backend worker. The bundled
//! dictionaries are tables, and a subtitle file asks for a gloss of every distinct word in it, each
//! needing several range scans and record fetches; here one command answers one query.
//!
//! The reader and its shared block cache are miteiru-langdata's (native/rust/crates/miteiru-langdata,
//! with its tests), so the headless language server's addon reads tables the same way.

pub use miteiru_langdata::table::Tables;

#[tauri::command]
pub async fn table_open(tables: tauri::State<'_, Tables>, path: String) -> Result<u32, String> {
  tables.open(&path)
}

#[tauri::command]
pub async fn table_close(tables: tauri::State<'_, Tables>, handle: u32) -> Result<(), String> {
  tables.close(handle);
  Ok(())
}

#[tauri::command]
pub async fn table_get_many(
  tables: tauri::State<'_, Tables>,
  handle: u32,
  keys: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
  tables.get_many(handle, &keys)
}

#[tauri::command]
pub async fn table_values(
  tables: tauri::State<'_, Tables>,
  handle: u32,
  gte: Option<String>,
  lt: Option<String>,
  limit: i64,
) -> Result<Vec<String>, String> {
  tables.values(handle, gte.as_deref(), lt.as_deref(), limit)
}
