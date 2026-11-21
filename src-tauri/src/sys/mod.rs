//! Rust half of the desktop contract: every `#[tauri::command]` the JS shims call.

pub mod dialog;
pub mod dict_import;
pub mod fs;
pub mod http;
pub mod info;
pub mod japanese;
pub mod jieba;
pub mod kv;
pub mod langpack;
pub mod mkv;
pub mod opencc;
pub mod proc;
pub mod shell;
pub mod table;
pub mod zstd;

/// Node-style error codes and messages, shared with the headless language server's addon.
pub use miteiru_langdata::errors::{code_text, fs_err, io_code};

/// The bytes a raw-body command (fs_write_bytes, kv_batch) was sent. They normally arrive raw, but
/// after one failed IPC fetch Tauri switches to its postMessage transport for the rest of the
/// session, and that sends them as a JSON array of numbers.
pub fn raw_body<'a>(body: &'a tauri::ipc::InvokeBody, what: &str) -> Result<std::borrow::Cow<'a, [u8]>, String> {
  use std::borrow::Cow;
  match body {
    tauri::ipc::InvokeBody::Raw(bytes) => Ok(Cow::Borrowed(bytes)),
    tauri::ipc::InvokeBody::Json(serde_json::Value::Array(items)) => items
      .iter()
      .map(|item| item.as_u64().and_then(|n| u8::try_from(n).ok()))
      .collect::<Option<Vec<u8>>>()
      .map(Cow::Owned)
      .ok_or_else(|| format!("EINVAL: invalid argument, {what}: the body is not bytes")),
    _ => Err(format!("EINVAL: invalid argument, {what}: expected a raw body")),
  }
}
#[cfg(test)]
mod tests {
  use super::raw_body;
  use tauri::ipc::InvokeBody;

  #[test]
  fn raw_bodies_arrive_raw_or_as_json_numbers() {
    assert_eq!(&*raw_body(&InvokeBody::Raw(vec![1, 2, 255]), "t").unwrap(), &[1, 2, 255]);
    // Tauri's postMessage transport turns an ArrayBuffer into an array of numbers.
    assert_eq!(&*raw_body(&InvokeBody::Json(serde_json::json!([1, 2, 255])), "t").unwrap(), &[1, 2, 255]);
    assert!(raw_body(&InvokeBody::Json(serde_json::json!([1, 256])), "t").is_err());
    assert!(raw_body(&InvokeBody::Json(serde_json::json!({"handle": 1})), "t").is_err());
  }
}
