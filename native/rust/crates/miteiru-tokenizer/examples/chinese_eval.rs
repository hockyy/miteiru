use jieba_rs::Jieba;
use miteiru_tokenizer::chinese::{Language, Tokenizer};
use serde::{Deserialize, Serialize};
use std::alloc::{GlobalAlloc, Layout, System};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Instant;

struct MeasuredAllocator;
static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
static MEASURE: AtomicBool = AtomicBool::new(true);

unsafe impl GlobalAlloc for MeasuredAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = System.alloc(layout);
        if !pointer.is_null() && MEASURE.load(Ordering::Relaxed) {
            let bytes = LIVE.fetch_add(layout.size(), Ordering::Relaxed) + layout.size();
            PEAK.fetch_max(bytes, Ordering::Relaxed);
        }
        pointer
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        if MEASURE.load(Ordering::Relaxed) {
            LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
        }
        System.dealloc(pointer, layout);
    }
}

#[global_allocator]
static ALLOCATOR: MeasuredAllocator = MeasuredAllocator;

#[derive(Deserialize)]
struct Input {
    id: String,
    text: String,
}
#[derive(Serialize)]
struct Prediction<'a> {
    id: &'a str,
    tokens: Vec<&'a str>,
}

enum Engine {
    Reference(Jieba),
    Native(Tokenizer),
}

impl Engine {
    fn cut<'a>(&self, text: &'a str, hmm: bool) -> Vec<&'a str> {
        match self {
            Self::Reference(engine) => engine.cut(text, hmm),
            Self::Native(engine) => engine.cut(text, hmm),
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 7 {
        return Err("usage: chinese_eval <jieba|native> <zh|yue> <list> <headwords.txt|-> <corpus.jsonl> <predictions.jsonl> <hmm:true|false>".into());
    }
    if !matches!(args[0].as_str(), "jieba" | "native")
        || !matches!(args[1].as_str(), "zh" | "yue")
        || !matches!(args[6].as_str(), "true" | "false")
    {
        return Err("invalid engine, language, or HMM/typed-OOV flag".into());
    }
    let corpus: Vec<Input> = BufReader::new(std::fs::File::open(&args[4])?)
        .lines()
        .map(|line| Ok(serde_json::from_str(&line?)?))
        .collect::<Result<_, Box<dyn std::error::Error>>>()?;
    let bytes = std::fs::read(&args[2])?;
    let before = LIVE.load(Ordering::Relaxed);
    PEAK.store(before, Ordering::Relaxed);
    let started = Instant::now();
    let mut engine = if args[0] == "jieba" {
        Engine::Reference(Jieba::with_dict(&mut BufReader::new(bytes.as_slice()))?)
    } else {
        Engine::Native(Tokenizer::with_dict(
            &mut BufReader::new(bytes.as_slice()),
            if args[1] == "yue" {
                Language::Cantonese
            } else {
                Language::Mandarin
            },
        )?)
    };
    let load_ms = started.elapsed().as_secs_f64() * 1000.0;
    let base_bytes = LIVE.load(Ordering::Relaxed).saturating_sub(before);
    let base_peak_bytes = PEAK.load(Ordering::Relaxed).saturating_sub(before);
    let started = Instant::now();
    let mut added = 0;
    let mut filtered = 0;
    let mut restored = 0;
    if let Engine::Native(ref mut tokenizer) = engine {
        if args[3] != "-" {
            let words = std::fs::read_to_string(&args[3])?;
            let stats = tokenizer.set_app_words(words.lines());
            added = stats.added;
            filtered = stats.filtered;
            restored = stats.restored;
        }
    }
    let overlay_ms = started.elapsed().as_secs_f64() * 1000.0;
    let retained_bytes = LIVE.load(Ordering::Relaxed).saturating_sub(before);
    let hmm = args[6] == "true";
    let mut writer = std::io::BufWriter::new(std::fs::File::create(&args[5])?);
    for line in &corpus {
        let tokens = engine.cut(&line.text, hmm);
        assert_eq!(tokens.concat(), line.text, "text preservation: {}", line.id);
        serde_json::to_writer(
            &mut writer,
            &Prediction {
                id: &line.id,
                tokens,
            },
        )?;
        writeln!(writer)?;
    }
    writer.flush()?;
    MEASURE.store(false, Ordering::Relaxed);
    for line in &corpus {
        std::hint::black_box(engine.cut(&line.text, hmm));
    }
    let started = Instant::now();
    let mut rounds = 0;
    let corpus_bytes: usize = corpus.iter().map(|line| line.text.len()).sum();
    while started.elapsed().as_millis() < 800 {
        for line in &corpus {
            std::hint::black_box(engine.cut(&line.text, hmm));
        }
        rounds += 1;
    }
    println!(
        "{}",
        serde_json::json!({"engine":args[0], "language":args[1], "hmm":hmm,
        "lines":corpus.len(), "loadMs":load_ms, "overlayMs":overlay_ms,
        "baseHeapBytes":base_bytes, "basePeakHeapBytes":base_peak_bytes,
        "retainedHeapBytes":retained_bytes, "added":added, "filtered":filtered, "restored":restored,
        "mibPerSecond":(rounds * corpus_bytes) as f64 / 1048576.0 / started.elapsed().as_secs_f64()})
    );
    Ok(())
}
