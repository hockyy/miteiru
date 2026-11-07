//! A small Matroska/WebM reader, so the subtitles inside an MKV open without FFmpeg.
//!
//! It reads the track list (what ffprobe printed) and pulls one text subtitle track out as a
//! `.srt`, `.ass` or `.vtt` file. Only headers are read: video and audio payloads are skipped with
//! seeks, so a 2 GB episode costs a scan of its cluster headers. Every size comes from the file, so
//! every read is bounds-checked and every allocation is capped; a corrupt file is an error, never a panic.

use super::fs_err;
use flate2::read::ZlibDecoder;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const ID_EBML: u32 = 0x1A45_DFA3;
const ID_DOCTYPE: u32 = 0x4282;
const ID_SEGMENT: u32 = 0x1853_8067;
const ID_SEEK_HEAD: u32 = 0x114D_9B74;
const ID_SEEK: u32 = 0x4DBB;
const ID_SEEK_ID: u32 = 0x53AB;
const ID_SEEK_POSITION: u32 = 0x53AC;
const ID_INFO: u32 = 0x1549_A966;
const ID_TIMESTAMP_SCALE: u32 = 0x2A_D7B1;
const ID_DURATION: u32 = 0x4489;
const ID_TRACKS: u32 = 0x1654_AE6B;
const ID_TRACK_ENTRY: u32 = 0xAE;
const ID_TRACK_NUMBER: u32 = 0xD7;
const ID_TRACK_TYPE: u32 = 0x83;
const ID_FLAG_DEFAULT: u32 = 0x88;
const ID_FLAG_FORCED: u32 = 0x55AA;
const ID_CODEC_ID: u32 = 0x86;
const ID_CODEC_PRIVATE: u32 = 0x63A2;
const ID_LANGUAGE: u32 = 0x22_B59C;
const ID_LANGUAGE_BCP47: u32 = 0x22_B59D;
const ID_NAME: u32 = 0x536E;
const ID_CONTENT_ENCODINGS: u32 = 0x6D80;
const ID_CONTENT_ENCODING: u32 = 0x6240;
const ID_ENCODING_ORDER: u32 = 0x5031;
const ID_ENCODING_SCOPE: u32 = 0x5032;
const ID_ENCODING_TYPE: u32 = 0x5033;
const ID_CONTENT_COMPRESSION: u32 = 0x5034;
const ID_COMP_ALGO: u32 = 0x4254;
const ID_COMP_SETTINGS: u32 = 0x4255;
const ID_CLUSTER: u32 = 0x1F43_B675;
const ID_CLUSTER_TIMESTAMP: u32 = 0xE7;
const ID_SIMPLE_BLOCK: u32 = 0xA3;
const ID_BLOCK_GROUP: u32 = 0xA0;
const ID_BLOCK: u32 = 0xA1;
const ID_BLOCK_DURATION: u32 = 0x9B;
const ID_CUES: u32 = 0x1C53_BB6B;
const ID_TAGS: u32 = 0x1254_C367;
const ID_CHAPTERS: u32 = 0x1043_A770;
const ID_ATTACHMENTS: u32 = 0x1941_A469;

/// The largest subtitle block (also after decompression) and header payload read into memory.
const MAX_BLOCK: u64 = 16 * 1024 * 1024;
const MAX_CODEC_PRIVATE: usize = 1024 * 1024;
const MAX_TRACKS: u64 = 32 * 1024 * 1024;
const MAX_SMALL: u64 = 1024 * 1024;
/// A cue with no duration lasts until the next one, but never longer than this.
const MAX_OPEN_CUE_MS: i64 = 10_000;

const TYPE_VIDEO: u64 = 1;
const TYPE_AUDIO: u64 = 2;
const TYPE_SUBTITLE: u64 = 0x11;

// ---- what the frontend gets ------------------------------------------------------------------

/// The same shape `MediaAnalyzer.parseFFprobeOutput` builds.
#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaTrack {
  pub index: usize,
  #[serde(rename = "type")]
  pub kind: &'static str,
  pub codec: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub language: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub title: Option<String>,
  pub default: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
  pub duration: f64,
  pub audio_tracks: Vec<MediaTrack>,
  pub subtitle_tracks: Vec<MediaTrack>,
  pub video_tracks: Vec<MediaTrack>,
}

// ---- parsed pieces ---------------------------------------------------------------------------

#[derive(Debug)]
struct Encoding {
  order: u64,
  scope: u64,
  kind: u64,
  algo: u64,
  settings: Vec<u8>,
}

#[derive(Debug)]
struct Track {
  index: usize,
  number: u64,
  kind: u64,
  codec_id: String,
  private: Vec<u8>,
  private_too_big: bool,
  language: Option<String>,
  bcp47: Option<String>,
  name: Option<String>,
  default: bool,
  encodings: Vec<Encoding>,
}

/// One subtitle block as stored: its time in timestamp-scale ticks and its (undecoded) payload.
#[derive(Debug)]
struct RawBlock {
  ticks: i64,
  duration_ticks: Option<u64>,
  data: Vec<u8>,
}

struct Parsed {
  scale: u64,
  duration: Option<f64>,
  tracks: Option<Vec<Track>>,
  blocks: Vec<RawBlock>,
}

/// ffprobe's name for a Matroska CodecID; anything unknown is the CodecID lowercased.
fn codec_name(id: &str) -> String {
  match id {
    "S_TEXT/UTF8" => "subrip",
    "S_TEXT/ASS" => "ass",
    "S_TEXT/SSA" => "ssa",
    // ffmpeg's muxer writes the older D_WEBVTT/* ids.
    "S_TEXT/WEBVTT" | "D_WEBVTT/SUBTITLES" | "D_WEBVTT/CAPTIONS" => "webvtt",
    "S_HDMV/PGS" => "hdmv_pgs_subtitle",
    "S_VOBSUB" => "dvd_subtitle",
    "S_DVBSUB" => "dvb_subtitle",
    "A_AAC" => "aac",
    "A_OPUS" => "opus",
    "A_FLAC" => "flac",
    "A_AC3" => "ac3",
    "A_EAC3" => "eac3",
    "A_VORBIS" => "vorbis",
    "A_MPEG/L3" => "mp3",
    "A_MPEG/L2" => "mp2",
    "A_DTS" => "dts",
    "A_TRUEHD" => "truehd",
    "V_MPEG4/ISO/AVC" => "h264",
    "V_MPEGH/ISO/HEVC" => "hevc",
    "V_AV1" => "av1",
    "V_VP9" => "vp9",
    "V_VP8" => "vp8",
    other => return other.to_ascii_lowercase(),
  }
  .to_string()
}

// ---- varints and slices ----------------------------------------------------------------------

/// Decode an EBML variable-length integer: (value with the length marker removed, byte length, all value bits set).
fn vint(d: &[u8]) -> Option<(u64, usize, bool)> {
  let first = *d.first()?;
  if first == 0 {
    return None;
  }
  let len = first.leading_zeros() as usize + 1;
  if d.len() < len {
    return None;
  }
  let mut value = u64::from(first) & (0xFF >> len);
  let mut all_ones = value == (0xFF >> len);
  for &b in &d[1..len] {
    value = (value << 8) | u64::from(b);
    all_ones &= b == 0xFF;
  }
  Some((value, len, all_ones))
}

fn uint(b: &[u8]) -> Result<u64, String> {
  if b.len() > 8 {
    return Err("corrupt file: a number is longer than 8 bytes".into());
  }
  Ok(b.iter().fold(0u64, |n, &x| (n << 8) | u64::from(x)))
}

