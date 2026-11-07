//! zstd for the backend worker: the browser's DecompressionStream has no zstd, so a data table's
//! blocks (docs/DATA_FORMAT.md) are decompressed here.

use std::io::Read;

/// The most a decompressed answer may hold: a block is about 128 KB, so this only stops a corrupt or
/// hostile input from filling memory.
const MAX_OUTPUT: u64 = 64 * 1024 * 1024;

fn decompress(input: &[u8], cap: u64) -> Result<Vec<u8>, String> {
  let fail = |e: std::io::Error| format!("EINVAL: invalid argument, zstd decompress: {e}");
  let decoder = zstd::stream::read::Decoder::new(input).map_err(fail)?;
  let mut out = Vec::new();
  // One byte past the cap tells "exactly the cap" from "more than the cap".
  decoder.take(cap + 1).read_to_end(&mut out).map_err(fail)?;
  if out.len() as u64 > cap {
    return Err(format!("EINVAL: invalid argument, zstd decompress: output is larger than {cap} bytes"));
  }
  Ok(out)
}

/// Decompresses a raw body of zstd frames (shims/zlib.ts zstdDecompress) into a raw response.
#[tauri::command]
pub async fn zstd_decompress(request: tauri::ipc::Request<'_>) -> Result<tauri::ipc::Response, String> {
  let body = super::raw_body(request.body(), "zstd decompress")?;
  decompress(&body, MAX_OUTPUT).map(tauri::ipc::Response::new)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn round_trips() {
    let text = "日本語 stroke data ".repeat(5000);
    let packed = zstd::encode_all(text.as_bytes(), 19).unwrap();
    assert!(packed.len() < text.len() / 10);
    assert_eq!(decompress(&packed, MAX_OUTPUT).unwrap(), text.as_bytes());
    assert_eq!(decompress(&zstd::encode_all(&b""[..], 3).unwrap(), MAX_OUTPUT).unwrap(), b"");
  }

  #[test]
  fn corrupt_input_is_an_error() {
    assert!(decompress(b"definitely not zstd", MAX_OUTPUT).is_err());
    let packed = zstd::encode_all(&b"hello hello hello hello"[..], 3).unwrap();
    assert!(decompress(&packed[..packed.len() - 3], MAX_OUTPUT).is_err());
  }

  #[test]
  fn output_over_the_cap_is_refused() {
    let packed = zstd::encode_all(&[7u8; 10_000][..], 3).unwrap();
    assert_eq!(decompress(&packed, 10_000).unwrap().len(), 10_000);
    assert!(decompress(&packed, 9_999).unwrap_err().contains("larger than"));
  }
}
