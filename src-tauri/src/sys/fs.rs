use super::{code_text, fs_err};
use serde::Serialize;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::time::SystemTime;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stat {
  pub is_file: bool,
  pub is_directory: bool,
  pub is_symbolic_link: bool,
  pub size: u64,
  pub mtime_ms: f64,
  pub birthtime_ms: f64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
  pub name: String,
  pub is_file: bool,
  pub is_directory: bool,
}

fn ms(t: std::io::Result<SystemTime>) -> Option<f64> {
  let d = t.ok()?.duration_since(SystemTime::UNIX_EPOCH).ok()?;
  Some(d.as_secs_f64() * 1000.0)
}

pub fn read_text(path: &str) -> Result<String, String> {
  let bytes = fs::read(path).map_err(|e| fs_err(&e, "open", path))?;
  Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn read_bytes(path: &str) -> Result<Vec<u8>, String> {
  fs::read(path).map_err(|e| fs_err(&e, "open", path))
}

/// The largest range fs_read_range serves; a request for more is a bug in the caller.
pub const MAX_RANGE: usize = 64 * 1024 * 1024;

/// Up to `length` bytes starting at `offset` (fewer at the end of the file), for reading one entry
/// of a pack (main/helpers/assetPack.ts) without loading the rest.
pub fn read_range(path: &str, offset: u64, length: usize) -> Result<Vec<u8>, String> {
  if length > MAX_RANGE {
    return Err(format!("EINVAL: invalid argument, read: length {length} is above the {MAX_RANGE} byte limit '{path}'"));
  }
  let mut file = fs::File::open(path).map_err(|e| fs_err(&e, "open", path))?;
  file.seek(SeekFrom::Start(offset)).map_err(|e| fs_err(&e, "read", path))?;
  let mut out = Vec::with_capacity(length);
  file.take(length as u64).read_to_end(&mut out).map_err(|e| fs_err(&e, "read", path))?;
  Ok(out)
}

/// The most a compressed asset may decompress to. The biggest kuromoji file (`tid_pos.dat`) is 40 MB;
/// the cap only stops a corrupt file from filling memory.
const MAX_ASSET: u64 = 128 * 1024 * 1024;

/// A bundled language asset's bytes. Packaged builds keep the big ones compressed beside the plain
/// path (`zh.jieba.txt.zst`; scripts/compressLanguageAssets.js), development keeps them plain, so
/// this reads the plain file, else `<path>.zst`, else `<path>.gz`, as main/helpers/assetFiles.ts
/// readAsset does.
pub fn read_asset(path: &str) -> Result<Vec<u8>, String> {
  match fs::read(path) {
    Ok(bytes) => return Ok(bytes),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
    Err(e) => return Err(fs_err(&e, "open", path)),
  }
  let zst = format!("{path}.zst");
  match fs::read(&zst) {
    Ok(bytes) => return super::zstd::decompress(&bytes, MAX_ASSET),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
    Err(e) => return Err(fs_err(&e, "open", &zst)),
  }
  let gz = format!("{path}.gz");
  let file = fs::File::open(&gz).map_err(|e| fs_err(&e, "open", path))?;
  let mut out = Vec::new();
  flate2::read::GzDecoder::new(file).read_to_end(&mut out).map_err(|e| fs_err(&e, "read", &gz))?;
  Ok(out)
}

/// Writes `data` so that at no moment can anyone but `mode` allows read it: a new file is made with
/// `mode` beside `path` and moved over it (an existing file's wider permissions never cover the new
/// text), and an append narrows the file before writing.
#[cfg(unix)]
pub fn write_bytes_with_mode(path: &str, data: &[u8], append: bool, mode: u32) -> Result<(), String> {
  use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
  use std::sync::atomic::{AtomicU64, Ordering};
  static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
  let permissions = || fs::Permissions::from_mode(mode);
  if append {
    let mut f = fs::OpenOptions::new()
      .create(true)
      .append(true)
      .mode(mode)
      .open(path)
      .map_err(|e| fs_err(&e, "open", path))?;
    f.set_permissions(permissions()).map_err(|e| fs_err(&e, "chmod", path))?;
    return f.write_all(data).map_err(|e| fs_err(&e, "write", path));
  }
  let temp = format!("{path}.{}-{}.tmp", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed));
  let written = (|| {
    let mut f = fs::OpenOptions::new()
      .write(true)
      .create_new(true)
      .mode(mode)
      .open(&temp)
      .map_err(|e| fs_err(&e, "open", &temp))?;
    // The umask can only narrow `mode`; this makes it exact.
    f.set_permissions(permissions()).map_err(|e| fs_err(&e, "chmod", &temp))?;
    f.write_all(data).map_err(|e| fs_err(&e, "write", &temp))?;
    fs::rename(&temp, path).map_err(|e| fs_err(&e, "rename", path))
  })();
  if written.is_err() {
    let _ = fs::remove_file(&temp);
  }
  written
}