fn float(b: &[u8]) -> Result<f64, String> {
  match b.len() {
    0 => Ok(0.0),
    4 => Ok(f64::from(f32::from_be_bytes([b[0], b[1], b[2], b[3]]))),
    8 => Ok(f64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])),
    _ => Err("corrupt file: a float is not 4 or 8 bytes".into()),
  }
}

fn text(b: &[u8]) -> String {
  String::from_utf8_lossy(b).trim_end_matches('\0').to_string()
}

/// The children of a master element held in memory.
struct Slice<'a> {
  d: &'a [u8],
  p: usize,
}

impl<'a> Slice<'a> {
  fn new(d: &'a [u8]) -> Self {
    Slice { d, p: 0 }
  }

  fn next(&mut self) -> Result<Option<(u32, &'a [u8])>, String> {
    if self.p >= self.d.len() {
      return Ok(None);
    }
    let rest = &self.d[self.p..];
    let (id, id_len) = element_id(rest).ok_or("corrupt file: bad element id")?;
    let (size, size_len, unknown) = vint(&rest[id_len..]).ok_or("corrupt file: bad element size")?;
    let start = id_len + size_len;
    let end = if unknown {
      rest.len()
    } else {
      usize::try_from(size)
        .ok()
        .and_then(|s| start.checked_add(s))
        .filter(|&e| e <= rest.len())
        .ok_or("corrupt file: an element runs past its parent")?
    };
    self.p += end;
    Ok(Some((id, &rest[start..end])))
  }
}

/// An element id keeps its length marker bits; 1 to 4 bytes.
fn element_id(d: &[u8]) -> Option<(u32, usize)> {
  let first = *d.first()?;
  let len = first.leading_zeros() as usize + 1;
  if first == 0 || len > 4 || d.len() < len {
    return None;
  }
  Some((d[..len].iter().fold(0u32, |n, &b| (n << 8) | u32::from(b)), len))
}

// ---- header pieces ---------------------------------------------------------------------------

fn parse_info(d: &[u8]) -> Result<(u64, Option<f64>), String> {
  let (mut scale, mut duration) = (1_000_000, None);
  let mut s = Slice::new(d);
  while let Some((id, body)) = s.next()? {
    match id {
      ID_TIMESTAMP_SCALE => scale = uint(body)?.max(1),
      ID_DURATION => duration = Some(float(body)?),
      _ => {}
    }
  }
  Ok((scale, duration))
}

fn parse_seek_head(d: &[u8], out: &mut HashMap<u32, u64>) -> Result<(), String> {
  let mut s = Slice::new(d);
  while let Some((id, body)) = s.next()? {
    if id != ID_SEEK {
      continue;
    }
    let (mut target, mut pos) = (None, None);
    let mut e = Slice::new(body);
    while let Some((id, b)) = e.next()? {
      match id {
        ID_SEEK_ID => target = element_id(b).map(|(id, _)| id),
        ID_SEEK_POSITION => pos = Some(uint(b)?),
        _ => {}
      }
    }
    if let (Some(t), Some(p)) = (target, pos) {
      out.entry(t).or_insert(p);
    }
  }
  Ok(())
}

fn parse_encodings(d: &[u8]) -> Result<Vec<Encoding>, String> {
  let mut out = Vec::new();
  let mut s = Slice::new(d);
  while let Some((id, body)) = s.next()? {
    if id != ID_CONTENT_ENCODING {
      continue;
    }
    // The spec's defaults: order 0, scope 1 (the blocks), type 0 (compression), algorithm 0 (zlib).
    let mut enc = Encoding { order: 0, scope: 1, kind: 0, algo: 0, settings: Vec::new() };
    let mut e = Slice::new(body);
    while let Some((id, b)) = e.next()? {
      match id {
        ID_ENCODING_ORDER => enc.order = uint(b)?,
        ID_ENCODING_SCOPE => enc.scope = uint(b)?,
        ID_ENCODING_TYPE => enc.kind = uint(b)?,
        ID_CONTENT_COMPRESSION => {
          let mut c = Slice::new(b);
          while let Some((id, v)) = c.next()? {
            match id {
              ID_COMP_ALGO => enc.algo = uint(v)?,
              ID_COMP_SETTINGS if v.len() <= MAX_CODEC_PRIVATE => enc.settings = v.to_vec(),
              ID_COMP_SETTINGS => return Err("corrupt file: header-stripping bytes are too large".into()),
              _ => {}
            }
          }
        }
        _ => {}
      }
    }
    out.push(enc);
  }
  Ok(out)
}

fn parse_tracks(d: &[u8]) -> Result<Vec<Track>, String> {
  let mut tracks = Vec::new();
  let mut s = Slice::new(d);
  while let Some((id, body)) = s.next()? {
    if id != ID_TRACK_ENTRY {
      continue;
    }
    let mut t = Track {
      index: tracks.len(),
      number: 0,
      kind: 0,
      codec_id: String::new(),
      private: Vec::new(),
      private_too_big: false,
      language: None,
      bcp47: None,
      name: None,
      default: true,
      encodings: Vec::new(),
    };
    let mut e = Slice::new(body);
    while let Some((id, b)) = e.next()? {
      match id {
        ID_TRACK_NUMBER => t.number = uint(b)?,
        ID_TRACK_TYPE => t.kind = uint(b)?,
        ID_FLAG_DEFAULT => t.default = uint(b)? != 0,
        ID_FLAG_FORCED => {}
        ID_CODEC_ID => t.codec_id = text(b),
        ID_CODEC_PRIVATE if b.len() <= MAX_CODEC_PRIVATE => t.private = b.to_vec(),
        ID_CODEC_PRIVATE => t.private_too_big = true,
        ID_LANGUAGE => t.language = Some(text(b)),
        ID_LANGUAGE_BCP47 => t.bcp47 = Some(text(b)),
        ID_NAME => t.name = Some(text(b)),
        ID_CONTENT_ENCODINGS => t.encodings = parse_encodings(b)?,
        _ => {}
      }
    }
    tracks.push(t);
  }
  Ok(tracks)
}

// ---- the file reader -------------------------------------------------------------------------

struct Hdr {
  id: u32,
  /// None for an unknown-size element.
  size: Option<u64>,
  /// Where the payload starts.
  start: u64,
  /// Bytes the id and size took.
  len: u64,
}

struct Rd<F: Read + Seek> {
  r: BufReader<F>,
  pos: u64,
  len: u64,
}

fn truncated() -> String {
  "the file is truncated or damaged".to_string()
}

impl<F: Read + Seek> Rd<F> {
  fn new(mut f: F) -> std::io::Result<Self> {
    let len = f.seek(SeekFrom::End(0))?;
    f.seek(SeekFrom::Start(0))?;
    // A big buffer: the many small headers between payloads stay in it, and only a long skip leaves it.
    Ok(Rd { r: BufReader::with_capacity(1 << 20, f), pos: 0, len })
  }

  fn fill(&mut self, buf: &mut [u8]) -> Result<(), String> {
    if self.len - self.pos.min(self.len) < buf.len() as u64 {
      return Err(truncated());
    }
    self.r.read_exact(buf).map_err(|_| truncated())?;
    self.pos += buf.len() as u64;
    Ok(())
  }

