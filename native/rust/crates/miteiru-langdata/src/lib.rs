//! Miteiru's language data engines, shared so that every way of reaching them gives the same answers:
//! the desktop app's backend commands (src-tauri/src/sys) and the Node addon that the headless language
//! server loads (crates/miteiru-node, main/headless).
//!
//! - [`table`]: read-only MTRPACK2 data tables (the dictionaries), with a shared block cache.
//! - [`asset`]: a language asset's bytes, plain or stored as `.zst` / `.gz` beside its path.
//! - [`japanese`]: the Japanese tokenizer over a language pack's IPADIC, with the learner's own words.
//! - [`chinese`]: the Mandarin and Cantonese tokenizers, keyed by name, with the learner's own words.
//! - [`errors`]: Node-style error codes, which the JS side turns back into errors with a `code`.

pub mod asset;
pub mod chinese;
pub mod errors;
pub mod japanese;
pub use miteiru_opencc as opencc;
pub mod table;
pub mod zstd;

#[cfg(test)]
pub(crate) mod test_support {
  /// A fresh, empty folder for one test.
  pub fn tmp(name: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("miteiru-langdata-test-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).unwrap();
    path
  }
}
