//! Read-only data tables (MTRPACK2, docs/DATA_FORMAT.md) for the backend worker. The bundled
//! dictionaries are tables, and a subtitle file asks for a gloss of every distinct word in it, each
//! needing several range scans and record fetches. Doing those in the worker would cost an IPC round
//! trip per block read plus a decompression each; here one command answers one query.
//!
//! `table_open` parses and validates the header once per path (refcounted), a table's blocks are read
//! with positional reads and decompressed on demand, and decoded blocks live in one LRU shared by all
//! tables, under a byte budget. The JS reader (main/helpers/dataTable.ts) is the reference: both read
//! tests/fixtures/dictionary-fixture.pack.

use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const MAGIC: &[u8; 8] = b"MTRPACK2";
const PREAMBLE_BYTES: u64 = 12;
const FORMAT: u64 = 2;
/// What the decoded blocks of all open tables may hold together. A block is about 256 KB.
const CACHE_BUDGET: usize = 32 * 1024 * 1024;
/// A decoded block is far smaller than this; the cap only stops a corrupt block from filling memory.
const MAX_BLOCK_BYTES: u64 = 64 * 1024 * 1024;

fn corrupt(path: &str, why: &str) -> String {
  format!("EIO: i/o error, table '{path}' is corrupt ({why})")
}

// ---- Positional reads ----------------------------------------------------------------------

#[cfg(unix)]
fn read_at(file: &File, buf: &mut [u8], offset: u64) -> io::Result<usize> {
  std::os::unix::fs::FileExt::read_at(file, buf, offset)
}

#[cfg(windows)]
fn read_at(file: &File, buf: &mut [u8], offset: u64) -> io::Result<usize> {
  std::os::windows::fs::FileExt::seek_read(file, buf, offset)
}

/// Fills `buf` from `offset`. Position-independent, so readers of one file never disturb each other.
fn read_exact_at(file: &File, buf: &mut [u8], offset: u64, path: &str) -> Result<(), String> {
  let mut filled = 0;
  while filled < buf.len() {
    match read_at(file, &mut buf[filled..], offset + filled as u64) {
      Ok(0) => return Err(corrupt(path, "truncated")),
      Ok(n) => filled += n,
      Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
      Err(e) => return Err(super::fs_err(&e, "read", path)),
    }
  }
  Ok(())
}

// ---- A table's header ----------------------------------------------------------------------

struct BlockRef {
  /// The block's first key, as bytes.
  first: Vec<u8>,
  /// From the start of the data section.
  offset: u64,
  length: u64,
  count: u64,
}

struct Table {
  path: String,
  /// Unique per open, so the shared cache never mixes tables (a table reopened gets a new id).
  id: u32,
  file: File,
  data_start: u64,
  blocks: Vec<BlockRef>,
}

fn as_count(value: &Value) -> Option<u64> {
  value.as_u64()
}

/// The checks of the JS reader's parseHeader: format, fields, block bounds, order and counts.
fn parse_header(value: &Value, path: &str, data_length: u64) -> Result<Vec<BlockRef>, String> {
  let bad = |why: &str| corrupt(path, why);
  let header = value.as_object().ok_or_else(|| bad("header is not an object"))?;
  if header.get("format").and_then(Value::as_u64) != Some(FORMAT) {
    return Err(bad(&format!("unsupported format {}", header.get("format").map_or("undefined".to_string(), |f| f.to_string()))));
  }
  for field in ["dataset", "version", "codec"] {
    if !header.get(field).is_some_and(Value::is_string) {
      return Err(bad(&format!("header has no {field}")));
    }
  }
  if header.get("compression").and_then(Value::as_str) != Some("zstd") {
    return Err(bad("unsupported compression"));
  }
  let entries = header.get("entries").and_then(as_count).ok_or_else(|| bad("bad entry count"))?;
  let list = header.get("blocks").and_then(Value::as_array).ok_or_else(|| bad("header has no block list"))?;
  let mut blocks: Vec<BlockRef> = Vec::with_capacity(list.len());
  let mut total = 0u64;
  for (number, block) in list.iter().enumerate() {
    let parts = block.as_array().filter(|p| p.len() == 4);
    let parsed = parts.and_then(|p| Some((p[0].as_str()?, as_count(&p[1])?, as_count(&p[2])?, as_count(&p[3])?)));
    let Some((first, offset, length, count)) = parsed.filter(|p| p.3 != 0) else {
      return Err(bad(&format!("bad block {number}")));
    };
    if offset.checked_add(length).is_none_or(|end| end > data_length) {
      return Err(bad(&format!("block {number} is outside the file")));
    }
    let first = first.as_bytes().to_vec();
    if blocks.last().is_some_and(|previous| previous.first >= first) {
      return Err(bad(&format!("block {number} is out of order")));
    }
    total = total.checked_add(count).ok_or_else(|| bad("block entry counts do not add up"))?;
    blocks.push(BlockRef { first, offset, length, count });
  }
  if total != entries {
    return Err(bad("block entry counts do not add up"));
  }
  Ok(blocks)
}