  /// Move forward by `n` bytes without reading them; BufReader keeps its buffer for short moves.
  fn skip(&mut self, n: u64) -> Result<(), String> {
    if n > self.len - self.pos.min(self.len) {
      return Err(truncated());
    }
    self.r.seek_relative(n as i64).map_err(|_| truncated())?;
    self.pos += n;
    Ok(())
  }

  fn seek_to(&mut self, abs: u64) -> Result<(), String> {
    if abs > self.len {
      return Err(truncated());
    }
    self.r.seek_relative(abs as i64 - self.pos as i64).map_err(|_| truncated())?;
    self.pos = abs;
    Ok(())
  }

  fn header(&mut self) -> Result<Hdr, String> {
    let begin = self.pos;
    let mut b = [0u8; 8];
    self.fill(&mut b[..1])?;
    let id_len = b[0].leading_zeros() as usize + 1;
    if b[0] == 0 || id_len > 4 {
      return Err("corrupt file: bad element id".into());
    }
    self.fill(&mut b[1..id_len])?;
    let id = b[..id_len].iter().fold(0u32, |n, &x| (n << 8) | u32::from(x));
    self.fill(&mut b[..1])?;
    let size_len = b[0].leading_zeros() as usize + 1;
    if b[0] == 0 {
      return Err("corrupt file: bad element size".into());
    }
    self.fill(&mut b[1..size_len])?;
    let (size, _, unknown) = vint(&b[..size_len]).ok_or("corrupt file: bad element size")?;
    Ok(Hdr { id, size: if unknown { None } else { Some(size) }, start: self.pos, len: self.pos - begin })
  }

  fn rewind(&mut self, n: u64) -> Result<(), String> {
    self.r.seek_relative(-(n as i64)).map_err(|_| truncated())?;
    self.pos -= n;
    Ok(())
  }

  fn sized(h: &Hdr) -> Result<u64, String> {
    h.size.ok_or_else(|| "corrupt file: an element that needs a size has an unknown one".to_string())
  }

  fn skip_element(&mut self, h: &Hdr) -> Result<(), String> {
    self.skip(Self::sized(h)?)
  }

  /// A small element's payload. The size is checked against the file before anything is allocated.
  fn payload(&mut self, h: &Hdr, cap: u64) -> Result<Vec<u8>, String> {
    let size = Self::sized(h)?;
    if size > cap {
      return Err(format!("corrupt file: an element of {size} bytes is larger than the {cap} byte limit"));
    }
    if size > self.len - self.pos.min(self.len) {
      return Err(truncated());
    }
    let mut v = vec![0u8; size as usize];
    self.fill(&mut v)?;
    Ok(v)
  }

  /// A block (SimpleBlock or Block) is kept only when it belongs to `want`; any other is skipped.
  fn block(&mut self, h: &Hdr, want: u64) -> Result<Option<(i64, Vec<u8>)>, String> {
    let size = Self::sized(h)?;
    if size < 4 {
      return Err("corrupt file: a block is too short".into());
    }
    let mut head = [0u8; 11];
    let n = size.min(11) as usize;
    self.fill(&mut head[..n])?;
    let (track, track_len, _) = vint(&head[..n]).ok_or("corrupt file: bad block track number")?;
    if track != want {
      self.skip(size - n as u64)?;
      return Ok(None);
    }
    if size > MAX_BLOCK + 11 {
      return Err(format!("corrupt file: a subtitle block of {size} bytes is larger than the {MAX_BLOCK} byte limit"));
    }
    if size < track_len as u64 + 3 {
      return Err("corrupt file: a block is too short".into());
    }
    if size - n as u64 > self.len - self.pos.min(self.len) {
      return Err(truncated());
    }
    let mut all = vec![0u8; size as usize];
    all[..n].copy_from_slice(&head[..n]);
    self.fill(&mut all[n..])?;
    let rel = i16::from_be_bytes([all[track_len], all[track_len + 1]]);
    let flags = all[track_len + 2];
    if flags & 0x06 != 0 {
      return Err("this subtitle track uses lacing, which is not supported".into());
    }
    Ok(Some((i64::from(rel), all[track_len + 3..].to_vec())))
  }
}

fn is_top_level(id: u32) -> bool {
  matches!(
    id,
    ID_SEEK_HEAD | ID_INFO | ID_TRACKS | ID_CLUSTER | ID_CUES | ID_TAGS | ID_CHAPTERS | ID_ATTACHMENTS | ID_SEGMENT | ID_EBML
  )
}

/// Read a BlockGroup: its Block (if for `want`) and BlockDuration.
fn read_block_group<F: Read + Seek>(rd: &mut Rd<F>, h: &Hdr, want: u64, out: &mut Vec<RawBlock>) -> Result<(), String> {
  let end = h.start + Rd::<F>::sized(h)?;
  if end > rd.len {
    return Err(truncated());
  }
  let (mut block, mut duration) = (None, None);
  while rd.pos < end {
    let c = rd.header()?;
    match c.id {
      ID_BLOCK => block = rd.block(&c, want)?,
      ID_BLOCK_DURATION => duration = Some(uint(&rd.payload(&c, 8)?)?),
      _ => rd.skip_element(&c)?,
    }
  }
  if rd.pos != end {
    return Err("corrupt file: a block group is longer than it says".into());
  }
  if let Some((rel, data)) = block {
    out.push(RawBlock { ticks: rel, duration_ticks: duration, data });
  }
  Ok(())
}

fn read_cluster<F: Read + Seek>(rd: &mut Rd<F>, h: &Hdr, want: u64, out: &mut Vec<RawBlock>) -> Result<(), String> {
  let end = match h.size {
    Some(s) => {
      let end = h.start.checked_add(s).ok_or_else(truncated)?;
      if end > rd.len {
        return Err(truncated());
      }
      Some(end)
    }
    None => None,
  };
  let first = out.len();
  let mut cluster_ticks = 0i64;
  loop {
    if rd.pos >= end.unwrap_or(rd.len) {
      break;
    }
    let c = rd.header()?;
    // A live-written cluster has no size: it ends where the next top-level element starts.
    if end.is_none() && is_top_level(c.id) {
      rd.rewind(c.len)?;
      break;
    }
    match c.id {
      ID_CLUSTER_TIMESTAMP => cluster_ticks = i64::try_from(uint(&rd.payload(&c, 8)?)?).unwrap_or(i64::MAX),
      ID_SIMPLE_BLOCK => {
        if let Some((rel, data)) = rd.block(&c, want)? {
          out.push(RawBlock { ticks: rel, duration_ticks: None, data });
        }
      }
      ID_BLOCK_GROUP => read_block_group(rd, &c, want, out)?,
      _ => rd.skip_element(&c)?,
    }
  }
  if let Some(end) = end {
    if rd.pos != end {
      return Err("corrupt file: a cluster is longer than it says".into());
    }
  }
  for b in &mut out[first..] {
    b.ticks = b.ticks.saturating_add(cluster_ticks);
  }
  Ok(())
}

/// Whether this is a Matroska or WebM file; reads the EBML header.
fn read_ebml_header<F: Read + Seek>(rd: &mut Rd<F>) -> Result<bool, String> {
  if rd.len < 4 {
    return Ok(false);
  }
  let mut magic = [0u8; 4];
  rd.fill(&mut magic)?;
  if u32::from_be_bytes(magic) != ID_EBML {
    return Ok(false);
  }
  rd.rewind(4)?;
  let h = rd.header()?;
  let body = rd.payload(&h, MAX_SMALL)?;
  let mut s = Slice::new(&body);
  while let Some((id, b)) = s.next()? {
    if id == ID_DOCTYPE {
      let doc = text(b);
      return Ok(doc == "matroska" || doc == "webm");
    }
  }
  // No DocType: EBML says the default is "matroska".
  Ok(true)
}

