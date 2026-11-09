//! Miteiru's own tokenizers, shared by the desktop app (src-tauri) and, later, the mobile core (#119, #121).
//!
//! - [`japanese`]: a kuromoji-compatible lattice tokenizer over the IPADIC files the Japanese pack
//!   already ships (`language-assets/japanese/dict/*.dat.gz`), with app and user words as extra nodes.
//! - [`chinese`]: a jieba-compatible DAG segmenter over the packs' jieba word lists (`zh.jieba.txt`,
//!   `yue.jieba.txt`), with dictionary headwords and user words as extra entries.
//! - [`lexicon`]: the extra words both take, and where they come from.
//!
//! With no extra words, each tokenizer must give exactly what kuromoji.js / jieba-rs give today.

pub mod chinese;
pub mod japanese;
pub mod lexicon;