pub fn write_bytes(path: &str, data: &[u8], append: bool) -> Result<(), String> {
  if append {
    let mut f = fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(path)
      .map_err(|e| fs_err(&e, "open", path))?;
    f.write_all(data).map_err(|e| fs_err(&e, "write", path))
  } else {
    fs::write(path, data).map_err(|e| fs_err(&e, "open", path))
  }
}

pub fn stat(path: &str) -> Result<Option<Stat>, String> {
  let link = match fs::symlink_metadata(path) {
    Ok(m) => m,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(e) => return Err(fs_err(&e, "stat", path)),
  };
  let is_symlink = link.file_type().is_symlink();
  // Follow the link for everything but the flag; a dangling link falls back to the link itself.
  let m = if is_symlink { fs::metadata(path).unwrap_or(link) } else { link };
  let mtime = ms(m.modified()).unwrap_or(0.0);
  Ok(Some(Stat {
    is_file: m.is_file(),
    is_directory: m.is_dir(),
    is_symbolic_link: is_symlink,
    size: m.len(),
    mtime_ms: mtime,
    birthtime_ms: ms(m.created()).unwrap_or(mtime),
  }))
}

pub fn mkdir(path: &str, recursive: bool) -> Result<(), String> {
  let r = if recursive { fs::create_dir_all(path) } else { fs::create_dir(path) };
  r.map_err(|e| fs_err(&e, "mkdir", path))
}

pub fn readdir(path: &str) -> Result<Vec<DirEntry>, String> {
  let rd = fs::read_dir(path).map_err(|e| fs_err(&e, "scandir", path))?;
  let mut out = Vec::new();
  for entry in rd {
    let entry = entry.map_err(|e| fs_err(&e, "scandir", path))?;
    let mut ft = entry.file_type().map_err(|e| fs_err(&e, "scandir", path))?;
    if ft.is_symlink() {
      if let Ok(m) = fs::metadata(entry.path()) {
        ft = m.file_type();
      }
    }
    out.push(DirEntry {
      name: entry.file_name().to_string_lossy().into_owned(),
      is_file: ft.is_file(),
      is_directory: ft.is_dir(),
    });
  }
  Ok(out)
}

pub fn rm(path: &str, recursive: bool, force: bool) -> Result<(), String> {
  let meta = match fs::symlink_metadata(path) {
    Ok(m) => m,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound && force => return Ok(()),
    Err(e) => return Err(fs_err(&e, "rm", path)),
  };
  let r = if meta.is_dir() {
    if !recursive {
      return Err(format!("EISDIR: {}, rm '{path}'", code_text("EISDIR")));
    }
    fs::remove_dir_all(path)
  } else {
    // Directory symlinks on Windows need remove_dir.
    fs::remove_file(path).or_else(|e| {
      if meta.file_type().is_symlink() {
        fs::remove_dir(path)
      } else {
        Err(e)
      }
    })
  };
  match r {
    Err(e) if e.kind() == std::io::ErrorKind::NotFound && force => Ok(()),
    r => r.map_err(|e| fs_err(&e, "rm", path)),
  }
}

pub fn rename(from: &str, to: &str) -> Result<(), String> {
  fs::rename(from, to).map_err(|e| fs_err(&e, "rename", from))
}

pub fn copy(from: &str, to: &str) -> Result<(), String> {
  fs::copy(from, to).map(|_| ()).map_err(|e| fs_err(&e, "copyfile", from))
}

pub fn mkdtemp(prefix: &str) -> Result<String, String> {
  use std::sync::atomic::{AtomicU64, Ordering};
  static COUNTER: AtomicU64 = AtomicU64::new(0);
  const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for _ in 0..64 {
    let nanos = SystemTime::now()
      .duration_since(SystemTime::UNIX_EPOCH)
      .map(|d| d.as_nanos() as u64)
      .unwrap_or(0);
    let mut x = nanos
      ^ (u64::from(std::process::id()) << 32)
      ^ COUNTER.fetch_add(1, Ordering::Relaxed).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    x |= 1;
    let mut suffix = String::new();
    for _ in 0..6 {
      x ^= x << 13;
      x ^= x >> 7;
      x ^= x << 17;
      suffix.push(CHARS[(x % CHARS.len() as u64) as usize] as char);
    }
    let path = format!("{prefix}{suffix}");
    match fs::create_dir(&path) {
      Ok(()) => return Ok(path),
      Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
      Err(e) => return Err(fs_err(&e, "mkdtemp", &format!("{prefix}XXXXXX"))),
    }
  }
  Err(format!("EEXIST: {}, mkdtemp '{prefix}XXXXXX'", code_text("EEXIST")))
}

