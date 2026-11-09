//! Miteiru's own tokenizers, shared by the desktop app (src-tauri) and, later, the mobile core (#119, #121).
//!
//! - [`japanese`]: a kuromoji-compatible lattice tokenizer over the IPADIC files the Japanese pack
//!   already ships (`language-assets/japanese/dict/*.dat.gz`), with app and user words as extra nodes.
//! - [`chinese`]: a frequency-scored lattice over the packs' word lists (`zh.jieba.txt`,
//!   `yue.jieba.txt`), with dictionary headwords and user words as extra entries.
//! - [`lexicon`]: the extra words both take, and where they come from.
//!
//! Japanese preserves kuromoji token fields, with normalization and typed suffix chains.
//! Chinese compares against jieba-rs, but optimizes for
//! dictionary-look-up-able learning units rather than exact output parity.

pub mod chinese;
pub mod japanese;
pub mod lexicon;