fn load_table(path: &str, id: u32) -> Result<Table, String> {
  let file = File::open(path).map_err(|e| super::fs_err(&e, "open", path))?;
  let size = file.metadata().map_err(|e| super::fs_err(&e, "stat", path))?.len();
  let not_a_table = |why: &str| format!("EINVAL: invalid argument, '{path}' is not a data table ({why})");
  if size < PREAMBLE_BYTES {
    return Err(not_a_table("too short"));
  }
  let mut preamble = [0u8; PREAMBLE_BYTES as usize];
  read_exact_at(&file, &mut preamble, 0, path)?;
  if &preamble[..8] != MAGIC {
    return Err(not_a_table("bad magic"));
  }
  let header_length = u32::from_le_bytes(preamble[8..12].try_into().unwrap()) as u64;
  let data_start = PREAMBLE_BYTES + header_length;
  if data_start > size {
    return Err(corrupt(path, &format!("header of {header_length} bytes does not fit")));
  }
  let mut raw = vec![0u8; header_length as usize];
  read_exact_at(&file, &mut raw, PREAMBLE_BYTES, path)?;
  let value: Value = serde_json::from_slice(&raw).map_err(|_| corrupt(path, "unreadable header"))?;
  let blocks = parse_header(&value, path, size - data_start)?;
  Ok(Table { path: path.to_string(), id, file, data_start, blocks })
}

// ---- Blocks --------------------------------------------------------------------------------

/// A decoded block: its raw bytes and where each entry's key and value sit in them.
struct Block {
  raw: Vec<u8>,
  /// (key start, key length, value start, value length) per entry.
  entries: Vec<(u32, u32, u32, u32)>,
}

impl Block {
  fn key(&self, i: usize) -> &[u8] {
    let (start, length, _, _) = self.entries[i];
    &self.raw[start as usize..(start + length) as usize]
  }

  fn value(&self, i: usize) -> &[u8] {
    let (_, _, start, length) = self.entries[i];
    &self.raw[start as usize..(start + length) as usize]
  }

