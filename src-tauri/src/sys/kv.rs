use rusqlite::{params_from_iter, types::Value, Connection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID";

fn db_err(e: rusqlite::Error) -> String {
  format!("EIO: i/o error, kv: {e}")
}

#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct RangeOpts {
  pub gt: Option<String>,
  pub gte: Option<String>,
  pub lt: Option<String>,
  pub lte: Option<String>,
  pub limit: Option<i64>,
  pub reverse: Option<bool>,
  pub keys: Option<bool>,
  pub values: Option<bool>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchOp {
  #[serde(rename = "type")]
  pub kind: String,
  pub key: String,
  pub value: Option<String>,
}

pub type Row = (Option<String>, Option<String>);

fn sqlite_path(location: &str) -> PathBuf {
  PathBuf::from(format!("{location}.sqlite3"))
}

fn configure(conn: &Connection) -> rusqlite::Result<()> {
  conn.pragma_update(None, "journal_mode", "WAL")?;
  conn.pragma_update(None, "synchronous", "NORMAL")?;
  conn.execute_batch(SCHEMA)
}

// ---- LevelDB import ------------------------------------------------------------------------

fn copy_dir_files(from: &Path, to: &Path) -> std::io::Result<()> {
  std::fs::create_dir_all(to)?;
  for entry in std::fs::read_dir(from)? {
    let entry = entry?;
    // LOCK is left behind; LOG files are not needed either.
    let name = entry.file_name();
    if entry.file_type()?.is_file() && name != "LOCK" {
      std::fs::copy(entry.path(), to.join(&name))?;
    }
  }
  Ok(())
}

/// Reads every entry of the LevelDB at `dir`. The directory is copied to a scratch folder first:
/// opening a LevelDB writes to it (new log and manifest), and the original must stay untouched.
pub fn read_leveldb(dir: &Path) -> Result<Vec<(String, String)>, String> {
  use rusty_leveldb::{LdbIterator, Options, DB};
  let scratch = std::env::temp_dir().join(format!(
    "miteiru-ldb-import-{}-{}",
    std::process::id(),
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_nanos())
      .unwrap_or(0)
  ));
  let result = (|| {
    copy_dir_files(dir, &scratch).map_err(|e| format!("EIO: i/o error, copy leveldb: {e}"))?;
    let mut opts = Options::default();
    opts.create_if_missing = false;
    let mut db = DB::open(&scratch, opts).map_err(|e| format!("EIO: i/o error, open leveldb: {e}"))?;
    let mut it = db.new_iter().map_err(|e| format!("EIO: i/o error, leveldb iterator: {e}"))?;
    let mut rows = Vec::new();
    let (mut k, mut v) = (Vec::new(), Vec::new());
    while it.advance() {
      if !it.current(&mut k, &mut v) {
        break;
      }
      rows.push((String::from_utf8_lossy(&k).into_owned(), String::from_utf8_lossy(&v).into_owned()));
    }
    drop(it);
    drop(db);
    Ok(rows)
  })();
  let _ = std::fs::remove_dir_all(&scratch);
  result
}

/// One-time import: a LevelDB directory at `location` and no `<location>.sqlite3` yet.
/// Written to a temp file and renamed so an interrupted import is simply redone.
fn import_leveldb_if_needed(location: &str) -> Result<(), String> {
  let dir = Path::new(location);
  let target = sqlite_path(location);
  if target.exists() || !dir.is_dir() || !dir.join("CURRENT").is_file() {
    return Ok(());
  }
  let rows = read_leveldb(dir)?;
  let tmp = PathBuf::from(format!("{location}.sqlite3.importing"));
  for suffix in ["", "-wal", "-shm", "-journal"] {
    let _ = std::fs::remove_file(format!("{}{suffix}", tmp.display()));
  }
  let done = (|| -> rusqlite::Result<()> {
    let mut conn = Connection::open(&tmp)?;
    conn.execute_batch(SCHEMA)?;
    let tx = conn.transaction()?;
    {
      let mut stmt = tx.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)")?;
      for (k, v) in &rows {
        stmt.execute([k, v])?;
      }
    }
    tx.commit()?;
    conn.close().map_err(|(_, e)| e)
  })();
  if let Err(e) = done {
    let _ = std::fs::remove_file(&tmp);
    return Err(db_err(e));
  }
  std::fs::rename(&tmp, &target).map_err(|e| super::fs_err(&e, "rename", &tmp.to_string_lossy()))
}

