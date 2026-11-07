//! Rust half of the desktop contract: every `#[tauri::command]` the JS shims call.

pub mod dialog;
pub mod fs;
pub mod http;
pub mod info;
pub mod jieba;
pub mod kv;
pub mod proc;
pub mod shell;

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

/// `ENOENT: no such file or directory, open '<path>'`
pub fn fs_err(e: &std::io::Error, syscall: &str, path: &str) -> String {
  let code = io_code(e);
  format!("{code}: {}, {syscall} '{path}'", code_text(code))
}
