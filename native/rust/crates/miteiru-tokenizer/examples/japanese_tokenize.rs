use miteiru_tokenizer::japanese::{DictionaryWord, Token, Tokenizer};
use miteiru_tokenizer::lexicon::{ExtraWord, WordSource};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::time::Instant;

#[derive(Deserialize)]
struct UserWord {
    surface: String,
    source: String,
}

#[derive(Deserialize)]
struct Input {
    lines: Vec<String>,
    #[serde(default)]
    dictionary_words: Vec<DictionaryWord>,
    #[serde(default)]
    user_words: Vec<UserWord>,
    #[serde(default = "repetitions")]
    repetitions: usize,
}

fn repetitions() -> usize {
    3
}

fn measure(
    tokenizer: &Tokenizer,
    lines: &[String],
    suffixes: bool,
    repetitions: usize,
) -> (Vec<Vec<Token>>, f64) {
    let tokenize = |text: &str| {
        if suffixes {
            tokenizer.tokenize_with_suffixes(text)
        } else {
            tokenizer.tokenize(text)
        }
    };
    let result = lines.iter().map(|text| tokenize(text)).collect();
    let start = Instant::now();
    for _ in 0..repetitions {
        for text in lines {
            std::hint::black_box(tokenize(text));
        }
    }
    (
        result,
        start.elapsed().as_secs_f64() * 1000.0 / repetitions as f64,
    )
}

fn run() -> Result<(), String> {
    let directory = std::env::args()
        .nth(1)
        .ok_or("Usage: japanese_tokenize <IPADIC directory>; JSON input on stdin")?;
    let mut input = String::new();
    std::io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| error.to_string())?;
    let input: Input = serde_json::from_str(&input).map_err(|error| error.to_string())?;
    let start = Instant::now();
    let mut tokenizer = Tokenizer::from_directory(Path::new(&directory))?;
    let load_ms = start.elapsed().as_secs_f64() * 1000.0;
    let base_memory = tokenizer.memory_bytes();
    let mut tokens = BTreeMap::new();
    let mut times = BTreeMap::new();
    let repetitions = input.repetitions.clamp(1, 100);
    let (base, time) = measure(&tokenizer, &input.lines, false, repetitions);
    tokens.insert("base", base);
    times.insert("base", time);
    let start = Instant::now();
    tokenizer.set_dictionary_words(input.dictionary_words.iter().cloned());
    let lemma_load_ms = start.elapsed().as_secs_f64() * 1000.0;
    let default_memory = tokenizer.memory_bytes();
    let (suffix, time) = measure(&tokenizer, &input.lines, true, repetitions);
    tokens.insert("suffix", suffix);
    times.insert("suffix", time);
    tokenizer.set_user_words(
        &input
            .user_words
            .into_iter()
            .map(|word| ExtraWord {
                surface: word.surface,
                source: if word.source == "manual" {
                    WordSource::UserManual
                } else {
                    WordSource::UserAi
                },
            })
            .collect::<Vec<_>>(),
    );
    let (user, time) = measure(&tokenizer, &input.lines, true, repetitions);
    tokens.insert("user", user);
    times.insert("user", time);
    let mut app_tokenizer = Tokenizer::from_directory(Path::new(&directory))?;
    let start = Instant::now();
    app_tokenizer.set_dictionary_words_with_app(input.dictionary_words, true);
    let app_lexicon_load_ms = start.elapsed().as_secs_f64() * 1000.0;
    let app_words = app_tokenizer.app_word_count();
    let (app, time) = measure(&app_tokenizer, &input.lines, false, repetitions);
    tokens.insert("app", app);
    times.insert("app", time);
    let (suffix_app, time) = measure(&app_tokenizer, &input.lines, true, repetitions);
    tokens.insert("suffix_app", suffix_app);
    times.insert("suffix_app", time);
    println!(
        "{}",
        serde_json::json!({ "tokens": tokens, "metrics": {
            "load_ms": load_ms, "lemma_load_ms": lemma_load_ms, "app_lexicon_load_ms": app_lexicon_load_ms,
            "base_owned_bytes": base_memory, "default_owned_bytes": default_memory,
            "app_owned_bytes": app_tokenizer.memory_bytes(), "app_words": app_words, "batch_ms": times,
            "lines": input.lines.len(), "repetitions": repetitions,
        }})
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
