//! On-demand language packs (docs/DATA_FORMAT.md, "Language packs"). A release carries
//! `language-packs.json` instead of the language data; each language's data is one MTRPACK2 file
//! (codec `file`: key = a path under language-assets/, value = the file's bytes) that the app downloads
//! the first time the language is used, checks against the manifest and unpacks under the app's local
//! data folder. The backend worker then reads `<install dir>/language-assets` as one more asset root.
//!
//! Install layout, under `<root>` (`$MITEIRU_USER_DATA_DIR/language-packs`, else the local app data
//! folder; never the roaming one, never the install folder):
//!   `<id>-<sha12>-<unix seconds>/`  `language-assets/...`, and `pack.json` written last: a folder
//!                                   without it is not an install
//!   `.downloads/<file>.part`        a download in progress
//!   `.partial-<id>-<nanos>/`        an unpacking in progress; renamed into place when whole
//!
//! The commands and errors are the contract the page codes against: every struct is camelCase and an
//! error is the string "<CODE>: <detail>" (ENOMANIFEST, EUNKNOWN, EBUSY, ENETWORK, EHTTP <status>,
//! ESIZE, ECHECKSUM, EVERSION, EBADPACK, ECANCELED, EIO).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tauri_plugin_http::reqwest;

const MANIFEST_FILE: &str = "language-packs.json";
const PACK_JSON: &str = "pack.json";
const ASSETS_DIR: &str = "language-assets";
const DOWNLOADS_DIR: &str = ".downloads";
const PARTIAL_PREFIX: &str = ".partial-";
const MAGIC: &[u8; 8] = b"MTRPACK2";
const PREAMBLE_BYTES: u64 = 12;
const DATASET_PREFIX: &str = "language-pack/";
/// A block is about 1 MB, or one larger file; this only stops a corrupt block from filling memory.
const MAX_BLOCK_BYTES: u64 = 256 * 1024 * 1024;
const MAX_KEY_BYTES: usize = 512;
const PROGRESS_EVERY: Duration = Duration::from_millis(100);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(60);