/// Load an element named in the SeekHead (Tracks or Info that sits after the clusters), then come back.
fn load_by_seek<F: Read + Seek>(rd: &mut Rd<F>, seg_start: u64, seeks: &HashMap<u32, u64>, id: u32) -> Result<Option<Vec<u8>>, String> {
  let Some(&at) = seeks.get(&id) else { return Ok(None) };
  let abs = seg_start.saturating_add(at);
  if abs >= rd.len {
    return Ok(None);
  }
  let back = rd.pos;
  rd.seek_to(abs)?;
  let h = rd.header()?;
  let body = if h.id == id { Some(rd.payload(&h, MAX_TRACKS)?) } else { None };
  rd.seek_to(back)?;
  Ok(body)
}

/// Check the track can be read as text and say which kind of file it becomes.
fn text_format(t: &Track) -> Result<&'static str, String> {
  if t.kind != TYPE_SUBTITLE {
    return Err(format!("Stream {} is not a subtitle track", t.index));
  }
  match t.codec_id.as_str() {
    "S_TEXT/UTF8" => Ok("srt"),
    "S_TEXT/ASS" | "S_TEXT/SSA" => Ok("ass"),
    "S_TEXT/WEBVTT" | "D_WEBVTT/SUBTITLES" | "D_WEBVTT/CAPTIONS" => Ok("vtt"),
    other => Err(format!(
      "Subtitle track {} is a picture subtitle ({}); only text subtitles can be read",
      t.index,
      codec_name(other)
    )),
  }
}

/// Walk the file. With `want` (a track index) it also collects that subtitle track's blocks;
/// without, it stops at the first cluster once the track list and info are known.
fn scan<F: Read + Seek>(f: F, want: Option<usize>) -> Result<Option<Parsed>, String> {
  let mut rd = Rd::new(f).map_err(|e| e.to_string())?;
  if !read_ebml_header(&mut rd)? {
    return Ok(None);
  }
  let mut p = Parsed { scale: 1_000_000, duration: None, tracks: None, blocks: Vec::new() };
  let mut have_info = false;
  let mut seeks = HashMap::new();
  let mut seg = None;
  while rd.pos < rd.len {
    let h = rd.header()?;
    if h.id == ID_SEGMENT {
      seg = Some(h);
      break;
    }
    rd.skip_element(&h)?;
  }
  let seg = seg.ok_or("this file has no Segment")?;
  let seg_end = seg.size.map_or(rd.len, |s| seg.start.saturating_add(s).min(rd.len));
  let mut wanted_number = None;
  while rd.pos < seg_end {
    let h = rd.header()?;
    match h.id {
      ID_SEGMENT | ID_EBML if seg.size.is_none() => {
        rd.rewind(h.len)?;
        break;
      }
      ID_SEEK_HEAD => parse_seek_head(&rd.payload(&h, MAX_SMALL)?, &mut seeks)?,
      ID_INFO => {
        let (scale, duration) = parse_info(&rd.payload(&h, MAX_SMALL)?)?;
        p.scale = scale;
        p.duration = duration;
        have_info = true;
      }
      ID_TRACKS => p.tracks = Some(parse_tracks(&rd.payload(&h, MAX_TRACKS)?)?),
      ID_CLUSTER => {
        if p.tracks.is_none() {
          if let Some(b) = load_by_seek(&mut rd, seg.start, &seeks, ID_TRACKS)? {
            p.tracks = Some(parse_tracks(&b)?);
          }
        }
        if !have_info {
          if let Some(b) = load_by_seek(&mut rd, seg.start, &seeks, ID_INFO)? {
            let (scale, duration) = parse_info(&b)?;
            p.scale = scale;
            p.duration = duration;
          }
          have_info = true;
        }
        let Some(tracks) = &p.tracks else {
          return Err("the track list comes after the video data, which is not supported".into());
        };
        match want {
          None => break,
          Some(index) => {
            if wanted_number.is_none() {
              let t = tracks.get(index).ok_or_else(|| format!("This file has no stream {index}"))?;
              text_format(t)?;
              wanted_number = Some(t.number);
            }
            read_cluster(&mut rd, &h, wanted_number.unwrap_or(0), &mut p.blocks)?;
          }
        }
      }
      _ => rd.skip_element(&h)?,
    }
  }
  if let (None, Some(tracks)) = (&wanted_number, &p.tracks) {
    // A file with no clusters at all still has to refuse a picture track.
    if let Some(index) = want {
      text_format(tracks.get(index).ok_or_else(|| format!("This file has no stream {index}"))?)?;
    }
  }
  if p.tracks.is_none() {
    return Err("this file has no track list".into());
  }
  Ok(Some(p))
}

// ---- track list ------------------------------------------------------------------------------

fn media_info(p: &Parsed) -> MediaInfo {
  let mut info = MediaInfo {
    duration: p.duration.map_or(0.0, |d| d * p.scale as f64 / 1e9),
    audio_tracks: vec![],
    subtitle_tracks: vec![],
    video_tracks: vec![],
  };
  if !info.duration.is_finite() {
    info.duration = 0.0;
  }
  for t in p.tracks.iter().flatten() {
    // Like the Matroska spec (and ffmpeg): Language, else the BCP 47 tag, else "eng"; "und" is no language.
    let language = t
      .language
      .clone()
      .or_else(|| t.bcp47.clone())
      .unwrap_or_else(|| "eng".to_string());
    let track = |kind| MediaTrack {
      index: t.index,
      kind,
      codec: codec_name(&t.codec_id),
      language: if language == "und" || language.is_empty() { None } else { Some(language.clone()) },
      title: t.name.clone().filter(|n| !n.is_empty()),
      default: t.default,
    };
    match t.kind {
      TYPE_VIDEO => info.video_tracks.push(track("video")),
      TYPE_AUDIO => info.audio_tracks.push(track("audio")),
      TYPE_SUBTITLE => info.subtitle_tracks.push(track("subtitle")),
      _ => {}
    }
  }
  info
}

/// The tracks of a Matroska/WebM file, or None when the file is something else.
pub fn tracks(path: &Path) -> Result<Option<MediaInfo>, String> {
  let f = std::fs::File::open(path).map_err(|e| fs_err(&e, "open", &path.to_string_lossy()))?;
  Ok(scan(f, None)?.map(|p| media_info(&p)))
}

// ---- extraction ------------------------------------------------------------------------------

/// Undo the track's ContentEncoding (zlib or stripped header bytes) on one block.
fn decode_block(t: &Track, data: Vec<u8>) -> Result<Vec<u8>, String> {
  let mut encodings: Vec<&Encoding> = t.encodings.iter().filter(|e| e.scope & 1 != 0).collect();
  // The highest order was applied last, so it is undone first.
  encodings.sort_by_key(|e| std::cmp::Reverse(e.order));
  let mut data = data;
  for e in encodings {
    if e.kind != 0 {
      return Err("this subtitle track is encrypted".into());
    }
    match e.algo {
      0 => {
        let mut out = Vec::new();
        ZlibDecoder::new(&data[..])
          .take(MAX_BLOCK + 1)
          .read_to_end(&mut out)
          .map_err(|_| "corrupt file: a compressed subtitle block does not inflate".to_string())?;
        if out.len() as u64 > MAX_BLOCK {
          return Err("corrupt file: a compressed subtitle block inflates past the size limit".into());
        }
        data = out;
      }
      3 => {
        let mut out = e.settings.clone();
        out.extend_from_slice(&data);
        data = out;
      }
      other => return Err(format!("this subtitle track uses compression method {other}, which is not supported")),
    }
  }
  Ok(data)
}

