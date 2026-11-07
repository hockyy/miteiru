//! Rust half of the desktop contract: every `#[tauri::command]` the JS shims call.

pub mod dialog;
pub mod dict_import;
pub mod fs;
pub mod http;
pub mod info;
pub mod jieba;
pub mod kv;
pub mod mkv;
pub mod proc;
pub mod shell;
pub mod table;
pub mod zstd;

/// Map an I/O error to a Node-style error code.
pub fn io_code(e: &std::io::Error) -> &'static str {
  use std::io::ErrorKind as K;
  match e.kind() {
    K::NotFound => "ENOENT",
    K::AlreadyExists => "EEXIST",
    K::PermissionDenied => "EACCES",
    K::NotADirectory => "ENOTDIR",
    K::IsADirectory => "EISDIR",
    K::DirectoryNotEmpty => "ENOTEMPTY",
    K::InvalidInput => "EINVAL",
    _ => "EIO",
  }
}

pub fn code_text(code: &str) -> &'static str {
  match code {
    "ENOENT" => "no such file or directory",
    "EEXIST" => "file already exists",
    "EACCES" => "permission denied",
    "ENOTDIR" => "not a directory",
    "EISDIR" => "illegal operation on a directory",
    "ENOTEMPTY" => "directory not empty",
    "EINVAL" => "invalid argument",
    _ => "i/o error",
  }
}

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

/// `ENOENT: no such file or directory, open '<path>'`
pub fn fs_err(e: &std::io::Error, syscall: &str, path: &str) -> String {
  let code = io_code(e);
  format!("{code}: {}, {syscall} '{path}'", code_text(code))
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