// ---- Contract types ------------------------------------------------------------------------

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum PackState {
  Bundled,
  Installed,
  Outdated,
  Missing,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LanguagePack {
  pub id: String,
  pub title: String,
  pub file: String,
  pub bytes: u64,
  pub sha256: String,
  pub plugins: Vec<String>,
  pub languages: Vec<String>,
  pub state: PackState,
  pub dir: Option<String>,
  pub installed_sha256: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LanguagePackStatus {
  pub manifest_found: bool,
  pub root: String,
  pub base_url: String,
  pub app_version: String,
  pub packs: Vec<LanguagePack>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LanguagePackProgress {
  pub id: String,
  pub phase: &'static str,
  pub done: u64,
  pub total: u64,
}

// ---- The manifest and what is installed ----------------------------------------------------

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct ManifestPack {
  id: String,
  title: String,
  file: String,
  bytes: u64,
  sha256: String,
  plugins: Vec<String>,
  languages: Vec<String>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Manifest {
  app_version: String,
  base_url: String,
  packs: Vec<ManifestPack>,
}

/// `pack.json`: what an install folder holds.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct PackInfo {
  id: String,
  sha256: String,
  bytes: u64,
  version: String,
  installed_at: u64,
}

struct Installed {
  dir: PathBuf,
  info: PackInfo,
}

#[derive(Clone)]
struct Env {
  /// Where packs are installed.
  root: PathBuf,
  /// The resource folder: language-packs.json, and language-assets/ in a full build.
  resources: PathBuf,
}

fn err(code: &str, detail: impl std::fmt::Display) -> String {
  format!("{code}: {detail}")
}

fn io_err(e: &std::io::Error, action: &str, path: &Path) -> String {
  super::fs_err(e, action, &path.to_string_lossy())
}

/// `$MITEIRU_USER_DATA_DIR/language-packs`, else `<local app data>/language-packs`.
pub fn root_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  if let Some(dir) = std::env::var_os("MITEIRU_USER_DATA_DIR").filter(|v| !v.is_empty()) {
    return Ok(PathBuf::from(dir).join("language-packs"));
  }
  let base = app.path().app_local_data_dir().map_err(|e| err("EIO", format!("no local data folder: {e}")))?;
  Ok(base.join("language-packs"))
}

fn env_of(app: &tauri::AppHandle) -> Result<Env, String> {
  Ok(Env { root: root_dir(app)?, resources: app.path().resource_dir().unwrap_or_default() })
}

fn read_manifest(resources: &Path) -> Option<Manifest> {
  let text = fs::read_to_string(resources.join(MANIFEST_FILE)).ok()?;
  match serde_json::from_str::<Manifest>(&text) {
    Ok(manifest) => Some(manifest),
    Err(e) => {
      log::warn!("langpack: {MANIFEST_FILE} is unreadable: {e}");
      None
    }
  }
}

fn require_manifest(env: &Env) -> Result<Manifest, String> {
  read_manifest(&env.resources).ok_or_else(|| err("ENOMANIFEST", "this build has no language-packs.json"))
}

fn base_url(manifest: Option<&Manifest>) -> String {
  let from_env = std::env::var("MITEIRU_LANGUAGE_PACK_URL").ok().filter(|v| !v.trim().is_empty());
  let mut url = from_env.or_else(|| manifest.map(|m| m.base_url.clone())).unwrap_or_default();
  if !url.is_empty() && !url.ends_with('/') {
    url.push('/');
  }
  url
}

/// The install folder's pack.json, when the folder is a whole install.
fn read_install(dir: &Path) -> Option<PackInfo> {
  let info: PackInfo = serde_json::from_slice(&fs::read(dir.join(PACK_JSON)).ok()?).ok()?;
  (!info.id.is_empty() && dir.join(ASSETS_DIR).is_dir()).then_some(info)
}

/// Every install folder under the root that has a valid pack.json.
fn installs(root: &Path) -> Vec<Installed> {
  let Ok(entries) = fs::read_dir(root) else { return Vec::new() };
  entries
    .flatten()
    .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
    .filter_map(|entry| {
      let dir = entry.path();
      read_install(&dir).map(|info| Installed { dir, info })
    })
    .collect()
}

/// The newest install of a pack: the latest `installedAt`, the folder name breaking a tie.
fn newest_install(root: &Path, id: &str) -> Option<Installed> {
  installs(root).into_iter().filter(|i| i.info.id == id).max_by(|a, b| {
    (a.info.installed_at, a.dir.file_name()).cmp(&(b.info.installed_at, b.dir.file_name()))
  })
}

/// A full build carries the pack's data itself: every plugin folder is in the resources.
fn is_bundled(env: &Env, pack: &ManifestPack) -> bool {
  !pack.plugins.is_empty()
    && pack.plugins.iter().all(|plugin| env.resources.join(ASSETS_DIR).join(plugin).join("asset-manifest.json").is_file())
}

fn view(env: &Env, pack: &ManifestPack) -> LanguagePack {
  let (state, dir, installed_sha256) = if is_bundled(env, pack) {
    (PackState::Bundled, None, None)
  } else if let Some(found) = newest_install(&env.root, &pack.id) {
    let state = if found.info.sha256 == pack.sha256 { PackState::Installed } else { PackState::Outdated };
    (state, Some(found.dir.to_string_lossy().into_owned()), Some(found.info.sha256))
  } else {
    (PackState::Missing, None, None)
  };
  LanguagePack {
    id: pack.id.clone(),
    title: pack.title.clone(),
    file: pack.file.clone(),
    bytes: pack.bytes,
    sha256: pack.sha256.clone(),
    plugins: pack.plugins.clone(),
    languages: pack.languages.clone(),
    state,
    dir,
    installed_sha256,
  }
}

fn status_of(env: &Env, app_version: &str) -> LanguagePackStatus {
  let manifest = read_manifest(&env.resources);
  LanguagePackStatus {
    manifest_found: manifest.is_some(),
    root: env.root.to_string_lossy().into_owned(),
    base_url: base_url(manifest.as_ref()),
    app_version: manifest.as_ref().map_or_else(|| app_version.to_string(), |m| m.app_version.clone()),
    packs: manifest.as_ref().map_or_else(Vec::new, |m| m.packs.iter().map(|p| view(env, p)).collect()),
  }
}

// ---- Progress ------------------------------------------------------------------------------

/// Sends progress to the page at most every 100 ms; the last event of a phase (done == total) always goes.
#[derive(Clone)]
struct Reporter {
  sink: Arc<dyn Fn(LanguagePackProgress) + Send + Sync>,
  last: Arc<Mutex<Option<Instant>>>,
}

impl Reporter {
  fn new(sink: impl Fn(LanguagePackProgress) + Send + Sync + 'static) -> Self {
    Reporter { sink: Arc::new(sink), last: Arc::new(Mutex::new(None)) }
  }

  fn channel(channel: Channel<LanguagePackProgress>) -> Self {
    Reporter::new(move |progress| {
      let _ = channel.send(progress);
    })
  }

  fn report(&self, id: &str, phase: &'static str, done: u64, total: u64) {
    let mut last = self.last.lock().unwrap();
    let now = Instant::now();
    if done < total && (*last).is_some_and(|t| now.duration_since(t) < PROGRESS_EVERY) {
      return;
    }
    *last = Some(now);
    drop(last);
    (self.sink)(LanguagePackProgress { id: id.to_string(), phase, done, total });
  }
}

// ---- Which installs are running ------------------------------------------------------------

struct Job {
  cancel: Arc<AtomicBool>,
  /// Stops a download that is waiting on the network (the flag alone would wait for the next byte).
  abort: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
}

/// The ids being installed. Cloning shares the list, so a blocking thread can hold its own handle.
#[derive(Default, Clone)]
pub struct Installs(Arc<Mutex<HashMap<String, Arc<Job>>>>);

/// Holds an id's slot while it installs; dropping it frees the slot.
struct Slot {
  installs: Installs,
  id: String,
  job: Arc<Job>,
}

impl Installs {
  fn begin(&self, id: &str) -> Result<Slot, String> {
    let mut running = self.0.lock().unwrap();
    if running.contains_key(id) {
      return Err(err("EBUSY", format!("the {id} pack is already being installed")));
    }
    let job = Arc::new(Job { cancel: Arc::new(AtomicBool::new(false)), abort: Mutex::new(None) });
    running.insert(id.to_string(), job.clone());
    Ok(Slot { installs: self.clone(), id: id.to_string(), job })
  }

  fn cancel(&self, id: &str) {
    let job = self.0.lock().unwrap().get(id).cloned();
    if let Some(job) = job {
      job.cancel.store(true, Ordering::SeqCst);
      if let Some(abort) = job.abort.lock().unwrap().as_ref() {
        abort();
      }
    }
  }

  fn is_running(&self, id: &str) -> bool {
    self.0.lock().unwrap().contains_key(id)
  }
}

impl Drop for Slot {
  fn drop(&mut self) {
    self.installs.0.lock().unwrap().remove(&self.id);
  }
}

// ---- Reading a pack ------------------------------------------------------------------------

struct Header {
  dataset: String,
  version: String,
  codec: String,
  entries: u64,
  /// (offset in the data section, compressed length, entry count)
  blocks: Vec<(u64, u64, u64)>,
  data_start: u64,
}

fn bad_pack(why: impl std::fmt::Display) -> String {
  err("EBADPACK", why)
}

/// Parses the MTRPACK2 preamble and header (format 2, zstd, bounded blocks); it does not look at the dataset or codec.
fn read_header(file: &mut File, size: u64, name: &str) -> Result<Header, String> {
  let not_a_pack = |why: &str| bad_pack(format!("{name} is not a Miteiru language pack ({why})"));
  if size < PREAMBLE_BYTES {
    return Err(not_a_pack("too short"));
  }
  let mut preamble = [0u8; PREAMBLE_BYTES as usize];
  file.seek(SeekFrom::Start(0)).and_then(|_| file.read_exact(&mut preamble)).map_err(|_| not_a_pack("unreadable"))?;
  if &preamble[..8] != MAGIC {
    return Err(not_a_pack("bad magic"));
  }
  let header_length = u32::from_le_bytes(preamble[8..12].try_into().unwrap()) as u64;
  let data_start = PREAMBLE_BYTES + header_length;
  if data_start > size {
    return Err(not_a_pack("the header does not fit"));
  }
  let mut raw = vec![0u8; header_length as usize];
  file.read_exact(&mut raw).map_err(|_| not_a_pack("truncated"))?;
  let value: serde_json::Value = serde_json::from_slice(&raw).map_err(|_| not_a_pack("unreadable header"))?;
  let object = value.as_object().ok_or_else(|| not_a_pack("header is not an object"))?;
  if object.get("format").and_then(|v| v.as_u64()) != Some(2) {
    return Err(not_a_pack("unsupported format"));
  }
  if object.get("compression").and_then(|v| v.as_str()) != Some("zstd") {
    return Err(not_a_pack("unsupported compression"));
  }
  let text = |field: &str| object.get(field).and_then(|v| v.as_str()).map(str::to_string).ok_or_else(|| not_a_pack("incomplete header"));
  let entries = object.get("entries").and_then(|v| v.as_u64()).ok_or_else(|| not_a_pack("bad entry count"))?;
  let list = object.get("blocks").and_then(|v| v.as_array()).ok_or_else(|| not_a_pack("no block list"))?;
  let data_length = size - data_start;
  let mut blocks = Vec::with_capacity(list.len());
  let mut total = 0u64;
  for block in list {
    let parts = block.as_array().filter(|p| p.len() == 4).ok_or_else(|| not_a_pack("bad block"))?;
    let number = |i: usize| parts[i].as_u64().ok_or_else(|| not_a_pack("bad block"));
    let (offset, length, count) = (number(1)?, number(2)?, number(3)?);
    if offset.checked_add(length).is_none_or(|end| end > data_length) {
      return Err(not_a_pack("a block is outside the file"));
    }
    total = total.checked_add(count).ok_or_else(|| not_a_pack("bad entry counts"))?;
    blocks.push((offset, length, count));
  }
  if total != entries {
    return Err(not_a_pack("the block entry counts do not add up"));
  }
  Ok(Header { dataset: text("dataset")?, version: text("version")?, codec: text("codec")?, entries, blocks, data_start })
}

/// A key must be a plain relative path: no empty, `.` or `..` segment, no `\`, no `:`, nothing absolute.
fn validate_key(key: &str) -> Result<(), String> {
  let bad = |why: &str| bad_pack(format!("bad key {key:?}: {why}"));
  if key.is_empty() {
    return Err(bad("empty"));
  }
  if key.len() > MAX_KEY_BYTES {
    return Err(bad("too long"));
  }
  if key.starts_with('/') {
    return Err(bad("absolute"));
  }
  if key.contains('\\') {
    return Err(bad("has a backslash"));
  }
  if key.contains(':') {
    return Err(bad("has a colon"));
  }
  if key.split('/').any(|segment| segment.is_empty() || segment == "." || segment == "..") {
    return Err(bad("has an empty, . or .. segment"));
  }
  Ok(())
}

fn decompress(frame: &[u8]) -> Result<Vec<u8>, String> {
  let fail = |e: std::io::Error| bad_pack(format!("a block does not decompress: {e}"));
  let decoder = zstd::stream::read::Decoder::new(frame).map_err(fail)?;
  let mut out = Vec::new();
  decoder.take(MAX_BLOCK_BYTES + 1).read_to_end(&mut out).map_err(fail)?;
  if out.len() as u64 > MAX_BLOCK_BYTES {
    return Err(bad_pack(format!("a block is larger than {MAX_BLOCK_BYTES} bytes")));
  }
  Ok(out)
}

/// Splits a decoded block: repeated [u32 key length][key][u32 value length][value].
fn block_entries(raw: &[u8]) -> Result<Vec<(&[u8], &[u8])>, String> {
  fn piece<'a>(raw: &'a [u8], at: &mut usize) -> Result<&'a [u8], String> {
    let truncated = || bad_pack("a block ends inside an entry");
    let length_end = at.checked_add(4).filter(|end| *end <= raw.len()).ok_or_else(truncated)?;
    let length = u32::from_le_bytes(raw[*at..length_end].try_into().unwrap()) as usize;
    let end = length_end.checked_add(length).filter(|end| *end <= raw.len()).ok_or_else(truncated)?;
    *at = end;
    Ok(&raw[length_end..end])
  }
  let mut at = 0usize;
  let mut entries = Vec::new();
  while at < raw.len() {
    let key = piece(raw, &mut at)?;
    let value = piece(raw, &mut at)?;
    entries.push((key, value));
  }
  Ok(entries)
}