pub fn open_db(location: &str) -> Result<Connection, String> {
  import_leveldb_if_needed(location)?;
  let path = sqlite_path(location);
  if let Some(parent) = path.parent() {
    let _ = std::fs::create_dir_all(parent);
  }
  let conn = Connection::open(&path).map_err(db_err)?;
  configure(&conn).map_err(db_err)?;
  Ok(conn)
}

// ---- Plain operations on a connection --------------------------------------------------------

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, String> {
  match conn.query_row("SELECT value FROM kv WHERE key = ?1", [key], |r| r.get(0)) {
    Ok(v) => Ok(Some(v)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(e) => Err(db_err(e)),
  }
}

pub fn get_many(conn: &Connection, keys: &[String]) -> Result<Vec<Option<String>>, String> {
  keys.iter().map(|k| get(conn, k)).collect()
}

pub fn put(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
  conn
    .execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)", [key, value])
    .map(|_| ())
    .map_err(db_err)
}

pub fn del(conn: &Connection, key: &str) -> Result<(), String> {
  conn.execute("DELETE FROM kv WHERE key = ?1", [key]).map(|_| ()).map_err(db_err)
}

pub fn batch(conn: &mut Connection, ops: &[BatchOp]) -> Result<(), String> {
  // Validate first so a bad op never leaves a half-applied batch.
  for op in ops {
    match op.kind.as_str() {
      "put" if op.value.is_some() => {}
      "del" => {}
      "put" => return Err(format!("EINVAL: invalid argument, kv batch put without value for '{}'", op.key)),
      other => return Err(format!("EINVAL: invalid argument, kv batch op '{other}'")),
    }
  }
  let tx = conn.transaction().map_err(db_err)?;
  {
    // Prepared once per batch: a dictionary import sends hundreds of thousands of puts.
    let mut put = tx.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)").map_err(db_err)?;
    let mut del = tx.prepare("DELETE FROM kv WHERE key = ?1").map_err(db_err)?;
    for op in ops {
      match (op.kind.as_str(), &op.value) {
        ("put", Some(v)) => put.execute([&op.key, v]).map(|_| ()).map_err(db_err)?,
        _ => del.execute([&op.key]).map(|_| ()).map_err(db_err)?,
      }
    }
  }
  tx.commit().map_err(db_err)
}

/// Bulk mode, for building a dictionary database from scratch: a 64 MB page cache, and no WAL
/// checkpoint after every batch (a JMdict import goes from about 19 s to under 5 s). Turning it
/// off checkpoints once and restores the defaults that every other write uses.
pub fn set_bulk(conn: &Connection, on: bool) -> Result<(), String> {
  let sql = if on {
    "PRAGMA cache_size = -65536; PRAGMA wal_autocheckpoint = 0;"
  } else {
    "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA wal_autocheckpoint = 1000; PRAGMA cache_size = -2000;"
  };
  conn.execute_batch(sql).map_err(db_err)
}

fn where_clause(o: &RangeOpts) -> (String, Vec<Value>) {
  let mut parts = Vec::new();
  let mut args = Vec::new();
  for (col_op, bound) in [(">", &o.gt), (">=", &o.gte), ("<", &o.lt), ("<=", &o.lte)] {
    if let Some(b) = bound {
      args.push(Value::Text(b.clone()));
      parts.push(format!("key {col_op} ?{}", args.len()));
    }
  }
  let sql = if parts.is_empty() { String::new() } else { format!(" WHERE {}", parts.join(" AND ")) };
  (sql, args)
}

