//! Node-style error codes and messages: the JS shims turn "<CODE>: <text>, <syscall> '<path>'" back into errors with a `code`.

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