/// Unpacks the pack's files into `<dest>/language-assets/`, checking the header and every key first.
/// Returns the pack's version. `dest` is a folder the caller made and removes on failure.
fn extract(pack_file: &Path, id: &str, dest: &Path, cancel: &AtomicBool, reporter: &Reporter) -> Result<String, String> {
  let name = pack_file.file_name().map_or_else(String::new, |n| n.to_string_lossy().into_owned());
  let mut file = File::open(pack_file).map_err(|e| io_err(&e, "open", pack_file))?;
  let size = file.metadata().map_err(|e| io_err(&e, "stat", pack_file))?.len();
  let header = read_header(&mut file, size, &name)?;
  if header.codec != "file" {
    return Err(bad_pack(format!("{name} has codec {:?}, not \"file\"", header.codec)));
  }
  if header.dataset != format!("{DATASET_PREFIX}{id}") {
    return Err(bad_pack(format!("{name} holds {:?}, not the {id} pack", header.dataset)));
  }
  let assets = dest.join(ASSETS_DIR);
  fs::create_dir_all(&assets).map_err(|e| io_err(&e, "mkdir", &assets))?;
  let mut seen: HashSet<String> = HashSet::new();
  let mut written = 0u64;
  for (offset, length, count) in &header.blocks {
    if cancel.load(Ordering::SeqCst) {
      return Err(err("ECANCELED", "the install was cancelled"));
    }
    let mut frame = vec![0u8; *length as usize];
    file
      .seek(SeekFrom::Start(header.data_start + offset))
      .and_then(|_| file.read_exact(&mut frame))
      .map_err(|e| io_err(&e, "read", pack_file))?;
    let raw = decompress(&frame)?;
    let entries = block_entries(&raw)?;
    if entries.len() as u64 != *count {
      return Err(bad_pack(format!("a block holds {} entries, not {count}", entries.len())));
    }
    for (key, value) in entries {
      if cancel.load(Ordering::SeqCst) {
        return Err(err("ECANCELED", "the install was cancelled"));
      }
      let key = std::str::from_utf8(key).map_err(|_| bad_pack("a key is not UTF-8"))?;
      validate_key(key)?;
      if !seen.insert(key.to_string()) {
        return Err(bad_pack(format!("duplicate entry {key:?}")));
      }
      let target = key.split('/').fold(assets.clone(), |path, part| path.join(part));
      if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| io_err(&e, "mkdir", parent))?;
      }
      fs::write(&target, value).map_err(|e| io_err(&e, "write", &target))?;
      written += 1;
      reporter.report(id, "install", written, header.entries);
    }
  }
  if written != header.entries {
    return Err(bad_pack(format!("{name} holds {written} entries, but its header says {}", header.entries)));
  }
  if header.entries == 0 {
    reporter.report(id, "install", 0, 0);
  }
  Ok(header.version)
}

fn unix_secs() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn sha_prefix(sha256: &str) -> &str {
  &sha256[..sha256.len().min(12)]
}

/// Unpacks a verified pack file into `.partial-…` and renames it to its install folder (pack.json last).
fn install_blocking(
  root: &Path,
  pack: &ManifestPack,
  file: &Path,
  cancel: &AtomicBool,
  reporter: &Reporter,
) -> Result<PathBuf, String> {
  fs::create_dir_all(root).map_err(|e| io_err(&e, "mkdir", root))?;
  let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
  let partial = root.join(format!("{PARTIAL_PREFIX}{}-{nanos}", pack.id));
  let outcome = (|| {
    let version = extract(file, &pack.id, &partial, cancel, reporter)?;
    let mut installed_at = unix_secs();
    let mut dir = root.join(format!("{}-{}-{installed_at}", pack.id, sha_prefix(&pack.sha256)));
    while dir.exists() {
      installed_at += 1;
      dir = root.join(format!("{}-{}-{installed_at}", pack.id, sha_prefix(&pack.sha256)));
    }
    let info = PackInfo { id: pack.id.clone(), sha256: pack.sha256.clone(), bytes: pack.bytes, version, installed_at };
    let json = serde_json::to_vec_pretty(&info).map_err(|e| err("EIO", e))?;
    let info_path = partial.join(PACK_JSON);
    fs::write(&info_path, json).map_err(|e| io_err(&e, "write", &info_path))?;
    fs::rename(&partial, &dir).map_err(|e| io_err(&e, "rename", &partial))?;
    Ok(dir)
  })();
  if outcome.is_err() {
    let _ = fs::remove_dir_all(&partial);
  }
  outcome
}

