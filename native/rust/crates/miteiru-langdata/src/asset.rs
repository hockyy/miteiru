//! Reading a language asset that may be stored compressed beside its plain path.

use crate::errors::fs_err;
use std::fs;
use std::io::Read;

/// The most a compressed asset may decompress to. The biggest kuromoji file (`tid_pos.dat`) is 40 MB;
/// the cap only stops a corrupt file from filling memory.
pub const MAX_ASSET: u64 = 128 * 1024 * 1024;

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
    Ok(bytes) => return crate::zstd::decompress(&bytes, MAX_ASSET),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
    Err(e) => return Err(fs_err(&e, "open", &zst)),
  }
  let gz = format!("{path}.gz");
  let file = fs::File::open(&gz).map_err(|e| fs_err(&e, "open", path))?;
  let mut out = Vec::new();
  flate2::read::GzDecoder::new(file).read_to_end(&mut out).map_err(|e| fs_err(&e, "read", &gz))?;
  Ok(out)
}