pub fn range(conn: &Connection, o: &RangeOpts) -> Result<Vec<Row>, String> {
  let want_keys = o.keys.unwrap_or(true);
  let want_values = o.values.unwrap_or(true);
  let (wh, mut args) = where_clause(o);
  let order = if o.reverse.unwrap_or(false) { "DESC" } else { "ASC" };
  args.push(Value::Integer(o.limit.unwrap_or(-1)));
  let sql = format!(
    "SELECT {}, {} FROM kv{wh} ORDER BY key {order} LIMIT ?{}",
    if want_keys { "key" } else { "NULL" },
    if want_values { "value" } else { "NULL" },
    args.len()
  );
  let mut stmt = conn.prepare(&sql).map_err(db_err)?;
  let rows = stmt
    .query_map(params_from_iter(args), |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?)))
    .map_err(db_err)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub fn clear(conn: &Connection, o: &RangeOpts) -> Result<(), String> {
  let (wh, mut args) = where_clause(o);
  let limit = o.limit.unwrap_or(-1);
  let sql = if limit >= 0 {
    let order = if o.reverse.unwrap_or(false) { "DESC" } else { "ASC" };
    args.push(Value::Integer(limit));
    format!("DELETE FROM kv WHERE key IN (SELECT key FROM kv{wh} ORDER BY key {order} LIMIT ?{})", args.len())
  } else {
    format!("DELETE FROM kv{wh}")
  };
  conn.execute(&sql, params_from_iter(args)).map(|_| ()).map_err(db_err)
}

// ---- Registry of open handles ------------------------------------------------------------------

struct Slot {
  location: String,
  refs: usize,
  conn: Arc<Mutex<Connection>>,
}

#[derive(Default)]
struct Inner {
  by_location: HashMap<String, u32>,
  slots: HashMap<u32, Slot>,
}

#[derive(Default)]
pub struct Kv {
  next: AtomicU32,
  inner: Mutex<Inner>,
}

impl Kv {
  /// Opens (or re-references) the store for `location`.
  pub fn open(&self, location: &str) -> Result<u32, String> {
    let mut inner = self.inner.lock().unwrap();
    if let Some(&h) = inner.by_location.get(location) {
      inner.slots.get_mut(&h).unwrap().refs += 1;
      return Ok(h);
    }
    let conn = open_db(location)?;
    let h = self.next.fetch_add(1, Ordering::Relaxed) + 1;
    inner.by_location.insert(location.to_string(), h);
    inner.slots.insert(h, Slot { location: location.to_string(), refs: 1, conn: Arc::new(Mutex::new(conn)) });
    Ok(h)
  }

  pub fn close(&self, handle: u32) {
    let mut inner = self.inner.lock().unwrap();
    let Some(slot) = inner.slots.get_mut(&handle) else { return };
    slot.refs -= 1;
    if slot.refs == 0 {
      let slot = inner.slots.remove(&handle).unwrap();
      inner.by_location.remove(&slot.location);
    }
  }

  pub fn with<T>(&self, handle: u32, f: impl FnOnce(&mut Connection) -> Result<T, String>) -> Result<T, String> {
    let conn = {
      let inner = self.inner.lock().unwrap();
      inner
        .slots
        .get(&handle)
        .map(|s| s.conn.clone())
        .ok_or_else(|| format!("EINVAL: invalid argument, kv handle {handle} is not open"))?
    };
    let mut guard = conn.lock().unwrap();
    f(&mut guard)
  }

  #[cfg(test)]
  fn open_count(&self) -> usize {
    self.inner.lock().unwrap().slots.len()
  }
}

#[tauri::command]
pub async fn kv_open(kv: tauri::State<'_, Kv>, location: String) -> Result<u32, String> {
  kv.open(&location)
}

#[tauri::command]
pub async fn kv_get(kv: tauri::State<'_, Kv>, handle: u32, key: String) -> Result<Option<String>, String> {
  kv.with(handle, |c| get(c, &key))
}

#[tauri::command]
pub async fn kv_get_many(
  kv: tauri::State<'_, Kv>,
  handle: u32,
  keys: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
  kv.with(handle, |c| get_many(c, &keys))
}

#[tauri::command]
pub async fn kv_put(kv: tauri::State<'_, Kv>, handle: u32, key: String, value: String) -> Result<(), String> {
  kv.with(handle, |c| put(c, &key, &value))
}