/// sha256 of a file, reporting the bytes read as the `verify` phase.
fn hash_file(path: &Path, id: &str, reporter: &Reporter) -> Result<String, String> {
  let mut file = File::open(path).map_err(|e| io_err(&e, "open", path))?;
  let total = file.metadata().map_err(|e| io_err(&e, "stat", path))?.len();
  let mut hasher = Sha256::new();
  let mut buffer = vec![0u8; 1 << 20];
  let mut done = 0u64;
  loop {
    let n = file.read(&mut buffer).map_err(|e| io_err(&e, "read", path))?;
    if n == 0 {
      break;
    }
    hasher.update(&buffer[..n]);
    done += n as u64;
    reporter.report(id, "verify", done, total);
  }
  if total == 0 {
    reporter.report(id, "verify", 0, 0);
  }
  Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
  bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// What to say about a file that is not any pack this version lists: another version of a Miteiru
/// language pack (EVERSION, naming it), or something else (EBADPACK).
fn explain_foreign_file(path: &Path, app_version: &str) -> String {
  let name = path.file_name().map_or_else(String::new, |n| n.to_string_lossy().into_owned());
  let header = File::open(path)
    .map_err(|e| io_err(&e, "open", path))
    .and_then(|mut file| {
      let size = file.metadata().map_err(|e| io_err(&e, "stat", path))?.len();
      read_header(&mut file, size, &name)
    });
  match header {
    Ok(header) => match header.dataset.strip_prefix(DATASET_PREFIX) {
      Some(id) if !id.is_empty() => err(
        "EVERSION",
        format!("{name} is the {id} language pack, but not the version Miteiru {app_version} expects; download the one from this release"),
      ),
      _ => bad_pack(format!("{name} is a data table, but not a Miteiru language pack")),
    },
    Err(message) => message,
  }
}

/// `langpack_install_file`, minus the page: hashes the file, finds the manifest pack it is, installs it.
fn install_file_blocking(
  env: &Env,
  manifest: &Manifest,
  path: &Path,
  installs: &Installs,
  reporter: &Reporter,
) -> Result<LanguagePack, String> {
  let probe = path.file_name().map_or_else(String::new, |n| n.to_string_lossy().into_owned());
  let sha = hash_file(path, &probe, reporter)?;
  let Some(pack) = manifest.packs.iter().find(|p| p.sha256.eq_ignore_ascii_case(&sha)) else {
    return Err(explain_foreign_file(path, &manifest.app_version));
  };
  let slot = installs.begin(&pack.id)?;
  install_blocking(&env.root, pack, path, &slot.job.cancel, reporter)?;
  Ok(view(env, pack))
}

// ---- Downloading ---------------------------------------------------------------------------

fn network_error(url: &str, e: &reqwest::Error) -> String {
  let detail = if e.is_timeout() {
    "no data arrived for 60 seconds".to_string()
  } else {
    e.to_string()
  };
  err("ENETWORK", format!("{url}: {detail}"))
}

/// Streams the pack to `part`, hashing as it goes. Fails as soon as more than `pack.bytes` arrives.
async fn download(
  url: &str,
  pack: &ManifestPack,
  part: &Path,
  cancel: &AtomicBool,
  reporter: &Reporter,
) -> Result<(), String> {
  let client = reqwest::Client::builder()
    .connect_timeout(CONNECT_TIMEOUT)
    .read_timeout(READ_TIMEOUT)
    .redirect(reqwest::redirect::Policy::limited(10))
    .user_agent(concat!("Miteiru/", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|e| err("EIO", format!("http client: {e}")))?;
  let mut response = client.get(url).send().await.map_err(|e| network_error(url, &e))?;
  let status = response.status();
  if !status.is_success() {
    return Err(err(&format!("EHTTP {}", status.as_u16()), format!("{} for {url}", status.canonical_reason().unwrap_or("error"))));
  }
  if response.content_length().is_some_and(|length| length > pack.bytes) {
    return Err(err("ESIZE", format!("the server announced more than the {} bytes the manifest lists", pack.bytes)));
  }
  let mut out = File::create(part).map_err(|e| io_err(&e, "open", part))?;
  let mut hasher = Sha256::new();
  let mut received = 0u64;
  loop {
    let chunk = response.chunk().await.map_err(|e| network_error(url, &e))?;
    if cancel.load(Ordering::SeqCst) {
      return Err(err("ECANCELED", "the install was cancelled"));
    }
    let Some(chunk) = chunk else { break };
    received += chunk.len() as u64;
    if received > pack.bytes {
      return Err(err("ESIZE", format!("more than the {} bytes the manifest lists arrived", pack.bytes)));
    }
    hasher.update(&chunk);
    out.write_all(&chunk).map_err(|e| io_err(&e, "write", part))?;
    reporter.report(&pack.id, "download", received, pack.bytes);
  }
  out.flush().map_err(|e| io_err(&e, "write", part))?;
  drop(out);
  if received != pack.bytes {
    return Err(err("ESIZE", format!("{received} bytes arrived, the manifest lists {}", pack.bytes)));
  }
  reporter.report(&pack.id, "download", received, pack.bytes);
  let sha = hex(&hasher.finalize());
  if !sha.eq_ignore_ascii_case(&pack.sha256) {
    return Err(err("ECHECKSUM", format!("the download's sha256 is {sha}, the manifest lists {}", pack.sha256)));
  }
  reporter.report(&pack.id, "verify", received, received);
  Ok(())
}

/// Download, then unpack. Removes the `.part` file whatever happens.
async fn download_and_install(
  env: Env,
  pack: ManifestPack,
  url: String,
  cancel: Arc<AtomicBool>,
  reporter: Reporter,
) -> Result<(), String> {
  let downloads = env.root.join(DOWNLOADS_DIR);
  fs::create_dir_all(&downloads).map_err(|e| io_err(&e, "mkdir", &downloads))?;
  let part = downloads.join(format!("{}.part", pack.file));
  let _ = fs::remove_file(&part);
  let outcome = match download(&url, &pack, &part, &cancel, &reporter).await {
    Ok(()) => {
      let (root, pack, part, cancel, reporter) = (env.root.clone(), pack.clone(), part.clone(), cancel.clone(), reporter.clone());
      tauri::async_runtime::spawn_blocking(move || install_blocking(&root, &pack, &part, &cancel, &reporter))
        .await
        .map_err(|e| err("EIO", format!("the unpacking task failed: {e}")))
        .and_then(|result| result.map(|_| ()))
    }
    Err(message) => Err(message),
  };
  let _ = fs::remove_file(&part);
  outcome
}

// ---- Removing and cleaning up --------------------------------------------------------------

/// Takes the pack out of use at once (pack.json first), then tries to delete the folders; a table that
/// is still open on Windows blocks the delete, and the next start's cleanup finishes it.
fn remove_pack(root: &Path, id: &str) {
  let found: Vec<PathBuf> = installs(root).into_iter().filter(|i| i.info.id == id).map(|i| i.dir).collect();
  for dir in &found {
    let _ = fs::remove_file(dir.join(PACK_JSON));
  }
  for dir in &found {
    let _ = fs::remove_dir_all(dir);
  }
}

/// Deletes what an interrupted install left, and every install but the newest of each pack.
/// Returns what it removed, for the log.
pub fn collect_garbage(root: &Path) -> Vec<String> {
  let mut removed = Vec::new();
  let mut remove = |path: &Path| {
    let outcome = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
    removed.push(format!("{} ({})", path.display(), outcome.as_ref().map_or_else(|e| e.to_string(), |_| "removed".into())));
  };
  let Ok(entries) = fs::read_dir(root) else { return removed };
  let mut whole: Vec<(PathBuf, PackInfo)> = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().into_owned();
    if name == DOWNLOADS_DIR || name.starts_with(PARTIAL_PREFIX) {
      remove(&path);
    } else if path.is_dir() {
      match read_install(&path) {
        Some(info) => whole.push((path, info)),
        None => remove(&path),
      }
    }
  }
  // The same order newest_install uses: the latest installedAt, then the folder name.
  let rank = |item: &(PathBuf, PackInfo)| (item.1.installed_at, item.0.file_name().map(|n| n.to_os_string()));
  let mut keep: HashMap<&str, &(PathBuf, PackInfo)> = HashMap::new();
  for item in &whole {
    if keep.get(item.1.id.as_str()).is_none_or(|best| rank(best) < rank(item)) {
      keep.insert(item.1.id.as_str(), item);
    }
  }
  for item in &whole {
    if keep.get(item.1.id.as_str()).is_some_and(|best| best.0 != item.0) {
      remove(&item.0);
    }
  }
  removed
}

// ---- Commands ------------------------------------------------------------------------------

#[tauri::command]
pub async fn langpack_status(app: tauri::AppHandle) -> Result<LanguagePackStatus, String> {
  let env = env_of(&app)?;
  Ok(status_of(&env, &app.package_info().version.to_string()))
}

#[tauri::command]
pub async fn langpack_install(
  app: tauri::AppHandle,
  installs: State<'_, Installs>,
  id: String,
  on_progress: Channel<LanguagePackProgress>,
) -> Result<LanguagePack, String> {
  let env = env_of(&app)?;
  let manifest = require_manifest(&env)?;
  let pack = manifest
    .packs
    .iter()
    .find(|p| p.id == id)
    .cloned()
    .ok_or_else(|| err("EUNKNOWN", format!("no language pack named {id:?}")))?;
  let slot = installs.begin(&id)?;
  let url = format!("{}{}", base_url(Some(&manifest)), pack.file);
  let task = tauri::async_runtime::spawn(download_and_install(
    env.clone(),
    pack.clone(),
    url,
    slot.job.cancel.clone(),
    Reporter::channel(on_progress),
  ));
  let handle = task.inner().abort_handle();
  *slot.job.abort.lock().unwrap() = Some(Box::new(move || handle.abort()));
  // A cancel that came in before the abort was in place.
  if slot.job.cancel.load(Ordering::SeqCst) {
    task.abort();
  }
  let outcome = task.await;
  let part = env.root.join(DOWNLOADS_DIR).join(format!("{}.part", pack.file));
  let _ = fs::remove_file(&part);
  match outcome {
    Ok(Ok(())) => Ok(view(&env, &pack)),
    Ok(Err(message)) => Err(message),
    Err(_) if slot.job.cancel.load(Ordering::SeqCst) => Err(err("ECANCELED", "the install was cancelled")),
    Err(e) => Err(err("EIO", format!("the install task failed: {e}"))),
  }
}

#[tauri::command]
pub async fn langpack_install_file(
  app: tauri::AppHandle,
  installs: State<'_, Installs>,
  path: String,
  on_progress: Channel<LanguagePackProgress>,
) -> Result<LanguagePack, String> {
  let env = env_of(&app)?;
  let manifest = require_manifest(&env)?;
  let reporter = Reporter::channel(on_progress);
  let installs = installs.inner().clone();
  let path = PathBuf::from(path);
  tauri::async_runtime::spawn_blocking(move || install_file_blocking(&env, &manifest, &path, &installs, &reporter))
    .await
    .map_err(|e| err("EIO", format!("the install task failed: {e}")))?
}

#[tauri::command]
pub async fn langpack_cancel(installs: State<'_, Installs>, id: String) -> Result<(), String> {
  installs.cancel(&id);
  Ok(())
}

#[tauri::command]
pub async fn langpack_remove(app: tauri::AppHandle, installs: State<'_, Installs>, id: String) -> Result<(), String> {
  let env = env_of(&app)?;
  if installs.is_running(&id) {
    return Err(err("EBUSY", format!("the {id} pack is being installed")));
  }
  remove_pack(&env.root, &id);
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  /// A temp folder that goes away with the test.
  struct Temp(PathBuf);

  impl Temp {
    fn new(name: &str) -> Temp {
      let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
      let dir = std::env::temp_dir().join(format!("miteiru-langpack-{name}-{}-{nanos}", std::process::id()));
      fs::create_dir_all(&dir).unwrap();
      Temp(dir)
    }

    fn path(&self) -> &Path {
      &self.0
    }
  }

  impl Drop for Temp {
    fn drop(&mut self) {
      let _ = fs::remove_dir_all(&self.0);
    }
  }

  /// A minimal MTRPACK2 writer: one block per `per_block` entries, in the order given (not sorted).
  fn pack_bytes(dataset: &str, codec: &str, entries: &[(&str, &[u8])], per_block: usize) -> Vec<u8> {
    let mut data = Vec::new();
    let mut blocks = Vec::new();
    for chunk in entries.chunks(per_block.max(1)) {
      let mut raw = Vec::new();
      for (key, value) in chunk {
        raw.extend((key.len() as u32).to_le_bytes());
        raw.extend(key.as_bytes());
        raw.extend((value.len() as u32).to_le_bytes());
        raw.extend(*value);
      }
      let frame = zstd::encode_all(&raw[..], 3).unwrap();
      blocks.push(serde_json::json!([chunk[0].0, data.len(), frame.len(), chunk.len()]));
      data.extend(frame);
    }
    let header = serde_json::json!({
      "format": 2, "dataset": dataset, "version": "abc123abc123", "codec": codec, "compression": "zstd",
      "source": {"name": "t", "url": "https://example.test/", "license": "CC0"},
      "entries": entries.len(), "blocks": blocks,
    });
    let header = serde_json::to_vec(&header).unwrap();
    let mut out = MAGIC.to_vec();
    out.extend((header.len() as u32).to_le_bytes());
    out.extend(header);
    out.extend(data);
    out
  }

  fn sha(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
  }

  fn manifest_pack(id: &str, bytes: &[u8]) -> ManifestPack {
    ManifestPack {
      id: id.into(),
      title: id.into(),
      file: format!("Miteiru-language-{id}.mtrpack"),
      bytes: bytes.len() as u64,
      sha256: sha(bytes),
      plugins: vec![id.into()],
      languages: vec![format!("{id}-lang")],
    }
  }

  fn quiet() -> Reporter {
    Reporter::new(|_| {})
  }

  fn no_cancel() -> AtomicBool {
    AtomicBool::new(false)
  }

  const SAMPLE: &[(&str, &[u8])] = &[
    ("vietnamese/asset-manifest.json", b"{}"),
    ("vietnamese/vietnamese/vnedict.txt.zst", b"nuoc\nxin chao"),
    ("vietnamese/vietnamese/empty.bin", b""),
    ("vietnamese/日本.txt", b"unicode name"),
  ];

  fn sample_pack() -> Vec<u8> {
    pack_bytes("language-pack/vietnamese", "file", SAMPLE, 2)
  }

  fn extract_bytes(bytes: &[u8], id: &str) -> (Temp, Result<String, String>) {
    let temp = Temp::new("extract");
    let file = temp.path().join("pack.mtrpack");
    fs::write(&file, bytes).unwrap();
    let result = extract(&file, id, &temp.path().join("out"), &no_cancel(), &quiet());
    (temp, result)
  }

  fn rejected(entries: &[(&str, &[u8])]) -> String {
    let (_temp, result) = extract_bytes(&pack_bytes("language-pack/vietnamese", "file", entries, 10), "vietnamese");
    result.expect_err("the pack should be rejected")
  }

  #[test]
  fn extracts_every_file_byte_for_byte() {
    let (temp, result) = extract_bytes(&sample_pack(), "vietnamese");
    assert_eq!(result.unwrap(), "abc123abc123");
    for (key, value) in SAMPLE {
      let path = key.split('/').fold(temp.path().join("out").join(ASSETS_DIR), |p, part| p.join(part));
      assert_eq!(&fs::read(&path).unwrap(), value, "{key}");
    }
  }

  #[test]
  fn rejects_keys_that_could_escape_or_confuse() {
    for key in ["../x", "/x", "a\\b", "C:x", "a/../x", "a//b", "./a", "a/", "", &"k".repeat(513)] {
      let message = rejected(&[("ok/file", b"fine"), (key, b"bad")]);
      assert!(message.starts_with("EBADPACK"), "{key:?}: {message}");
    }
    let message = rejected(&[("a/b", b"1"), ("a/b", b"2")]);
    assert!(message.starts_with("EBADPACK") && message.contains("duplicate"), "{message}");
  }

  #[test]
  fn rejects_the_wrong_codec_dataset_and_counts() {
    let temp = Temp::new("wrong");
    let file = temp.path().join("p.mtrpack");
    let try_it = |bytes: Vec<u8>, id: &str| {
      fs::write(&file, bytes).unwrap();
      extract(&file, id, &temp.path().join("out"), &no_cancel(), &quiet()).expect_err("rejected")
    };
    assert!(try_it(pack_bytes("language-pack/vietnamese", "text", SAMPLE, 2), "vietnamese").contains("codec"));
    assert!(try_it(sample_pack(), "mandarin").contains("not the mandarin pack"));
    assert!(try_it(b"not a pack at all, only text".to_vec(), "vietnamese").starts_with("EBADPACK"));
    // A header that promises more entries than the blocks hold.
    let mut tampered = sample_pack();
    let header_end = 12 + u32::from_le_bytes(tampered[8..12].try_into().unwrap()) as usize;
    let header = String::from_utf8(tampered[12..header_end].to_vec()).unwrap().replace("\"entries\":4", "\"entries\":5");
    tampered[12..header_end].copy_from_slice(header.as_bytes());
    assert!(try_it(tampered, "vietnamese").starts_with("EBADPACK"));
  }

  #[test]
  fn a_failed_extraction_leaves_no_install_and_cancel_stops_it() {
    let temp = Temp::new("cancel");
    let file = temp.path().join("p.mtrpack");
    let bytes = sample_pack();
    fs::write(&file, &bytes).unwrap();
    let pack = manifest_pack("vietnamese", &bytes);
    let cancelled = AtomicBool::new(true);
    let message = install_blocking(&temp.path().join("root"), &pack, &file, &cancelled, &quiet()).unwrap_err();
    assert!(message.starts_with("ECANCELED"), "{message}");
    let left: Vec<_> = fs::read_dir(temp.path().join("root")).unwrap().flatten().collect();
    assert!(left.is_empty(), "left behind: {left:?}");
  }

  fn env_in(temp: &Temp, manifest: &[ManifestPack]) -> (Env, Manifest) {
    let resources = temp.path().join("resources");
    fs::create_dir_all(&resources).unwrap();
    let manifest = Manifest { app_version: "9.9.9".into(), base_url: "https://example.test/dl/".into(), packs: manifest.to_vec() };
    let json = serde_json::json!({
      "format": 1, "appVersion": manifest.app_version, "baseUrl": manifest.base_url,
      "packs": manifest.packs.iter().map(|p| serde_json::json!({
        "id": p.id, "title": p.title, "file": p.file, "bytes": p.bytes, "sha256": p.sha256,
        "plugins": p.plugins, "languages": p.languages,
      })).collect::<Vec<_>>(),
    });
    fs::write(resources.join(MANIFEST_FILE), serde_json::to_vec(&json).unwrap()).unwrap();
    (Env { root: temp.path().join("root"), resources }, manifest)
  }

  #[test]
  fn installs_from_a_file_and_reports_states() {
    let temp = Temp::new("install");
    let bytes = sample_pack();
    let pack = manifest_pack("vietnamese", &bytes);
    let (env, manifest) = env_in(&temp, &[pack.clone()]);
    let status = status_of(&env, "9.9.9");
    assert!(status.manifest_found);
    assert_eq!(status.base_url, "https://example.test/dl/");
    assert_eq!(status.packs[0].state, PackState::Missing);

    let file = temp.path().join("downloaded.mtrpack");
    fs::write(&file, &bytes).unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let reporter = Reporter::new(move |p| sink.lock().unwrap().push(p));
    let installed = install_file_blocking(&env, &manifest, &file, &Installs::default(), &reporter).unwrap();
    assert_eq!(installed.state, PackState::Installed);
    assert_eq!(installed.installed_sha256.as_deref(), Some(pack.sha256.as_str()));
    let dir = PathBuf::from(installed.dir.unwrap());
    assert!(dir.starts_with(&env.root));
    assert!(dir.file_name().unwrap().to_string_lossy().starts_with(&format!("vietnamese-{}-", sha_prefix(&pack.sha256))));
    assert_eq!(fs::read(dir.join("language-assets/vietnamese/vietnamese/vnedict.txt.zst")).unwrap(), b"nuoc\nxin chao");
    assert!(dir.join(PACK_JSON).is_file());
    assert!(fs::read_dir(&env.root).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(PARTIAL_PREFIX)));
    let events = events.lock().unwrap();
    assert!(events.iter().any(|e| e.phase == "verify" && e.done == e.total));
    let last = events.last().unwrap();
    assert_eq!((last.phase, last.done, last.total), ("install", 4, 4));

    // A newer manifest with other bytes makes it outdated; removing it makes it missing at once.
    let newer = ManifestPack { sha256: "f".repeat(64), ..pack.clone() };
    let (env2, _) = env_in(&temp, &[newer]);
    assert_eq!(status_of(&env2, "9.9.9").packs[0].state, PackState::Outdated);
    remove_pack(&env.root, "vietnamese");
    assert_eq!(status_of(&env, "9.9.9").packs[0].state, PackState::Missing);
    assert!(!dir.join(PACK_JSON).exists());
  }

  #[test]
  fn a_file_that_is_not_listed_is_a_version_or_a_bad_pack() {
    let temp = Temp::new("foreign");
    let bytes = sample_pack();
    let (env, manifest) = env_in(&temp, &[manifest_pack("vietnamese", &bytes)]);
    let try_file = |name: &str, content: Vec<u8>| {
      let file = temp.path().join(name);
      fs::write(&file, content).unwrap();
      install_file_blocking(&env, &manifest, &file, &Installs::default(), &quiet()).unwrap_err()
    };
    // Another build of the same pack: valid, but its sha256 is not the manifest's.
    let other = pack_bytes("language-pack/vietnamese", "file", &[("vietnamese/x", b"other build")], 1);
    let message = try_file("other.mtrpack", other);
    assert!(message.starts_with("EVERSION") && message.contains("vietnamese"), "{message}");
    // A pack of an id this version does not list.
    let message = try_file("korean.mtrpack", pack_bytes("language-pack/korean", "file", &[("korean/x", b"1")], 1));
    assert!(message.starts_with("EVERSION") && message.contains("korean"), "{message}");
    // A data table that is not a language pack, and a file that is not a table.
    let message = try_file("dict.pack", pack_bytes("japanese/jmdict", "jmdict-1", &[("a", b"1")], 1));
    assert!(message.starts_with("EBADPACK"), "{message}");
    assert!(try_file("text.txt", b"hello".to_vec()).starts_with("EBADPACK"));
    assert!(try_file("empty.bin", Vec::new()).starts_with("EBADPACK"));
    assert!(fs::read_dir(&env.root).map_or(true, |mut d| d.next().is_none()));
  }

  #[test]
  fn a_file_with_an_unlisted_sha256_is_not_unpacked() {
    // The manifest lists other bytes than the file holds, so the file is not that pack: nothing is unpacked.
    let temp = Temp::new("sha");
    let bytes = sample_pack();
    let wrong = ManifestPack { sha256: sha(b"something else"), ..manifest_pack("vietnamese", &bytes) };
    let (env, manifest) = env_in(&temp, &[wrong]);
    let file = temp.path().join("p.mtrpack");
    fs::write(&file, &bytes).unwrap();
    let message = install_file_blocking(&env, &manifest, &file, &Installs::default(), &quiet()).unwrap_err();
    assert!(message.starts_with("EVERSION"), "{message}");
    assert!(newest_install(&env.root, "vietnamese").is_none());
  }

  fn fake_install(root: &Path, name: &str, id: &str, sha: &str, at: u64, whole: bool) -> PathBuf {
    let dir = root.join(name);
    fs::create_dir_all(dir.join(ASSETS_DIR)).unwrap();
    if whole {
      let info = PackInfo { id: id.into(), sha256: sha.into(), bytes: 1, version: "v".into(), installed_at: at };
      fs::write(dir.join(PACK_JSON), serde_json::to_vec(&info).unwrap()).unwrap();
    }
    dir
  }

  #[test]
  fn the_newest_valid_install_is_the_one_used() {
    let temp = Temp::new("newest");
    let root = temp.path();
    fake_install(root, "mandarin-aaaaaaaaaaaa-100", "mandarin", "a", 100, true);
    let newest = fake_install(root, "mandarin-bbbbbbbbbbbb-200", "mandarin", "b", 200, true);
    // Newer by name, but not a whole install (no pack.json): ignored.
    fake_install(root, "mandarin-cccccccccccc-300", "mandarin", "c", 300, false);
    fake_install(root, "hanzi-dddddddddddd-50", "hanzi", "d", 50, true);
    assert_eq!(newest_install(root, "mandarin").unwrap().dir, newest);
    assert_eq!(newest_install(root, "hanzi").unwrap().info.sha256, "d");
    assert!(newest_install(root, "cantonese").is_none());
    // A tie in time is broken by the folder name, so the choice never flips between runs.
    let tie = fake_install(root, "mandarin-eeeeeeeeeeee-200", "mandarin", "e", 200, true);
    assert_eq!(newest_install(root, "mandarin").unwrap().dir, tie);
  }

  #[test]
  fn cleanup_keeps_only_the_newest_whole_install_of_each_pack() {
    let temp = Temp::new("gc");
    let root = temp.path();
    let old = fake_install(root, "mandarin-aaaaaaaaaaaa-100", "mandarin", "a", 100, true);
    let new = fake_install(root, "mandarin-bbbbbbbbbbbb-200", "mandarin", "b", 200, true);
    let hanzi = fake_install(root, "hanzi-dddddddddddd-50", "hanzi", "d", 50, true);
    let broken = fake_install(root, "vietnamese-ffffffffffff-10", "vietnamese", "f", 10, false);
    fs::create_dir_all(root.join(".partial-mandarin-123/language-assets")).unwrap();
    fs::create_dir_all(root.join(DOWNLOADS_DIR)).unwrap();
    fs::write(root.join(DOWNLOADS_DIR).join("x.part"), b"half").unwrap();
    let removed = collect_garbage(root);
    assert_eq!(removed.len(), 4, "{removed:?}");
    assert!(new.is_dir() && hanzi.is_dir());
    assert!(!old.exists() && !broken.exists());
    assert!(!root.join(".partial-mandarin-123").exists() && !root.join(DOWNLOADS_DIR).exists());
    // Nothing left to do on a second run, and a missing root is fine.
    assert!(collect_garbage(root).is_empty());
    assert!(collect_garbage(&root.join("nope")).is_empty());
  }

  #[test]
  fn bundled_means_every_plugin_folder_is_in_the_resources() {
    let temp = Temp::new("bundled");
    let bytes = sample_pack();
    let mut pack = manifest_pack("japanese", &bytes);
    pack.plugins = vec!["japanese".into(), "han-character-core".into()];
    let (env, _) = env_in(&temp, &[pack.clone()]);
    let assets = env.resources.join(ASSETS_DIR);
    fs::create_dir_all(assets.join("japanese")).unwrap();
    fs::write(assets.join("japanese/asset-manifest.json"), b"{}").unwrap();
    assert_eq!(view(&env, &pack).state, PackState::Missing);
    fs::create_dir_all(assets.join("han-character-core")).unwrap();
    fs::write(assets.join("han-character-core/asset-manifest.json"), b"{}").unwrap();
    let bundled = view(&env, &pack);
    assert_eq!((bundled.state, bundled.dir), (PackState::Bundled, None));
  }

  #[test]
  fn a_build_without_a_manifest_has_no_packs() {
    let temp = Temp::new("nomanifest");
    let env = Env { root: temp.path().join("root"), resources: temp.path().join("resources") };
    let status = status_of(&env, "9.9.9");
    assert!(!status.manifest_found && status.packs.is_empty());
    assert_eq!(status.app_version, "9.9.9");
    assert!(require_manifest(&env).unwrap_err().starts_with("ENOMANIFEST"));
  }

  #[test]
  fn an_install_in_progress_blocks_a_second_one_and_can_be_cancelled() {
    let installs = Installs::default();
    let slot = installs.begin("japanese").unwrap();
    assert!(installs.begin("japanese").err().unwrap().starts_with("EBUSY"));
    assert!(installs.begin("hanzi").is_ok());
    assert!(!slot.job.cancel.load(Ordering::SeqCst));
    installs.cancel("japanese");
    assert!(slot.job.cancel.load(Ordering::SeqCst));
    drop(slot);
    assert!(installs.begin("japanese").is_ok());
  }

  #[test]
  fn progress_is_throttled_but_the_last_event_always_goes() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let reporter = Reporter::new(move |p| sink.lock().unwrap().push(p));
    for done in 0..=1000 {
      reporter.report("x", "install", done, 1000);
    }
    let events = events.lock().unwrap();
    assert!(events.len() < 50, "{} events", events.len());
    assert_eq!(events.last().unwrap().done, 1000);
  }

  #[test]
  fn the_base_url_ends_with_a_slash() {
    let manifest = Manifest { app_version: "1".into(), base_url: "https://example.test/dl".into(), packs: vec![] };
    // MITEIRU_LANGUAGE_PACK_URL is not set in the test run; the manifest's URL gets its slash.
    if std::env::var_os("MITEIRU_LANGUAGE_PACK_URL").is_none() {
      assert_eq!(base_url(Some(&manifest)), "https://example.test/dl/");
      assert_eq!(base_url(None), "");
    }
  }

  /// Serves `routes` ((status, extra header, body) by path) on a local port until the process ends.
  fn serve(routes: Vec<(&'static str, u16, Option<(&'static str, String)>, Vec<u8>)>) -> String {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let base = format!("http://{}/", server.server_addr().to_ip().unwrap());
    std::thread::spawn(move || {
      for request in server.incoming_requests() {
        let url = request.url().to_string();
        let route = routes.iter().find(|r| r.0 == url);
        let mut response = tiny_http::Response::from_data(route.map_or(Vec::new(), |r| r.3.clone()))
          .with_status_code(route.map_or(404, |r| r.1));
        if let Some((name, value)) = route.and_then(|r| r.2.clone()) {
          response = response.with_header(tiny_http::Header::from_bytes(name, value).unwrap());
        }
        let _ = request.respond(response);
      }
    });
    base
  }

  fn run_download(env: &Env, pack: &ManifestPack, url: String) -> Result<(), String> {
    tauri::async_runtime::block_on(download_and_install(env.clone(), pack.clone(), url, Arc::new(no_cancel()), quiet()))
  }

  #[test]
  fn downloads_follow_redirects_and_check_size_and_sha256() {
    let temp = Temp::new("http");
    let bytes = sample_pack();
    let pack = manifest_pack("vietnamese", &bytes);
    let (env, _) = env_in(&temp, &[pack.clone()]);
    let file = pack.file.clone();
    let same_length_other_bytes = vec![7u8; bytes.len()];
    let base = serve(vec![
      ("/ok/Miteiru-language-vietnamese.mtrpack", 200, None, bytes.clone()),
      ("/moved/Miteiru-language-vietnamese.mtrpack", 302, Some(("Location", "/ok/Miteiru-language-vietnamese.mtrpack".to_string())), Vec::new()),
      ("/flipped/Miteiru-language-vietnamese.mtrpack", 200, None, same_length_other_bytes),
      ("/long/Miteiru-language-vietnamese.mtrpack", 200, None, [bytes.clone(), vec![0u8; 10]].concat()),
      ("/short/Miteiru-language-vietnamese.mtrpack", 200, None, bytes[..bytes.len() - 5].to_vec()),
    ]);
    let url = |dir: &str| format!("{base}{dir}/{file}");

    let message = run_download(&env, &pack, url("flipped")).unwrap_err();
    assert!(message.starts_with("ECHECKSUM"), "{message}");
    assert!(run_download(&env, &pack, url("long")).unwrap_err().starts_with("ESIZE"));
    assert!(run_download(&env, &pack, url("short")).unwrap_err().starts_with("ESIZE"));
    assert!(run_download(&env, &pack, url("missing")).unwrap_err().starts_with("EHTTP 404:"));
    // Nothing is left behind by the failures: no install, no .part file.
    assert!(newest_install(&env.root, "vietnamese").is_none());
    let parts: Vec<_> = fs::read_dir(env.root.join(DOWNLOADS_DIR)).unwrap().flatten().collect();
    assert!(parts.is_empty(), "left behind: {parts:?}");

    run_download(&env, &pack, url("moved")).unwrap();
    let installed = newest_install(&env.root, "vietnamese").unwrap();
    assert_eq!(installed.info.sha256, pack.sha256);
    assert_eq!(fs::read(installed.dir.join("language-assets/vietnamese/asset-manifest.json")).unwrap(), b"{}");
    assert!(fs::read_dir(env.root.join(DOWNLOADS_DIR)).unwrap().next().is_none());
  }

  #[test]
  fn a_server_that_is_not_there_is_a_network_error() {
    let temp = Temp::new("down");
    let bytes = sample_pack();
    let pack = manifest_pack("vietnamese", &bytes);
    let (env, _) = env_in(&temp, &[pack.clone()]);
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let message = run_download(&env, &pack, format!("http://127.0.0.1:{port}/x")).unwrap_err();
    assert!(message.starts_with("ENETWORK"), "{message}");
  }

  #[test]
  fn a_cancelled_download_stops_before_writing_an_install() {
    let temp = Temp::new("cancelled-download");
    let bytes = sample_pack();
    let pack = manifest_pack("vietnamese", &bytes);
    let (env, _) = env_in(&temp, &[pack.clone()]);
    let base = serve(vec![("/f", 200, None, bytes)]);
    let cancelled = Arc::new(AtomicBool::new(true));
    let message = tauri::async_runtime::block_on(download_and_install(env.clone(), pack, format!("{base}f"), cancelled, quiet())).unwrap_err();
    assert!(message.starts_with("ECANCELED"), "{message}");
    assert!(newest_install(&env.root, "vietnamese").is_none());
  }

  /// Downloads a real file from a GitHub release the way an install does before unpacking: HTTPS,
  /// GitHub's redirect to its asset host, then the size and sha256 checks. A wrong sha256 must fail,
  /// and a missing asset must answer 404 rather than hang. Run it with:
  ///   MITEIRU_REAL_DOWNLOAD_URL=<release asset url> MITEIRU_REAL_DOWNLOAD_BYTES=<size> MITEIRU_REAL_DOWNLOAD_SHA256=<hex>
  ///   cargo test --lib langpack::tests::downloads_a_real_release_asset -- --ignored --nocapture
  #[test]
  #[ignore]
  fn downloads_a_real_release_asset() {
    let url = std::env::var("MITEIRU_REAL_DOWNLOAD_URL").expect("MITEIRU_REAL_DOWNLOAD_URL");
    let bytes: u64 = std::env::var("MITEIRU_REAL_DOWNLOAD_BYTES").expect("MITEIRU_REAL_DOWNLOAD_BYTES").parse().unwrap();
    let sha256 = std::env::var("MITEIRU_REAL_DOWNLOAD_SHA256").expect("MITEIRU_REAL_DOWNLOAD_SHA256");
    let temp = Temp::new("real-download");
    let part = temp.path().join("download.part");
    let pack = ManifestPack {
      id: "real".into(),
      title: "real".into(),
      file: "real".into(),
      bytes,
      sha256: sha256.to_lowercase(),
      plugins: Vec::new(),
      languages: Vec::new(),
    };
    let reports = Arc::new(Mutex::new(Vec::<(String, u64)>::new()));
    let seen = reports.clone();
    let reporter = Reporter::new(move |p| seen.lock().unwrap().push((p.phase.to_string(), p.done)));
    let started = Instant::now();
    tauri::async_runtime::block_on(download(&url, &pack, &part, &no_cancel(), &reporter)).unwrap();
    let reports = reports.lock().unwrap().clone();
    println!("{url}: {bytes} bytes in {} ms, {} progress reports, last {:?}", started.elapsed().as_millis(), reports.len(), reports.last());
    assert_eq!(fs::metadata(&part).unwrap().len(), bytes);
    assert_eq!(reports.last().map(|(phase, done)| (phase.as_str(), *done)), Some(("verify", bytes)));

    let wrong = ManifestPack { sha256: "0".repeat(64), ..pack.clone() };
    let message = tauri::async_runtime::block_on(download(&url, &wrong, &part, &no_cancel(), &quiet())).unwrap_err();
    println!("wrong sha256: {message}");
    assert!(message.starts_with("ECHECKSUM"), "{message}");

    let missing = format!("{url}-not-there");
    let message = tauri::async_runtime::block_on(download(&missing, &pack, &part, &no_cancel(), &quiet())).unwrap_err();
    println!("missing asset: {message}");
    assert!(message.starts_with("EHTTP 404"), "{message}");
  }

  /// Installs the five real packs from a folder (the output of `npm run build:language-packs`) into a
  /// temp root and leaves the installs in place for a byte comparison. Run it with:
  ///   MITEIRU_REAL_PACKS=<dir with the .mtrpack files and language-packs.json> MITEIRU_REAL_PACKS_OUT=<empty dir>
  ///   cargo test --lib langpack::tests::installs_the_real_packs -- --ignored --nocapture
  #[test]
  #[ignore]
  fn installs_the_real_packs() {
    let source = PathBuf::from(std::env::var("MITEIRU_REAL_PACKS").expect("MITEIRU_REAL_PACKS"));
    let out = PathBuf::from(std::env::var("MITEIRU_REAL_PACKS_OUT").expect("MITEIRU_REAL_PACKS_OUT"));
    let resources = out.join("resources");
    fs::create_dir_all(&resources).unwrap();
    fs::copy(source.join(MANIFEST_FILE), resources.join(MANIFEST_FILE)).unwrap();
    let env = Env { root: out.join("root"), resources };
    let manifest = require_manifest(&env).unwrap();
    let installs = Installs::default();
    for pack in &manifest.packs {
      let started = Instant::now();
      let installed = install_file_blocking(&env, &manifest, &source.join(&pack.file), &installs, &quiet()).unwrap();
      println!("{}: {:?} in {} ms -> {}", pack.id, installed.state, started.elapsed().as_millis(), installed.dir.clone().unwrap());
      assert_eq!(installed.state, PackState::Installed);
    }
    assert!(status_of(&env, "9.9.9").packs.iter().all(|p| p.state == PackState::Installed));
  }
}