pub fn percent_decode(s: &str) -> String {
  let b = s.as_bytes();
  let mut out = Vec::with_capacity(b.len());
  let mut i = 0;
  while i < b.len() {
    if b[i] == b'%' && i + 2 < b.len() {
      if let Some(v) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()) {
        out.push(v);
        i += 3;
        continue;
      }
    }
    out.push(b[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub async fn fs_read_text(path: String) -> Result<String, String> {
  read_text(&path)
}

#[tauri::command]
pub async fn fs_read_bytes(path: String) -> Result<tauri::ipc::Response, String> {
  read_bytes(&path).map(tauri::ipc::Response::new)
}

#[tauri::command]
pub async fn fs_read_range(path: String, offset: u64, length: usize) -> Result<tauri::ipc::Response, String> {
  read_range(&path, offset, length).map(tauri::ipc::Response::new)
}

/// A language asset's decompressed bytes (see read_asset), for the kuromoji loader.
#[tauri::command]
pub async fn fs_read_asset(path: String) -> Result<tauri::ipc::Response, String> {
  read_asset(&path).map(tauri::ipc::Response::new)
}

/// `mode` (Node's writeFile option) sets the file's Unix permissions (write_bytes_with_mode). Unlike
/// Node, it applies to a file that already exists too, so a secret rewritten in place
/// (analyzer-server.json's token) doesn't keep the wider permissions an older version gave it.
/// Windows keeps the folder's per-user access.
#[tauri::command]
pub async fn fs_write_text(path: String, text: String, append: bool, mode: Option<u32>) -> Result<(), String> {
  #[cfg(unix)]
  if let Some(mode) = mode {
    return write_bytes_with_mode(&path, text.as_bytes(), append, mode);
  }
  #[cfg(not(unix))]
  let _ = mode;
  write_bytes(&path, text.as_bytes(), append)
}

#[tauri::command]
pub async fn fs_write_bytes(request: tauri::ipc::Request<'_>) -> Result<(), String> {
  let data = super::raw_body(request.body(), "write")?;
  let path = request
    .headers()
    .get("x-path")
    .and_then(|v| v.to_str().ok())
    .map(percent_decode)
    .ok_or_else(|| "EINVAL: invalid argument, write: missing x-path header".to_string())?;
  let append = request
    .headers()
    .get("x-append")
    .and_then(|v| v.to_str().ok())
    .is_some_and(|v| v == "1");
  write_bytes(&path, &data, append)
}

#[tauri::command]
pub async fn fs_stat(path: String) -> Result<Option<Stat>, String> {
  stat(&path)
}

#[tauri::command]
pub async fn fs_mkdir(path: String, recursive: bool) -> Result<(), String> {
  mkdir(&path, recursive)
}

#[tauri::command]
pub async fn fs_readdir(path: String) -> Result<Vec<DirEntry>, String> {
  readdir(&path)
}

#[tauri::command]
pub async fn fs_rm(path: String, recursive: bool, force: bool) -> Result<(), String> {
  rm(&path, recursive, force)
}

#[tauri::command]
pub async fn fs_rename(from: String, to: String) -> Result<(), String> {
  rename(&from, &to)
}

#[tauri::command]
pub async fn fs_copy(from: String, to: String) -> Result<(), String> {
  copy(&from, &to)
}

#[tauri::command]
pub async fn fs_mkdtemp(prefix: String) -> Result<String, String> {
  mkdtemp(&prefix)
}

#[cfg(test)]
pub mod tests {
  use super::*;
  use std::path::Path;

  pub fn tmp(name: &str) -> std::path::PathBuf {
    let p = std::env::temp_dir().join(format!("miteiru-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
  }

  #[test]
  fn missing_file_is_enoent() {
    let d = tmp("fs-enoent");
    let p = d.join("nope.txt").to_string_lossy().into_owned();
    let e = read_text(&p).unwrap_err();
    assert!(e.starts_with("ENOENT: no such file or directory, open '"), "{e}");
    assert_eq!(stat(&p).unwrap(), None);
    assert!(rm(&p, false, true).is_ok());
    assert!(rm(&p, false, false).unwrap_err().starts_with("ENOENT"));
  }

  #[test]
  fn read_range_middle_eof_missing_and_cap() {
    let d = tmp("fs-range");
    let f = d.join("r.bin").to_string_lossy().into_owned();
    write_bytes(&f, b"0123456789", false).unwrap();
    assert_eq!(read_range(&f, 3, 4).unwrap(), b"3456");
    assert_eq!(read_range(&f, 8, 100).unwrap(), b"89");
    assert_eq!(read_range(&f, 50, 4).unwrap(), b"");
    assert_eq!(read_range(&f, 0, 0).unwrap(), b"");
    let missing = d.join("nope.bin").to_string_lossy().into_owned();
    let e = read_range(&missing, 0, 1).unwrap_err();
    assert!(e.starts_with("ENOENT: no such file or directory, open '"), "{e}");
    let e = read_range(&f, 0, MAX_RANGE + 1).unwrap_err();
    assert!(e.starts_with("EINVAL: invalid argument, read: "), "{e}");
    assert_eq!(read_range(&f, 0, MAX_RANGE).unwrap().len(), 10);
  }

  #[test]
  fn read_asset_prefers_plain_then_zst_then_gz() {
    let d = tmp("fs-asset");
    let base = d.join("a.txt").to_string_lossy().into_owned();
    let gz = {
      let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
      e.write_all(b"from gz").unwrap();
      e.finish().unwrap()
    };
    let e = read_asset(&base).unwrap_err();
    assert!(e.starts_with("ENOENT: no such file or directory, open '"), "{e}");
    write_bytes(&format!("{base}.gz"), &gz, false).unwrap();
    assert_eq!(read_asset(&base).unwrap(), b"from gz");
    write_bytes(&format!("{base}.zst"), &zstd::encode_all(&b"from zst"[..], 3).unwrap(), false).unwrap();
    assert_eq!(read_asset(&base).unwrap(), b"from zst");
    write_bytes(&base, b"plain", false).unwrap();
    assert_eq!(read_asset(&base).unwrap(), b"plain");
    // A corrupt .zst is an error, not a silent fall back to the .gz.
    fs::remove_file(&base).unwrap();
    write_bytes(&format!("{base}.zst"), b"not zstd", false).unwrap();
    assert!(read_asset(&base).unwrap_err().starts_with("EINVAL"));
  }

  #[test]
  fn mkdir_exists_and_dir_errors() {
    let d = tmp("fs-mkdir");
    let sub = d.join("a/b").to_string_lossy().into_owned();
    mkdir(&sub, true).unwrap();
    mkdir(&sub, true).unwrap();
    assert!(mkdir(&sub, false).unwrap_err().starts_with("EEXIST"));
    let f = d.join("f.txt").to_string_lossy().into_owned();
    write_bytes(&f, b"x", false).unwrap();
    assert!(readdir(&f).is_err());
    let a = d.join("a").to_string_lossy().into_owned();
    assert!(rm(&a, false, false).unwrap_err().starts_with("EISDIR"));
    rm(&a, true, false).unwrap();
  }

  #[test]
  fn write_append_stat_readdir_temp() {
    let d = tmp("fs-rw");
    let f = d.join("f.txt").to_string_lossy().into_owned();
    write_bytes(&f, "こんにちは".as_bytes(), false).unwrap();
    write_bytes(&f, b"!", true).unwrap();
    assert_eq!(read_text(&f).unwrap(), "こんにちは!");
    let s = stat(&f).unwrap().unwrap();
    assert!(s.is_file && !s.is_directory && s.size == 16 && s.mtime_ms > 0.0);
    let names: Vec<_> = readdir(d.to_str().unwrap()).unwrap().into_iter().map(|e| e.name).collect();
    assert_eq!(names, vec!["f.txt"]);
    let t = mkdtemp(&format!("{}/pre-", d.to_str().unwrap())).unwrap();
    assert!(Path::new(&t).is_dir());
    assert_eq!(percent_decode("C%3A%5Cmy%20dir%5C%E3%81%82.txt"), "C:\\my dir\\あ.txt");
    assert_eq!(percent_decode("100%"), "100%");
  }

  #[cfg(unix)]
  #[test]
  fn a_write_with_a_mode_is_never_wider_than_the_mode() {
    use std::os::unix::fs::PermissionsExt;
    let d = tmp("fs-mode");
    let f = d.join("secret.json").to_string_lossy().into_owned();
    let mode_of = |p: &str| fs::metadata(p).unwrap().permissions().mode() & 0o777;
    // An older version's file, readable by everyone, is replaced by one only its owner reads.
    write_bytes(&f, b"old", false).unwrap();
    fs::set_permissions(&f, fs::Permissions::from_mode(0o644)).unwrap();
    write_bytes_with_mode(&f, b"{\"token\":1}", false, 0o600).unwrap();
    assert_eq!(mode_of(&f), 0o600);
    assert_eq!(read_text(&f).unwrap(), "{\"token\":1}");
    // An append narrows the file before adding to it.
    fs::set_permissions(&f, fs::Permissions::from_mode(0o644)).unwrap();
    write_bytes_with_mode(&f, b"!", true, 0o600).unwrap();
    assert_eq!(mode_of(&f), 0o600);
    assert_eq!(read_text(&f).unwrap(), "{\"token\":1}!");
    // No temporary file is left beside it.
    let names: Vec<_> = readdir(d.to_str().unwrap()).unwrap().into_iter().map(|e| e.name).collect();
    assert_eq!(names, vec!["secret.json"]);
  }
}