  /// The first entry whose key is at or above `key`.
  fn lower_bound(&self, key: &[u8]) -> usize {
    let (mut low, mut high) = (0, self.entries.len());
    while low < high {
      let middle = (low + high) / 2;
      if self.key(middle) < key {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    low
  }

  /// What the cache counts for this block.
  fn size(&self) -> usize {
    self.raw.len() + self.entries.len() * std::mem::size_of::<(u32, u32, u32, u32)>()
  }
}

/// Splits a decompressed block: repeated [u32 key length][key][u32 value length][value], keys ascending.
fn decode_block(raw: Vec<u8>, expected: u64, path: &str) -> Result<Block, String> {
  let ends_inside = || corrupt(path, "block ends inside an entry");
  let mut entries = Vec::with_capacity(expected.min(1 << 20) as usize);
  let mut at = 0usize;
  let piece = |at: &mut usize| -> Result<(u32, u32), String> {
    let head = raw.get(*at..*at + 4).ok_or_else(ends_inside)?;
    let length = u32::from_le_bytes(head.try_into().unwrap());
    *at += 4;
    let start = *at;
    if start + length as usize > raw.len() {
      return Err(ends_inside());
    }
    *at += length as usize;
    Ok((start as u32, length))
  };
  while at < raw.len() {
    let (key_start, key_length) = piece(&mut at)?;
    let (value_start, value_length) = piece(&mut at)?;
    entries.push((key_start, key_length, value_start, value_length));
  }
  if entries.len() as u64 != expected {
    return Err(corrupt(path, &format!("block holds {} entries, not {expected}", entries.len())));
  }
  let block = Block { raw, entries };
  for i in 1..block.entries.len() {
    if block.key(i - 1) >= block.key(i) {
      return Err(corrupt(path, "keys in a block are out of order"));
    }
  }
  Ok(block)
}

/// Index of the last block whose first key is at or below `key`; None when the key sorts before the table.
fn block_for(blocks: &[BlockRef], key: &[u8]) -> Option<usize> {
  blocks.partition_point(|block| block.first.as_slice() <= key).checked_sub(1)
}

fn text(bytes: &[u8], path: &str) -> Result<String, String> {
  String::from_utf8(bytes.to_vec()).map_err(|_| corrupt(path, "a value is not UTF-8"))
}

// ---- The shared block cache ----------------------------------------------------------------

/// Decoded blocks of every open table, least recently used out first once over the byte budget.
struct Cache {
  budget: usize,
  bytes: usize,
  tick: u64,
  map: HashMap<(u32, usize), (Arc<Block>, u64)>,
}

impl Cache {
  fn new(budget: usize) -> Self {
    Cache { budget, bytes: 0, tick: 0, map: HashMap::new() }
  }

  fn get(&mut self, key: (u32, usize)) -> Option<Arc<Block>> {
    self.tick += 1;
    let tick = self.tick;
    self.map.get_mut(&key).map(|(block, used)| {
      *used = tick;
      block.clone()
    })
  }

  fn insert(&mut self, key: (u32, usize), block: Arc<Block>) {
    self.tick += 1;
    self.bytes += block.size();
    if let Some((old, _)) = self.map.insert(key, (block, self.tick)) {
      self.bytes -= old.size();
    }
    // The block just inserted always stays, even when it alone is over the budget.
    while self.bytes > self.budget && self.map.len() > 1 {
      let oldest = *self.map.iter().min_by_key(|(_, (_, used))| *used).map(|(key, _)| key).unwrap();
      if let Some((evicted, _)) = self.map.remove(&oldest) {
        self.bytes -= evicted.size();
      }
    }
  }

  fn forget_table(&mut self, id: u32) {
    let ids: Vec<_> = self.map.keys().filter(|key| key.0 == id).copied().collect();
    for key in ids {
      if let Some((block, _)) = self.map.remove(&key) {
        self.bytes -= block.size();
      }
    }
  }
}

// ---- The registry --------------------------------------------------------------------------

struct Slot {
  refs: usize,
  table: Arc<Table>,
}

#[derive(Default)]
struct Registry {
  by_path: HashMap<String, u32>,
  slots: HashMap<u32, Slot>,
}

pub struct Tables {
  next: AtomicU32,
  registry: Mutex<Registry>,
  cache: Mutex<Cache>,
}

impl Default for Tables {
  fn default() -> Self {
    Tables::with_budget(CACHE_BUDGET)
  }
}

impl Tables {
  pub fn with_budget(budget: usize) -> Self {
    Tables { next: AtomicU32::new(0), registry: Mutex::new(Registry::default()), cache: Mutex::new(Cache::new(budget)) }
  }

  /// Opens the table at `path`, or takes another reference to the one already open.
  pub fn open(&self, path: &str) -> Result<u32, String> {
    let mut registry = self.registry.lock().unwrap();
    if let Some(&handle) = registry.by_path.get(path) {
      registry.slots.get_mut(&handle).unwrap().refs += 1;
      return Ok(handle);
    }
    let handle = self.next.fetch_add(1, Ordering::Relaxed) + 1;
    let table = Arc::new(load_table(path, handle)?);
    registry.by_path.insert(path.to_string(), handle);
    registry.slots.insert(handle, Slot { refs: 1, table });
    Ok(handle)
  }

  /// Drops one reference; the last one closes the file and forgets its cached blocks.
  pub fn close(&self, handle: u32) {
    let mut registry = self.registry.lock().unwrap();
    let Some(slot) = registry.slots.get_mut(&handle) else { return };
    slot.refs -= 1;
    if slot.refs == 0 {
      let slot = registry.slots.remove(&handle).unwrap();
      registry.by_path.remove(&slot.table.path);
      self.cache.lock().unwrap().forget_table(handle);
    }
  }

  fn table(&self, handle: u32) -> Result<Arc<Table>, String> {
    self
      .registry
      .lock()
      .unwrap()
      .slots
      .get(&handle)
      .map(|slot| slot.table.clone())
      .ok_or_else(|| format!("EINVAL: invalid argument, table handle {handle} is not open"))
  }

  fn block(&self, table: &Table, index: usize) -> Result<Arc<Block>, String> {
    let key = (table.id, index);
    if let Some(block) = self.cache.lock().unwrap().get(key) {
      return Ok(block);
    }
    let block_ref = &table.blocks[index];
    let mut compressed = vec![0u8; block_ref.length as usize];
    read_exact_at(&table.file, &mut compressed, table.data_start + block_ref.offset, &table.path)?;
    let raw = super::zstd::decompress(&compressed, MAX_BLOCK_BYTES)
      .map_err(|e| corrupt(&table.path, &format!("block {index} does not decompress: {e}")))?;
    // Decoded outside the lock; two readers racing for one block both decode it, and the later insert wins.
    let block = Arc::new(decode_block(raw, block_ref.count, &table.path)?);
    self.cache.lock().unwrap().insert(key, block.clone());
    Ok(block)
  }

  /// The value of each key, None for a key the table lacks.
  pub fn get_many(&self, handle: u32, keys: &[String]) -> Result<Vec<Option<String>>, String> {
    let table = self.table(handle)?;
    let mut out = vec![None; keys.len()];
    // Grouped by block so each block is fetched once, however the keys are ordered.
    let mut wanted: Vec<(usize, usize)> = keys
      .iter()
      .enumerate()
      .filter_map(|(i, key)| block_for(&table.blocks, key.as_bytes()).map(|block| (block, i)))
      .collect();
    wanted.sort_unstable();
    let mut at = 0;
    while at < wanted.len() {
      let index = wanted[at].0;
      let block = self.block(&table, index)?;
      while at < wanted.len() && wanted[at].0 == index {
        let i = wanted[at].1;
        let key = keys[i].as_bytes();
        let position = block.lower_bound(key);
        if position < block.entries.len() && block.key(position) == key {
          out[i] = Some(text(block.value(position), &table.path)?);
        }
        at += 1;
      }
    }
    Ok(out)
  }

  /// Values of the keys in [gte, lt), in key order; `limit` < 0 means all, 0 means none.
  pub fn values(&self, handle: u32, gte: Option<&str>, lt: Option<&str>, limit: i64) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    if limit == 0 {
      return Ok(out);
    }
    let table = self.table(handle)?;
    let lower = gte.map(str::as_bytes);
    let upper = lt.map(str::as_bytes);
    let first = lower.and_then(|key| block_for(&table.blocks, key)).unwrap_or(0);
    for index in first..table.blocks.len() {
      // The next block starts at or past the upper bound: nothing more to read.
      if upper.is_some_and(|end| table.blocks[index].first.as_slice() >= end) {
        break;
      }
      let block = self.block(&table, index)?;
      for position in lower.map_or(0, |key| block.lower_bound(key))..block.entries.len() {
        if upper.is_some_and(|end| block.key(position) >= end) {
          return Ok(out);
        }
        out.push(text(block.value(position), &table.path)?);
        if limit > 0 && out.len() as i64 >= limit {
          return Ok(out);
        }
      }
    }
    Ok(out)
  }

  #[cfg(test)]
  fn open_count(&self) -> usize {
    self.registry.lock().unwrap().slots.len()
  }

  #[cfg(test)]
  fn cached(&self) -> (usize, usize) {
    let cache = self.cache.lock().unwrap();
    (cache.map.len(), cache.bytes)
  }
}

#[tauri::command]
pub async fn table_open(tables: tauri::State<'_, Tables>, path: String) -> Result<u32, String> {
  tables.open(&path)
}

#[tauri::command]
pub async fn table_close(tables: tauri::State<'_, Tables>, handle: u32) -> Result<(), String> {
  tables.close(handle);
  Ok(())
}

#[tauri::command]
pub async fn table_get_many(
  tables: tauri::State<'_, Tables>,
  handle: u32,
  keys: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
  tables.get_many(handle, &keys)
}

#[tauri::command]
pub async fn table_values(
  tables: tauri::State<'_, Tables>,
  handle: u32,
  gte: Option<String>,
  lt: Option<String>,
  limit: i64,
) -> Result<Vec<String>, String> {
  tables.values(handle, gte.as_deref(), lt.as_deref(), limit)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::sys::fs::tests::tmp;

  /// Writes a table the way scripts/data/writeTable.ts does: sorted by key bytes, blocks closed once
  /// they hold `block_bytes` of raw data, one zstd frame each.
  fn table_bytes(entries: &[(&str, &str)], block_bytes: usize) -> Vec<u8> {
    let mut sorted: Vec<(&str, &str)> = entries.to_vec();
    sorted.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    let mut refs: Vec<Value> = Vec::new();
    let mut frames: Vec<u8> = Vec::new();
    let mut pending: Vec<(&str, &str)> = Vec::new();
    let mut pending_bytes = 0;
    let mut flush = |pending: &mut Vec<(&str, &str)>, pending_bytes: &mut usize| {
      if pending.is_empty() {
        return;
      }
      let mut raw = Vec::new();
      for (key, value) in pending.iter() {
        raw.extend((key.len() as u32).to_le_bytes());
        raw.extend(key.as_bytes());
        raw.extend((value.len() as u32).to_le_bytes());
        raw.extend(value.as_bytes());
      }
      let frame = zstd::encode_all(&raw[..], 3).unwrap();
      refs.push(serde_json::json!([pending[0].0, frames.len(), frame.len(), pending.len()]));
      frames.extend(frame);
      pending.clear();
      *pending_bytes = 0;
    };
    for entry in &sorted {
      pending.push(*entry);
      pending_bytes += 8 + entry.0.len() + entry.1.len();
      if pending_bytes >= block_bytes {
        flush(&mut pending, &mut pending_bytes);
      }
    }
    flush(&mut pending, &mut pending_bytes);
    assemble(&serde_json::json!({
      "format": 2, "dataset": "test/table", "version": "1", "codec": "text", "compression": "zstd",
      "source": {"name": "Test", "url": "https://example.test/", "license": "CC0"},
      "entries": sorted.len(), "blocks": refs
    }), &frames)
  }

  fn assemble(header: &Value, frames: &[u8]) -> Vec<u8> {
    let header = serde_json::to_vec(header).unwrap();
    let mut out = MAGIC.to_vec();
    out.extend((header.len() as u32).to_le_bytes());
    out.extend(header);
    out.extend(frames);
    out
  }

  fn write(name: &str, bytes: &[u8]) -> String {
    let path = tmp(name).join("t.pack");
    std::fs::write(&path, bytes).unwrap();
    path.to_string_lossy().into_owned()
  }

  /// 300 entries, a few of which sort differently as UTF-8 bytes than as UTF-16 code units.
  fn many() -> Vec<(String, String)> {
    let mut keys: Vec<String> = ["z", "é", "日", "a", "ab", "b", "😀", "\u{ffff}", ""].iter().map(|k| k.to_string()).collect();
    keys.extend((0..291).map(|i| format!("k{i:04}")));
    keys.iter().enumerate().map(|(i, k)| (k.clone(), format!("value of {k} {}", "x".repeat(i % 50)))).collect()
  }

  fn borrowed(entries: &[(String, String)]) -> Vec<(&str, &str)> {
    entries.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect()
  }

  fn sorted_keys(entries: &[(String, String)]) -> Vec<String> {
    let mut keys: Vec<String> = entries.iter().map(|e| e.0.clone()).collect();
    keys.sort_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
    keys
  }

  fn open_many(name: &str) -> (Tables, u32, Vec<(String, String)>) {
    let entries = many();
    let tables = Tables::default();
    let handle = tables.open(&write(name, &table_bytes(&borrowed(&entries), 600))).unwrap();
    (tables, handle, entries)
  }

  #[test]
  fn get_many_reads_across_blocks_and_skips_missing_keys() {
    let (tables, handle, entries) = open_many("table-get");
    assert!(tables.table(handle).unwrap().blocks.len() > 5);
    let mut keys: Vec<String> = entries.iter().map(|e| e.0.clone()).collect();
    keys.reverse();
    let got = tables.get_many(handle, &keys).unwrap();
    for (key, value) in keys.iter().zip(&got) {
      let expected = &entries.iter().find(|e| &e.0 == key).unwrap().1;
      assert_eq!(value.as_ref(), Some(expected), "{key}");
    }
    // Before the table, between keys, after the table, and a key whose block exists but lacks it.
    let missing: Vec<String> = ["", "\u{0}", "aa", "k0001x", "k9999", "\u{10ffff}"].iter().map(|k| k.to_string()).collect();
    let got = tables.get_many(handle, &missing).unwrap();
    assert_eq!(got[0].as_deref(), Some(entries.iter().find(|e| e.0.is_empty()).unwrap().1.as_str()));
    assert!(got[1..].iter().all(Option::is_none), "{got:?}");
    assert_eq!(tables.get_many(handle, &[]).unwrap(), Vec::<Option<String>>::new());
    // Repeated keys each get an answer, in the order asked.
    let twice = tables.get_many(handle, &["b".to_string(), "nope".to_string(), "b".to_string()]).unwrap();
    assert_eq!(twice[0], twice[2]);
    assert!(twice[0].is_some() && twice[1].is_none());
  }

  #[test]
  fn keys_sort_by_utf8_bytes() {
    let (tables, handle, entries) = open_many("table-order");
    let all = tables.values(handle, None, None, -1).unwrap();
    let expected: Vec<String> = sorted_keys(&entries)
      .iter()
      .map(|k| entries.iter().find(|e| &e.0 == k).unwrap().1.clone())
      .collect();
    assert_eq!(all, expected);
    // "z" < "é" < "日" as bytes, and U+FFFF sorts before U+1F600 although it is the larger code unit.
    let bytes = tables.values(handle, Some("z"), Some("\u{10ffff}"), -1).unwrap();
    let order: Vec<&str> = bytes.iter().map(|v| v.split(' ').nth(2).unwrap()).collect();
    assert_eq!(order, ["z", "é", "日", "\u{ffff}", "😀"]);
  }

  #[test]
  fn values_honor_bounds_and_limits() {
    let (tables, handle, _) = open_many("table-values");
    let ids = |values: Vec<String>| values.iter().map(|v| v.split(' ').nth(2).unwrap().to_string()).collect::<Vec<_>>();
    let all = ids(tables.values(handle, Some("k0010"), Some("k0015"), -1).unwrap());
    assert_eq!(all, ["k0010", "k0011", "k0012", "k0013", "k0014"]);
    assert_eq!(ids(tables.values(handle, Some("k0010"), Some("k0015"), 2).unwrap()), ["k0010", "k0011"]);
    assert_eq!(tables.values(handle, Some("k0010"), Some("k0015"), 0).unwrap(), Vec::<String>::new());
    assert_eq!(tables.values(handle, None, None, 0).unwrap().len(), 0);
    assert_eq!(tables.values(handle, None, None, -1).unwrap().len(), 300);
    assert_eq!(tables.values(handle, None, None, -5).unwrap().len(), 300);
    assert_eq!(tables.values(handle, None, None, 7).unwrap().len(), 7);
    // A bound that is not a key, an empty range, a range past the end, and a range before the start.
    assert_eq!(ids(tables.values(handle, Some("k0289x"), Some("l"), -1).unwrap()), ["k0290"]);
    assert!(tables.values(handle, Some("k0015"), Some("k0015"), -1).unwrap().is_empty());
    assert!(tables.values(handle, Some("k0020"), Some("k0010"), -1).unwrap().is_empty());
    assert!(tables.values(handle, Some("\u{10ffff}"), None, -1).unwrap().is_empty());
    assert_eq!(tables.values(handle, None, Some("a"), -1).unwrap().len(), 1); // the empty key
    // The prefix form the dictionaries use: [prefix, prefix + U+10FFFF).
    let prefixed = tables.values(handle, Some("k00"), Some("k00\u{10ffff}"), -1).unwrap();
    assert_eq!(prefixed.len(), 100);
  }

  #[test]
  fn small_budget_still_answers_and_evicts() {
    let entries = many();
    let path = write("table-budget", &table_bytes(&borrowed(&entries), 600));
    let tables = Tables::with_budget(2000);
    let handle = tables.open(&path).unwrap();
    for _ in 0..3 {
      assert_eq!(tables.values(handle, None, None, -1).unwrap().len(), 300);
    }
    let (blocks, bytes) = tables.cached();
    assert!(blocks >= 1 && blocks < tables.table(handle).unwrap().blocks.len());
    // Over the budget only by the one block that was just read.
    assert!(blocks == 1 || bytes <= 2000, "{blocks} blocks, {bytes} bytes");
    tables.close(handle);
    assert_eq!(tables.cached(), (0, 0));
  }

  #[test]
  fn handles_are_reference_counted_per_path() {
    let entries = many();
    let path = write("table-refs", &table_bytes(&borrowed(&entries), 600));
    let tables = Tables::default();
    let first = tables.open(&path).unwrap();
    let second = tables.open(&path).unwrap();
    assert_eq!(first, second);
    assert_eq!(tables.open_count(), 1);
    tables.get_many(first, &["a".to_string()]).unwrap();
    tables.close(first);
    assert_eq!(tables.get_many(second, &["a".to_string()]).unwrap().len(), 1);
    tables.close(second);
    assert_eq!(tables.open_count(), 0);
    assert!(tables.get_many(first, &["a".to_string()]).unwrap_err().contains("not open"));
    assert!(tables.values(first, None, None, -1).unwrap_err().contains("not open"));
    tables.close(first); // closing again is harmless
    // Reopening gives a fresh handle that works.
    let third = tables.open(&path).unwrap();
    assert_ne!(third, first);
    assert!(tables.get_many(third, &["a".to_string()]).unwrap()[0].is_some());
  }

  #[test]
  fn a_missing_file_is_enoent_and_is_not_remembered() {
    let tables = Tables::default();
    let path = tmp("table-missing").join("nope.pack").to_string_lossy().into_owned();
    assert!(tables.open(&path).unwrap_err().starts_with("ENOENT"));
    assert_eq!(tables.open_count(), 0);
    std::fs::write(&path, table_bytes(&[("a", "1")], 100)).unwrap();
    let handle = tables.open(&path).unwrap();
    assert_eq!(tables.get_many(handle, &["a".to_string()]).unwrap(), vec![Some("1".to_string())]);
  }

  fn open_error(name: &str, bytes: &[u8]) -> String {
    Tables::default().open(&write(name, bytes)).unwrap_err()
  }

  #[test]
  fn corrupt_and_truncated_files_are_refused() {
    let entries = many();
    let good = table_bytes(&borrowed(&entries), 600);
    assert!(open_error("table-short", b"MTRPACK").contains("too short"));
    assert!(open_error("table-empty", b"").contains("too short"));
    let mut bad_magic = good.clone();
    bad_magic[0] = b'X';
    assert!(open_error("table-magic", &bad_magic).contains("bad magic"));
    let mut long_header = good.clone();
    long_header[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(open_error("table-header-length", &long_header).contains("does not fit"));
    let mut garbled = good.clone();
    garbled[20] = 0xff;
    assert!(open_error("table-garbled", &garbled).contains("unreadable header"));
    // Truncated inside the data: a block now lies outside the file.
    assert!(open_error("table-truncated", &good[..good.len() - 10]).contains("outside the file"));
    // Truncated inside the header.
    assert!(open_error("table-cut-header", &good[..30]).contains("does not fit"));
  }

  fn header_of(bytes: &[u8]) -> (Value, Vec<u8>) {
    let length = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    (serde_json::from_slice(&bytes[12..12 + length]).unwrap(), bytes[12 + length..].to_vec())
  }

  #[test]
  fn header_rules_are_enforced() {
    let good = table_bytes(&[("a", "1"), ("b", "2"), ("c", "3"), ("d", "4")], 20);
    let (header, frames) = header_of(&good);
    assert!(header["blocks"].as_array().unwrap().len() >= 2);
    let reject = |name: &str, edit: &dyn Fn(&mut Value), why: &str| {
      let mut changed = header.clone();
      edit(&mut changed);
      let error = open_error(name, &assemble(&changed, &frames));
      assert!(error.contains(why), "{name}: {error}");
    };
    reject("h-format", &|h| h["format"] = 3.into(), "unsupported format");
    reject("h-compression", &|h| h["compression"] = "gzip".into(), "unsupported compression");
    reject("h-dataset", &|h| { h.as_object_mut().unwrap().remove("dataset"); }, "no dataset");
    reject("h-entries", &|h| h["entries"] = 99.into(), "do not add up");
    reject("h-blocks", &|h| h["blocks"] = "none".into(), "no block list");
    reject("h-block-shape", &|h| h["blocks"][0] = serde_json::json!(["a", 0, 1]), "bad block 0");
    reject("h-block-empty", &|h| h["blocks"][0][3] = 0.into(), "bad block 0");
    reject("h-block-outside", &|h| h["blocks"][0][2] = 1_000_000.into(), "outside the file");
    reject("h-block-order", &|h| h["blocks"][1][0] = "a".into(), "out of order");
  }

  #[test]
  fn a_damaged_block_fails_the_read_not_the_open() {
    let entries = many();
    let good = table_bytes(&borrowed(&entries), 600);
    let (header, mut frames) = header_of(&good);
    // Spoil the zstd frame header of block 2 only.
    let offset = header["blocks"][2][1].as_u64().unwrap() as usize;
    for byte in &mut frames[offset..offset + 4] {
      *byte ^= 0xff;
    }
    let tables = Tables::default();
    let handle = tables.open(&write("table-damaged", &assemble(&header, &frames))).unwrap();
    assert!(tables.values(handle, None, None, -1).is_err());
    let first_key = header["blocks"][0][0].as_str().unwrap().to_string();
    assert!(tables.get_many(handle, &[first_key]).unwrap()[0].is_some(), "other blocks still read");

    // A header whose entry count for a block disagrees with the block's contents.
    let (mut header, frames) = header_of(&good);
    let count = header["blocks"][0][3].as_u64().unwrap();
    header["blocks"][0][3] = (count + 1).into();
    header["blocks"][1][3] = (header["blocks"][1][3].as_u64().unwrap() - 1).into();
    let handle = tables.open(&write("table-counts", &assemble(&header, &frames))).unwrap();
    let error = tables.values(handle, None, None, -1).unwrap_err();
    assert!(error.contains("entries, not"), "{error}");
  }

  /// The table both readers test against: tests/fixtures/dictionary-fixture.pack, written by
  /// scripts/data/writeTable.ts. tests/dataTable.test.ts reads the same file with the same entries.
  #[test]
  fn reads_the_fixture_written_by_the_js_writer() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../tests/fixtures/dictionary-fixture.pack");
    let tables = Tables::default();
    let handle = tables.open(path).unwrap();
    assert!(tables.table(handle).unwrap().blocks.len() >= 3);
    let expected: Vec<(&str, &str)> = vec![
      ("", "empty key"),
      ("a", "first"),
      ("ab", "second"),
      ("empty", ""),
      ("indexes/kana/なる-1", "1"),
      ("indexes/kana/なる-2", "2"),
      ("indexes/kanji/成る-1", "1"),
      ("raw/words/1", "{\"id\":\"1\",\"kanji\":[{\"text\":\"成る\"}]}"),
      ("z", "last ascii"),
      ("é", "accented"),
      ("日", "han"),
      ("😀", "astral"),
    ];
    let keys: Vec<String> = expected.iter().map(|e| e.0.to_string()).collect();
    let got = tables.get_many(handle, &keys).unwrap();
    for ((key, value), got) in expected.iter().zip(&got) {
      assert_eq!(got.as_deref(), Some(*value), "{key}");
    }
    let all = tables.values(handle, None, None, -1).unwrap();
    assert_eq!(all, expected.iter().map(|e| e.1.to_string()).collect::<Vec<_>>());
    assert_eq!(tables.values(handle, Some("indexes/kana/"), Some("indexes/kana/\u{10ffff}"), -1).unwrap(), ["1", "2"]);
    assert_eq!(tables.values(handle, Some("indexes/"), Some("indexes/\u{10ffff}"), 2).unwrap(), ["1", "2"]);
    assert_eq!(tables.get_many(handle, &["nope".to_string()]).unwrap(), vec![None]);
  }
}