/// One cue: milliseconds, and the decoded payload.
struct Cue {
  start: i64,
  end: Option<i64>,
  data: String,
}

fn ticks_to_ms(ticks: i64, scale: u64) -> i64 {
  let ns = i128::from(ticks.max(0)) * i128::from(scale);
  i64::try_from((ns + 500_000) / 1_000_000).unwrap_or(i64::MAX)
}

fn cues(p: &Parsed, t: &Track) -> Result<Vec<Cue>, String> {
  if t.private_too_big {
    return Err("corrupt file: the subtitle header is too large".into());
  }
  let mut out = Vec::with_capacity(p.blocks.len());
  for b in &p.blocks {
    let data = decode_block(t, b.data.clone())?;
    let start = ticks_to_ms(b.ticks, p.scale);
    let end = b.duration_ticks.map(|d| ticks_to_ms(b.ticks.saturating_add(i64::try_from(d).unwrap_or(i64::MAX)), p.scale));
    out.push(Cue { start, end, data: String::from_utf8_lossy(&data).into_owned() });
  }
  Ok(out)
}

/// Give every cue without a duration the time until the next later cue, at most 10 seconds.
fn close_open_cues(cues: &mut [Cue]) {
  let starts: Vec<i64> = cues.iter().map(|c| c.start).collect();
  for (i, c) in cues.iter_mut().enumerate() {
    if c.end.is_none() {
      let next = starts[i + 1..].iter().copied().find(|&s| s > c.start);
      c.end = Some(c.start + next.map_or(MAX_OPEN_CUE_MS, |s| (s - c.start).min(MAX_OPEN_CUE_MS)));
    }
  }
}

fn split_ms(ms: i64) -> (i64, i64, i64, i64) {
  let ms = ms.max(0);
  (ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, ms % 1000)
}

/// `HH:MM:SS,mmm`
fn srt_time(ms: i64) -> String {
  let (h, m, s, f) = split_ms(ms);
  format!("{h:02}:{m:02}:{s:02},{f:03}")
}

/// `HH:MM:SS.mmm`
fn vtt_time(ms: i64) -> String {
  let (h, m, s, f) = split_ms(ms);
  format!("{h:02}:{m:02}:{s:02}.{f:03}")
}

/// `H:MM:SS.cc`
fn ass_time(ms: i64) -> String {
  let (h, m, s, f) = split_ms(ms);
  format!("{h}:{m:02}:{s:02}.{:02}", f / 10)
}

fn plain_text(s: &str) -> String {
  s.replace("\r\n", "\n").replace('\r', "\n").trim_matches('\n').to_string()
}

fn render_srt(mut cues: Vec<Cue>) -> String {
  cues.sort_by_key(|c| c.start);
  close_open_cues(&mut cues);
  let mut out = String::new();
  let mut n = 0;
  for c in &cues {
    let body = plain_text(&c.data);
    if body.is_empty() {
      continue;
    }
    n += 1;
    out.push_str(&format!("{n}\n{} --> {}\n{body}\n\n", srt_time(c.start), srt_time(c.end.unwrap_or(c.start))));
  }
  out
}

fn render_vtt(mut cues: Vec<Cue>) -> String {
  cues.sort_by_key(|c| c.start);
  close_open_cues(&mut cues);
  let mut out = String::from("WEBVTT\n\n");
  for c in &cues {
    let body = plain_text(&c.data);
    if body.is_empty() {
      continue;
    }
    out.push_str(&format!("{} --> {}\n{body}\n\n", vtt_time(c.start), vtt_time(c.end.unwrap_or(c.start))));
  }
  out
}

const ASS_FORMAT: &str = "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

/// The script header from CodecPrivate, made to end with an [Events] section and its Format line.
fn ass_header(private: &[u8]) -> String {
  let raw = String::from_utf8_lossy(private);
  let raw = raw.trim_start_matches('\u{feff}');
  let eol = if raw.contains("\r\n") { "\r\n" } else { "\n" };
  let mut head = raw.trim_end_matches(['\r', '\n']).to_string();
  let lower = head.to_ascii_lowercase();
  match lower.find("[events]") {
    None => {
      if !head.is_empty() {
        head.push_str(eol);
        head.push_str(eol);
      }
      head.push_str("[Events]");
      head.push_str(eol);
      head.push_str(ASS_FORMAT);
    }
    Some(at) => {
      if !lower[at..].lines().any(|l| l.trim_start().starts_with("format:")) {
        head.push_str(eol);
        head.push_str(ASS_FORMAT);
      }
    }
  }
  head.push_str(eol);
  head
}

/// Matroska stores `ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text`; the text may hold commas.
fn render_ass(cues: Vec<Cue>, private: &[u8]) -> String {
  let mut cues = cues;
  close_open_cues(&mut cues);
  let mut events: Vec<(u64, String)> = Vec::new();
  for (i, c) in cues.iter().enumerate() {
    let line = c.data.trim_end_matches(['\r', '\n']);
    let parts: Vec<&str> = line.splitn(9, ',').collect();
    if parts.len() < 9 {
      continue;
    }
    // A damaged ReadOrder keeps the block's place in the file.
    let order = parts[0].trim().parse::<u64>().unwrap_or(i as u64);
    events.push((
      order,
      format!(
        "Dialogue: {},{},{},{},{},{},{},{},{},{}",
        parts[1].trim(),
        ass_time(c.start),
        ass_time(c.end.unwrap_or(c.start)),
        parts[2],
        parts[3],
        parts[4],
        parts[5],
        parts[6],
        parts[7],
        parts[8]
      ),
    ));
  }
  events.sort_by_key(|e| e.0);
  let mut out = ass_header(private);
  let eol = if out.contains("\r\n") { "\r\n" } else { "\n" };
  for (_, line) in events {
    out.push_str(&line);
    out.push_str(eol);
  }
  out
}

/// The text of one subtitle track, and the file extension it belongs in.
fn subtitle_text<F: Read + Seek>(f: F, index: usize) -> Result<(String, &'static str), String> {
  let p = scan(f, Some(index))?.ok_or("This file is not a Matroska or WebM file")?;
  let t = p
    .tracks
    .as_ref()
    .and_then(|ts| ts.get(index))
    .ok_or_else(|| format!("This file has no stream {index}"))?;
  let ext = text_format(t)?;
  let cues = cues(&p, t)?;
  let body = match ext {
    "srt" => render_srt(cues),
    "vtt" => render_vtt(cues),
    _ => render_ass(cues, &t.private),
  };
  Ok((body, ext))
}

/// Write the subtitle track `index` to the temp folder and return the file's path. The name is the
/// one MediaAnalyzer.isTempSubtitlePath accepts, so the app deletes it when the video closes.
pub fn extract_subtitle(path: &Path, index: usize) -> Result<PathBuf, String> {
  let f = std::fs::File::open(path).map_err(|e| fs_err(&e, "open", &path.to_string_lossy()))?;
  let (body, ext) = subtitle_text(f, index)?;
  let ms = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_or(0, |d| d.as_millis());
  let out = std::env::temp_dir().join(format!("miteiru_subtitle_{ms}_{index}.{ext}"));
  std::fs::write(&out, body).map_err(|e| fs_err(&e, "write", &out.to_string_lossy()))?;
  Ok(out)
}

