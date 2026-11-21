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

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let [engine, language, list, headwords, corpus_path, predictions, typed_oov] = args.as_slice()
    else {
        return Err("usage: chinese_eval native <zh|yue> <list> <headwords.txt|-> <corpus.jsonl> <predictions.jsonl> <typed-oov:true|false>".into());
    };
    let language_mode = match (engine.as_str(), language.as_str()) {
        ("native", "zh") => Language::Mandarin,
        ("native", "yue") => Language::Cantonese,
        _ => return Err("expected native zh or native yue".into()),
    };
    let typed_oov = typed_oov.parse::<bool>()?;
    let corpus: Vec<Input> = BufReader::new(std::fs::File::open(corpus_path)?)
        .lines()
        .map(|line| Ok(serde_json::from_str(&line?)?))
        .collect::<Result<_, Box<dyn std::error::Error>>>()?;
    let bytes = std::fs::read(list)?;
    let before = LIVE.load(Ordering::Relaxed);
    PEAK.store(before, Ordering::Relaxed);
    let started = Instant::now();
    let mut engine = Tokenizer::with_dict(&mut BufReader::new(bytes.as_slice()), language_mode)?;
    let load_ms = started.elapsed().as_secs_f64() * 1000.0;
    let base_bytes = LIVE.load(Ordering::Relaxed).saturating_sub(before);
    let base_peak_bytes = PEAK.load(Ordering::Relaxed).saturating_sub(before);
    let started = Instant::now();
    let stats = if headwords == "-" {
        Default::default()
    } else {
        let words = std::fs::read_to_string(headwords)?;
        engine.set_app_words(words.lines())
    };
    let overlay_ms = started.elapsed().as_secs_f64() * 1000.0;
    let retained_bytes = LIVE.load(Ordering::Relaxed).saturating_sub(before);
    let mut writer = std::io::BufWriter::new(std::fs::File::create(predictions)?);
    for line in &corpus {
        let tokens = engine.cut(&line.text, typed_oov);
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
        std::hint::black_box(engine.cut(&line.text, typed_oov));
    }
    let started = Instant::now();
    let mut rounds = 0;
    let corpus_bytes: usize = corpus.iter().map(|line| line.text.len()).sum();
    while started.elapsed().as_millis() < 800 {
        for line in &corpus {
            std::hint::black_box(engine.cut(&line.text, typed_oov));
        }
        rounds += 1;
    }
    println!(
        "{}",
        serde_json::json!({"engine":"native", "language":language, "hmm":typed_oov,
        "lines":corpus.len(), "loadMs":load_ms, "overlayMs":overlay_ms,
        "baseHeapBytes":base_bytes, "basePeakHeapBytes":base_peak_bytes,
        "retainedHeapBytes":retained_bytes, "added":stats.added, "filtered":stats.filtered, "restored":stats.restored,
        "mibPerSecond":(rounds * corpus_bytes) as f64 / 1048576.0 / started.elapsed().as_secs_f64()})
    );
    Ok(())
}