#[tauri::command]
pub async fn kv_del(kv: tauri::State<'_, Kv>, handle: u32, key: String) -> Result<(), String> {
  kv.with(handle, |c| del(c, &key))
}

#[tauri::command]
pub async fn kv_batch(kv: tauri::State<'_, Kv>, handle: u32, ops: Vec<BatchOp>) -> Result<(), String> {
  kv.with(handle, |c| batch(c, &ops))
}

#[tauri::command]
pub async fn kv_bulk(kv: tauri::State<'_, Kv>, handle: u32, on: bool) -> Result<(), String> {
  kv.with(handle, |c| set_bulk(c, on))
}

#[tauri::command]
pub async fn kv_range(kv: tauri::State<'_, Kv>, handle: u32, opts: Option<RangeOpts>) -> Result<Vec<Row>, String> {
  let opts = opts.unwrap_or_default();
  kv.with(handle, |c| range(c, &opts))
}

#[tauri::command]
pub async fn kv_clear(kv: tauri::State<'_, Kv>, handle: u32, opts: Option<RangeOpts>) -> Result<(), String> {
  let opts = opts.unwrap_or_default();
  kv.with(handle, |c| clear(c, &opts))
}

#[tauri::command]
pub async fn kv_close(kv: tauri::State<'_, Kv>, handle: u32) -> Result<(), String> {
  kv.close(handle);
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::sys::fs::tests::tmp;

  fn mem() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    c.execute_batch(SCHEMA).unwrap();
    for k in ["a", "b", "c", "d", "e", "é", "B"] {
      put(&c, k, &format!("v-{k}")).unwrap();
    }
    c
  }

  fn keys(rows: Vec<Row>) -> Vec<String> {
    rows.into_iter().map(|r| r.0.unwrap()).collect()
  }

  fn o(f: impl FnOnce(&mut RangeOpts)) -> RangeOpts {
    let mut o = RangeOpts::default();
    f(&mut o);
    o
  }

  #[test]
  fn bounds_are_bytewise() {
    let c = mem();
    assert_eq!(keys(range(&c, &RangeOpts::default()).unwrap()), ["B", "a", "b", "c", "d", "e", "é"]);
    assert_eq!(keys(range(&c, &o(|o| o.gt = Some("b".into()))).unwrap()), ["c", "d", "e", "é"]);
    assert_eq!(keys(range(&c, &o(|o| o.gte = Some("b".into()))).unwrap()), ["b", "c", "d", "e", "é"]);
    assert_eq!(keys(range(&c, &o(|o| o.lt = Some("b".into()))).unwrap()), ["B", "a"]);
    assert_eq!(keys(range(&c, &o(|o| o.lte = Some("b".into()))).unwrap()), ["B", "a", "b"]);
    let both = o(|o| {
      o.gt = Some("a".into());
      o.lte = Some("d".into());
    });
    assert_eq!(keys(range(&c, &both).unwrap()), ["b", "c", "d"]);
  }

  #[test]
  fn limit_reverse_and_flags() {
    let c = mem();
    assert_eq!(keys(range(&c, &o(|o| o.limit = Some(2))).unwrap()), ["B", "a"]);
    assert_eq!(keys(range(&c, &o(|o| o.limit = Some(-1))).unwrap()).len(), 7);
    assert_eq!(keys(range(&c, &o(|o| o.limit = Some(0))).unwrap()).len(), 0);
    let rev = o(|o| {
      o.reverse = Some(true);
      o.limit = Some(3);
      o.lte = Some("d".into());
    });
    assert_eq!(keys(range(&c, &rev).unwrap()), ["d", "c", "b"]);
    let only_keys = range(&c, &o(|o| {
      o.values = Some(false);
      o.limit = Some(1);
    }))
    .unwrap();
    assert_eq!(only_keys, vec![(Some("B".to_string()), None)]);
    let only_values = range(&c, &o(|o| {
      o.keys = Some(false);
      o.limit = Some(1);
    }))
    .unwrap();
    assert_eq!(only_values, vec![(None, Some("v-B".to_string()))]);
  }

  #[test]
  fn clear_respects_bounds_and_limit() {
    let c = mem();
    clear(&c, &o(|o| o.gte = Some("c".into()))).unwrap();
    assert_eq!(keys(range(&c, &RangeOpts::default()).unwrap()), ["B", "a", "b"]);
    clear(&c, &o(|o| {
      o.limit = Some(1);
      o.reverse = Some(true);
    }))
    .unwrap();
    assert_eq!(keys(range(&c, &RangeOpts::default()).unwrap()), ["B", "a"]);
    clear(&c, &RangeOpts::default()).unwrap();
    assert!(range(&c, &RangeOpts::default()).unwrap().is_empty());
  }

  #[test]
  fn batch_is_atomic() {
    let mut c = mem();
    let op = |kind: &str, key: &str, value: Option<&str>| BatchOp {
      kind: kind.into(),
      key: key.into(),
      value: value.map(Into::into),
    };
    batch(&mut c, &[op("put", "x", Some("1")), op("del", "a", None)]).unwrap();
    assert_eq!(get(&c, "x").unwrap().as_deref(), Some("1"));
    assert_eq!(get(&c, "a").unwrap(), None);
    // A failing op leaves nothing applied.
    assert!(batch(&mut c, &[op("put", "y", Some("2")), op("nope", "z", None)]).is_err());
    assert_eq!(get(&c, "y").unwrap(), None);
    // A mid-transaction SQL failure rolls back too.
    c.execute_batch("CREATE TRIGGER boom BEFORE INSERT ON kv WHEN NEW.key = 'bad' BEGIN SELECT RAISE(ABORT, 'no'); END")
      .unwrap();
    assert!(batch(&mut c, &[op("put", "w", Some("3")), op("put", "bad", Some("4"))]).is_err());
    assert_eq!(get(&c, "w").unwrap(), None);
    assert_eq!(get_many(&c, &["x".into(), "nope".into()]).unwrap(), vec![Some("1".to_string()), None]);
  }

  #[test]
  fn open_close_is_refcounted() {
    let d = tmp("kv-refs");
    let loc = d.join("store").to_string_lossy().into_owned();
    let kv = Kv::default();
    let h1 = kv.open(&loc).unwrap();
    let h2 = kv.open(&loc).unwrap();
    assert_eq!(h1, h2);
    kv.with(h1, |c| put(c, "k", "v")).unwrap();
    kv.close(h1);
    assert_eq!(kv.open_count(), 1);
    assert_eq!(kv.with(h2, |c| get(c, "k")).unwrap().as_deref(), Some("v"));
    kv.close(h2);
    assert_eq!(kv.open_count(), 0);
    assert!(kv.with(h1, |c| get(c, "k")).unwrap_err().starts_with("EINVAL"));
    // Data persisted on disk, and a reopen gets a fresh handle.
    let h3 = kv.open(&loc).unwrap();
    assert_ne!(h3, h1);
    assert_eq!(kv.with(h3, |c| get(c, "k")).unwrap().as_deref(), Some("v"));
    kv.close(h3);
  }

  #[test]
  fn imports_leveldb_once_and_leaves_it_untouched() {
    use rusty_leveldb::{Options, DB};
    let d = tmp("kv-import");
    let loc = d.join("store");
    {
      let mut db = DB::open(&loc, Options::default()).unwrap();
      db.put(b"alpha", "あ".as_bytes()).unwrap();
      db.put(b"beta", b"2").unwrap();
      db.put(b"gone", b"x").unwrap();
      db.delete(b"gone").unwrap();
      for i in 0..200 {
        db.put(format!("bulk{i:03}").as_bytes(), "x".repeat(100).as_bytes()).unwrap();
      }
      db.flush().unwrap(); // force a table file (snappy-compressed blocks) besides the log
    }
    let before: Vec<_> = {
      let mut v: Vec<_> = std::fs::read_dir(&loc).unwrap().map(|e| e.unwrap().file_name()).collect();
      v.sort();
      v
    };
    let loc = loc.to_string_lossy().into_owned();
    let kv = Kv::default();
    let h = kv.open(&loc).unwrap();
    assert_eq!(kv.with(h, |c| get(c, "alpha")).unwrap().as_deref(), Some("あ"));
    assert_eq!(kv.with(h, |c| get(c, "beta")).unwrap().as_deref(), Some("2"));
    assert_eq!(kv.with(h, |c| get(c, "gone")).unwrap(), None);
    assert_eq!(kv.with(h, |c| range(c, &RangeOpts::default())).unwrap().len(), 202);
    kv.with(h, |c| put(c, "alpha", "changed")).unwrap();
    kv.close(h);
    assert!(Path::new(&format!("{loc}.sqlite3")).is_file());
    assert!(!Path::new(&format!("{loc}.sqlite3.importing")).exists());
    let after: Vec<_> = {
      let mut v: Vec<_> = std::fs::read_dir(&loc).unwrap().map(|e| e.unwrap().file_name()).collect();
      v.sort();
      v
    };
    assert_eq!(before, after);
    // The import never runs again: the SQLite edit survives a reopen.
    let h = kv.open(&loc).unwrap();
    assert_eq!(kv.with(h, |c| get(c, "alpha")).unwrap().as_deref(), Some("changed"));
    kv.close(h);
  }
  /// Writes `words` JMdict-shaped records (a ~450-byte value and three index keys each) in
  /// batches of 10k, as the dictionary import does.
  fn import_shaped(conn: &mut Connection, words: u64) {
    let word = format!("{{\"id\":\"1\",\"kanji\":[{{\"text\":\"食べる\"}}],\"gloss\":\"{}\"}}", "x".repeat(420));
    let mut ops = Vec::new();
    let mut seed: u64 = 12345;
    for id in 1_000_000..1_000_000 + words {
      ops.push(BatchOp { kind: "put".into(), key: format!("raw/words/{id}"), value: Some(word.clone()) });
      for _ in 0..3 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let reading: String = (0..4).map(|i| char::from_u32(0x3041 + ((seed >> (i * 8)) % 80) as u32).unwrap()).collect();
        ops.push(BatchOp { kind: "put".into(), key: format!("indexes/kana/{reading}-{id}"), value: Some(id.to_string()) });
      }
      if ops.len() >= 10_000 {
        batch(conn, &ops).unwrap();
        ops.clear();
      }
    }
    batch(conn, &ops).unwrap();
  }

  #[test]
  fn bulk_mode_writes_everything_and_restores_the_defaults() {
    let dir = tmp("kv-bulk");
    let loc = dir.join("db").to_string_lossy().to_string();
    let mut conn = open_db(&loc).unwrap();
    set_bulk(&conn, true).unwrap();
    import_shaped(&mut conn, 5_000);
    set_bulk(&conn, false).unwrap();
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM kv", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 20_000);
    let checkpoint: i64 = conn.query_row("PRAGMA wal_autocheckpoint", [], |r| r.get(0)).unwrap();
    assert_eq!(checkpoint, 1000);
    // Everything was checkpointed into the database file, and survives a reopen.
    let wal = std::fs::metadata(format!("{}-wal", sqlite_path(&loc).display())).map(|m| m.len()).unwrap_or(0);
    assert_eq!(wal, 0);
    drop(conn);
    let conn = open_db(&loc).unwrap();
    assert!(get(&conn, "raw/words/1004999").unwrap().is_some());
  }

  /// A JMdict-sized import, timed with and without bulk mode:
  /// cargo test --release --lib import_shaped_timing -- --ignored --nocapture
  #[test]
  #[ignore]
  fn import_shaped_timing() {
    for bulk in [false, true] {
      let dir = tmp("kv-bench");
      let loc = dir.join("jmdict-db").to_string_lossy().to_string();
      let mut conn = open_db(&loc).unwrap();
      let started = std::time::Instant::now();
      if bulk {
        set_bulk(&conn, true).unwrap();
      }
      import_shaped(&mut conn, 210_000);
      if bulk {
        set_bulk(&conn, false).unwrap();
      }
      eprintln!("bulk mode {bulk}: {:?} for 840k keys", started.elapsed());
      drop(conn);
      let _ = std::fs::remove_dir_all(&dir);
    }
  }
}