#[tauri::command]
pub async fn mkv_tracks(path: String) -> Result<Option<MediaInfo>, String> {
  tauri::async_runtime::spawn_blocking(move || tracks(Path::new(&path)))
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mkv_extract_subtitle(path: String, index: usize) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || extract_subtitle(Path::new(&path), index))
    .await
    .map_err(|e| e.to_string())?
    .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::{Cursor, Write};

  // A tiny EBML writer: enough to build the files the reader has to handle.
  fn id_bytes(id: u32) -> Vec<u8> {
    let b = id.to_be_bytes();
    let skip = b.iter().position(|&x| x != 0).unwrap_or(3);
    b[skip..].to_vec()
  }
  fn size_bytes(n: u64) -> Vec<u8> {
    for len in 1..=8u32 {
      if n < (1u64 << (7 * len)) - 1 {
        let mut v = (n | (1u64 << (7 * len))).to_be_bytes()[(8 - len as usize)..].to_vec();
        v.shrink_to_fit();
        return v;
      }
    }
    unreachable!()
  }
  fn el(id: u32, payload: &[u8]) -> Vec<u8> {
    let mut v = id_bytes(id);
    v.extend(size_bytes(payload.len() as u64));
    v.extend_from_slice(payload);
    v
  }
  fn unknown(id: u32, payload: &[u8]) -> Vec<u8> {
    let mut v = id_bytes(id);
    v.extend([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    v.extend_from_slice(payload);
    v
  }
  fn num(id: u32, n: u64) -> Vec<u8> {
    let b = n.to_be_bytes();
    let skip = b.iter().position(|&x| x != 0).unwrap_or(7);
    el(id, &b[skip..])
  }
  fn st(id: u32, s: &str) -> Vec<u8> {
    el(id, s.as_bytes())
  }
  fn cat(parts: &[Vec<u8>]) -> Vec<u8> {
    parts.concat()
  }

  fn header(doc: &str) -> Vec<u8> {
    el(ID_EBML, &cat(&[num(0x4286, 1), st(ID_DOCTYPE, doc), num(0x4287, 4)]))
  }
  fn info(duration_ms: f64) -> Vec<u8> {
    el(ID_INFO, &cat(&[num(ID_TIMESTAMP_SCALE, 1_000_000), el(ID_DURATION, &duration_ms.to_be_bytes())]))
  }
  struct T {
    number: u64,
    kind: u64,
    codec: &'static str,
    lang: Option<&'static str>,
    name: Option<&'static str>,
    private: Vec<u8>,
    extra: Vec<u8>,
    default: Option<u64>,
  }
  fn sub(number: u64, codec: &'static str) -> T {
    T { number, kind: 0x11, codec, lang: None, name: None, private: vec![], extra: vec![], default: None }
  }
  fn track_entry(t: &T) -> Vec<u8> {
    let mut parts = vec![num(ID_TRACK_NUMBER, t.number), num(ID_TRACK_TYPE, t.kind), st(ID_CODEC_ID, t.codec)];
    if let Some(l) = t.lang {
      parts.push(st(ID_LANGUAGE, l));
    }
    if let Some(n) = t.name {
      parts.push(st(ID_NAME, n));
    }
    if let Some(d) = t.default {
      parts.push(num(ID_FLAG_DEFAULT, d));
    }
    if !t.private.is_empty() {
      parts.push(el(ID_CODEC_PRIVATE, &t.private));
    }
    parts.push(t.extra.clone());
    el(ID_TRACK_ENTRY, &cat(&parts))
  }
  fn tracks_el(ts: &[T]) -> Vec<u8> {
    el(ID_TRACKS, &cat(&ts.iter().map(track_entry).collect::<Vec<_>>()))
  }
  fn block_bytes(track: u8, rel: i16, data: &[u8]) -> Vec<u8> {
    let mut b = vec![0x80 | track];
    b.extend(rel.to_be_bytes());
    b.push(0x80);
    b.extend_from_slice(data);
    b
  }
  fn simple(track: u8, rel: i16, data: &[u8]) -> Vec<u8> {
    el(ID_SIMPLE_BLOCK, &block_bytes(track, rel, data))
  }
  fn group(track: u8, rel: i16, dur: u64, data: &[u8]) -> Vec<u8> {
    el(ID_BLOCK_GROUP, &cat(&[el(ID_BLOCK, &block_bytes(track, rel, data)), num(ID_BLOCK_DURATION, dur)]))
  }
  fn cluster(ts: u64, items: &[Vec<u8>]) -> Vec<u8> {
    el(ID_CLUSTER, &cat(&[num(ID_CLUSTER_TIMESTAMP, ts), cat(items)]))
  }
  fn file(doc: &str, segment: &[Vec<u8>]) -> Vec<u8> {
    cat(&[header(doc), el(ID_SEGMENT, &cat(segment))])
  }
  fn extract(bytes: Vec<u8>, index: usize) -> Result<(String, &'static str), String> {
    subtitle_text(Cursor::new(bytes), index)
  }
  fn list(bytes: Vec<u8>) -> Result<Option<MediaInfo>, String> {
    Ok(scan(Cursor::new(bytes), None)?.map(|p| media_info(&p)))
  }

  fn srt_file() -> Vec<u8> {
    file(
      "matroska",
      &[
        info(5000.0),
        tracks_el(&[sub(1, "S_TEXT/UTF8")]),
        cluster(
          1000,
          &[simple(1, 500, "Second\nline".as_bytes()), group(1, 0, 1200, "First".as_bytes())],
        ),
      ],
    )
  }

  #[test]
  fn srt_blocks_become_sorted_cues_with_durations() {
    let (srt, ext) = extract(srt_file(), 0).unwrap();
    assert_eq!(ext, "srt");
    // The SimpleBlock has no duration: it lasts 10 s, its next cue never starts.
    assert_eq!(
      srt,
      "1\n00:00:01,000 --> 00:00:02,200\nFirst\n\n2\n00:00:01,500 --> 00:00:11,500\nSecond\nline\n\n"
    );
  }

  #[test]
  fn a_cue_without_duration_ends_at_the_next_cue() {
    let bytes = file(
      "matroska",
      &[
        tracks_el(&[sub(1, "S_TEXT/UTF8")]),
        cluster(0, &[simple(1, 0, b"a"), simple(1, 2000, b"b"), simple(1, 30000, b"c")]),
      ],
    );
    let (srt, _) = extract(bytes, 0).unwrap();
    assert!(srt.contains("00:00:00,000 --> 00:00:02,000\na"));
    assert!(srt.contains("00:00:02,000 --> 00:00:12,000\nb"));
  }

  #[test]
  fn tracks_listing_matches_ffprobe_shape() {
    let mut eng = sub(2, "S_TEXT/ASS");
    eng.lang = Some("eng");
    eng.name = Some("Dialogue");
    eng.default = Some(0);
    let mut jpn = sub(3, "S_HDMV/PGS");
    jpn.lang = Some("jpn");
    let video = T { kind: 1, ..sub(1, "V_MPEGH/ISO/HEVC") };
    let audio = T { kind: 2, lang: Some("und"), ..sub(4, "A_AAC") };
    let bytes = file("webm", &[info(65000.0), tracks_el(&[video, eng, jpn, audio])]);
    let got = list(bytes).unwrap().unwrap();
    assert_eq!(got.duration, 65.0);
    assert_eq!(got.video_tracks[0].codec, "hevc");
    assert_eq!(got.video_tracks[0].index, 0);
    // No Language element means "eng" by the spec.
    assert_eq!(got.video_tracks[0].language.as_deref(), Some("eng"));
    assert_eq!(got.subtitle_tracks.len(), 2);
    assert_eq!(got.subtitle_tracks[0].index, 1);
    assert_eq!(got.subtitle_tracks[0].codec, "ass");
    assert_eq!(got.subtitle_tracks[0].title.as_deref(), Some("Dialogue"));
    assert!(!got.subtitle_tracks[0].default);
    assert_eq!(got.subtitle_tracks[1].codec, "hdmv_pgs_subtitle");
    assert_eq!(got.subtitle_tracks[1].language.as_deref(), Some("jpn"));
    assert!(got.subtitle_tracks[1].default);
    assert_eq!(got.audio_tracks[0].index, 3);
    assert_eq!(got.audio_tracks[0].language, None);
    let json = serde_json::to_value(&got.subtitle_tracks[0]).unwrap();
    assert_eq!(json["type"], "subtitle");
    assert_eq!(json["default"], false);
  }

  #[test]
  fn bcp47_is_used_when_language_is_missing() {
    let mut t = sub(1, "S_TEXT/UTF8");
    t.extra = st(ID_LANGUAGE_BCP47, "ja-JP");
    let got = list(file("matroska", &[tracks_el(&[t])])).unwrap().unwrap();
    assert_eq!(got.subtitle_tracks[0].language.as_deref(), Some("ja-JP"));
  }

  #[test]
  fn listing_stops_at_the_first_cluster() {
    // Garbage after the first cluster is never read.
    let mut bytes = file("matroska", &[tracks_el(&[sub(1, "S_TEXT/UTF8")]), cluster(0, &[simple(1, 0, b"x")])]);
    bytes.extend([0xFF; 20]);
    assert!(list(bytes).unwrap().is_some());
  }

  #[test]
  fn tracks_after_the_clusters_are_found_through_the_seek_head() {
    let tracks = tracks_el(&[sub(1, "S_TEXT/UTF8")]);
    let cl = cluster(0, &[simple(1, 0, b"x")]);
    // The SeekHead's own size does not depend on its numbers because both are 2 bytes of payload.
    let seek = |pos: u64| {
      el(ID_SEEK_HEAD, &el(ID_SEEK, &cat(&[el(ID_SEEK_ID, &id_bytes(ID_TRACKS)), el(ID_SEEK_POSITION, &pos.to_be_bytes()[6..])])))
    };
    let head_len = seek(0).len() as u64;
    let bytes = file("matroska", &[seek(head_len + cl.len() as u64), cl, tracks]);
    let got = list(bytes).unwrap().unwrap();
    assert_eq!(got.subtitle_tracks.len(), 1);
  }

  #[test]
  fn ass_events_are_rebuilt_from_the_block_text() {
    let header = "[Script Info]\r\nScriptType: v4.00+\r\n\r\n[V4+ Styles]\r\nStyle: Default,Arial,20\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\n";
    let mut t = sub(1, "S_TEXT/ASS");
    t.private = header.as_bytes().to_vec();
    let bytes = file(
      "matroska",
      &[
        tracks_el(&[t]),
        cluster(
          61000,
          &[
            group(1, 10, 2500, b"1,0,Default,,0,0,0,,Second, with, commas"),
            group(1, 0, 1000, b"0,1,Sign,Bob,5,6,7,fx,{\\i1}First{\\i0}\\Nline"),
          ],
        ),
      ],
    );
    let (ass, ext) = extract(bytes, 0).unwrap();
    assert_eq!(ext, "ass");
    assert!(ass.starts_with(header));
    let events: Vec<&str> = ass.lines().filter(|l| l.starts_with("Dialogue:")).collect();
    assert_eq!(
      events,
      vec![
        "Dialogue: 1,0:01:01.00,0:01:02.00,Sign,Bob,5,6,7,fx,{\\i1}First{\\i0}\\Nline",
        "Dialogue: 0,0:01:01.01,0:01:03.51,Default,,0,0,0,,Second, with, commas",
      ]
    );
  }

  #[test]
  fn ass_header_gets_a_format_line_when_codec_private_lacks_one() {
    assert!(ass_header(b"[Script Info]\nTitle: x\n").contains("[Events]\nFormat: Layer, Start"));
    assert!(ass_header(b"[Script Info]\n[Events]\n").contains("[Events]\nFormat: Layer, Start"));
    assert_eq!(ass_header(b"[Events]\nFormat: A, B\n").matches("Format:").count(), 1);
  }

  #[test]
  fn webvtt_tracks_become_a_vtt_file() {
    let bytes = file("matroska", &[tracks_el(&[sub(1, "S_TEXT/WEBVTT")]), cluster(0, &[group(1, 1500, 500, b"Hello")])]);
    let (vtt, ext) = extract(bytes, 0).unwrap();
    assert_eq!(ext, "vtt");
    assert_eq!(vtt, "WEBVTT\n\n00:00:01.500 --> 00:00:02.000\nHello\n\n");
  }

  #[test]
  fn time_formats() {
    assert_eq!(srt_time(3_723_456), "01:02:03,456");
    assert_eq!(srt_time(0), "00:00:00,000");
    assert_eq!(ass_time(3_723_456), "1:02:03.45");
    assert_eq!(ass_time(59), "0:00:00.05");
    assert_eq!(vtt_time(36_000_001), "10:00:00.001");
  }

  fn zlib(data: &[u8]) -> Vec<u8> {
    let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    e.write_all(data).unwrap();
    e.finish().unwrap()
  }
  fn encodings(algo: u64, settings: &[u8]) -> Vec<u8> {
    let mut comp = vec![num(ID_COMP_ALGO, algo)];
    if !settings.is_empty() {
      comp.push(el(ID_COMP_SETTINGS, settings));
    }
    el(ID_CONTENT_ENCODINGS, &el(ID_CONTENT_ENCODING, &cat(&[num(ID_ENCODING_ORDER, 0), num(ID_ENCODING_SCOPE, 1), num(ID_ENCODING_TYPE, 0), el(ID_CONTENT_COMPRESSION, &cat(&comp))])))
  }

  #[test]
  fn zlib_compressed_blocks_are_inflated() {
    let mut t = sub(1, "S_TEXT/UTF8");
    t.extra = encodings(0, &[]);
    let bytes = file("matroska", &[tracks_el(&[t]), cluster(0, &[group(1, 0, 1000, &zlib("こんにちは".as_bytes()))])]);
    let (srt, _) = extract(bytes, 0).unwrap();
    assert!(srt.contains("こんにちは"));
  }

  #[test]
  fn stripped_header_bytes_are_put_back() {
    let mut t = sub(1, "S_TEXT/UTF8");
    t.extra = encodings(3, b"Hel");
    let bytes = file("matroska", &[tracks_el(&[t]), cluster(0, &[group(1, 0, 1000, b"lo")])]);
    let (srt, _) = extract(bytes, 0).unwrap();
    assert!(srt.contains("\nHello\n"));
  }

  #[test]
  fn a_zlib_bomb_is_refused() {
    let mut t = sub(1, "S_TEXT/UTF8");
    t.extra = encodings(0, &[]);
    let big = vec![b'a'; (MAX_BLOCK + 10) as usize];
    let bytes = file("matroska", &[tracks_el(&[t]), cluster(0, &[group(1, 0, 1000, &zlib(&big))])]);
    assert!(extract(bytes, 0).unwrap_err().contains("size limit"));
  }

  #[test]
  fn unknown_size_segment_and_clusters_end_at_the_next_top_level_element() {
    let first = unknown(ID_CLUSTER, &cat(&[num(ID_CLUSTER_TIMESTAMP, 0), group(1, 0, 1000, b"one")]));
    let second = unknown(ID_CLUSTER, &cat(&[num(ID_CLUSTER_TIMESTAMP, 5000), group(1, 0, 1000, b"two")]));
    let bytes = cat(&[
      header("matroska"),
      unknown(ID_SEGMENT, &cat(&[info(9000.0), tracks_el(&[sub(1, "S_TEXT/UTF8")]), first, second])),
    ]);
    let (srt, _) = extract(bytes, 0).unwrap();
    assert!(srt.contains("00:00:00,000 --> 00:00:01,000\none"));
    assert!(srt.contains("00:00:05,000 --> 00:00:06,000\ntwo"));
  }

  #[test]
  fn the_right_one_of_two_subtitle_tracks_is_extracted() {
    let bytes = file(
      "matroska",
      &[
        tracks_el(&[T { kind: 1, ..sub(1, "V_VP9") }, sub(2, "S_TEXT/UTF8"), sub(3, "S_TEXT/UTF8")]),
        cluster(0, &[simple(1, 0, b"video-bytes"), group(2, 0, 1000, b"english"), group(3, 0, 1000, b"japanese")]),
      ],
    );
    assert!(extract(bytes.clone(), 1).unwrap().0.contains("english"));
    let (second, _) = extract(bytes.clone(), 2).unwrap();
    assert!(second.contains("japanese") && !second.contains("english"));
    assert!(extract(bytes.clone(), 0).unwrap_err().contains("not a subtitle"));
    assert!(extract(bytes, 9).unwrap_err().contains("no stream 9"));
  }

  #[test]
  fn picture_subtitles_give_a_clear_error() {
    let bytes = file("matroska", &[tracks_el(&[sub(1, "S_HDMV/PGS")]), cluster(0, &[group(1, 0, 1000, b"img")])]);
    let err = extract(bytes, 0).unwrap_err();
    assert!(err.contains("picture subtitle") && err.contains("hdmv_pgs_subtitle"), "{err}");
  }

  #[test]
  fn lacing_on_a_subtitle_track_is_refused() {
    let mut block = block_bytes(1, 0, b"x");
    block[3] = 0x02;
    let bytes = file("matroska", &[tracks_el(&[sub(1, "S_TEXT/UTF8")]), cluster(0, &[el(ID_SIMPLE_BLOCK, &block)])]);
    assert!(extract(bytes, 0).unwrap_err().contains("lacing"));
  }

  #[test]
  fn other_files_are_not_matroska() {
    assert!(list(b"RIFF....AVI LIST".to_vec()).unwrap().is_none());
    assert!(list(vec![]).unwrap().is_none());
    assert!(list(vec![0x1A]).unwrap().is_none());
    let mp4 = [&[0, 0, 0, 0x18][..], b"ftypmp42"].concat();
    assert!(list(mp4).unwrap().is_none());
    assert!(list(file("other", &[])).unwrap().is_none());
    assert!(extract(b"not mkv at all".to_vec(), 0).is_err());
  }

  #[test]
  fn truncated_input_is_an_error_at_every_length() {
    let full = srt_file();
    for cut in 0..full.len() {
      let bytes = full[..cut].to_vec();
      // Either "not Matroska", an error, or (for a cut inside the clusters) a listing; never a panic.
      let _ = list(bytes.clone());
      let _ = extract(bytes, 0);
    }
    assert!(extract(full[..full.len() - 3].to_vec(), 0).is_err());
  }

  #[test]
  fn corrupt_sizes_do_not_allocate_or_panic() {
    // A Tracks element claiming 4 GB.
    let mut segment = id_bytes(ID_TRACKS);
    segment.extend([0x01, 0x00, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00]);
    let bytes = cat(&[header("matroska"), id_bytes(ID_SEGMENT), vec![0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF], segment]);
    assert!(list(bytes).is_err());
    // A block claiming 4 GB.
    let mut cl = id_bytes(ID_SIMPLE_BLOCK);
    cl.extend([0x08, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF]);
    let bytes = file("matroska", &[tracks_el(&[sub(1, "S_TEXT/UTF8")]), el(ID_CLUSTER, &cat(&[num(ID_CLUSTER_TIMESTAMP, 0), cl]))]);
    assert!(extract(bytes, 0).is_err());
    // Bad ids and sizes.
    assert!(list(cat(&[header("matroska"), vec![0x00, 0x80]])).is_err());
    assert!(list(cat(&[header("matroska"), vec![0x18, 0x53, 0x80, 0x67, 0x00]])).is_err());
  }

  #[test]
  fn random_bytes_after_a_valid_header_never_panic() {
    let mut seed = 0x1234_5678u32;
    let base = srt_file();
    for _ in 0..300 {
      let mut bytes = base.clone();
      for _ in 0..4 {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let at = (seed >> 8) as usize % bytes.len();
        bytes[at] = (seed >> 3) as u8;
      }
      let _ = list(bytes.clone());
      let _ = extract(bytes, 0);
    }
  }

  #[test]
  fn codec_names_follow_ffprobe() {
    for (id, name) in [("S_TEXT/UTF8", "subrip"), ("S_VOBSUB", "dvd_subtitle"), ("A_MPEG/L3", "mp3"), ("V_MPEG4/ISO/AVC", "h264"), ("V_MS/VFW/FOURCC", "v_ms/vfw/fourcc")] {
      assert_eq!(codec_name(id), name);
    }
  }

  // ---- real files: MITEIRU_MKV_FILE=<mkv> [MITEIRU_MKV_OUT=<dir>] cargo test --lib real_file -- --ignored --nocapture

  #[test]
  #[ignore]
  fn real_file_dump() {
    let Ok(path) = std::env::var("MITEIRU_MKV_FILE") else { return };
    let started = std::time::Instant::now();
    let info = tracks(Path::new(&path)).unwrap();
    let listed = started.elapsed();
    println!("TRACKS_MS {}", listed.as_secs_f64() * 1000.0);
    println!("TRACKS_JSON {}", serde_json::to_string(&info).unwrap());
    let Some(out) = std::env::var("MITEIRU_MKV_OUT").ok() else { return };
    for t in info.iter().flat_map(|i| &i.subtitle_tracks) {
      let started = std::time::Instant::now();
      match extract_subtitle(Path::new(&path), t.index) {
        Ok(p) => {
          let dest = Path::new(&out).join(format!("native_{}.{}", t.index, p.extension().unwrap().to_string_lossy()));
          std::fs::rename(&p, dest).or_else(|_| std::fs::copy(&p, Path::new(&out).join(format!("native_{}.{}", t.index, p.extension().unwrap().to_string_lossy()))).map(|_| ())).unwrap();
          println!("EXTRACT_MS {} {}", t.index, started.elapsed().as_secs_f64() * 1000.0);
        }
        Err(e) => println!("EXTRACT_ERR {} {e}", t.index),
      }
    }
  }
}
