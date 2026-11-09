use std::io::Read;
use std::path::Path;

const MAX_ASSET: u64 = 128 * 1024 * 1024;

fn invalid(message: &str) -> String {
    format!("Invalid Japanese dictionary: {message}")
}

fn integer(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let raw = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| invalid("truncated integer"))?;
    Ok(u32::from_le_bytes(raw.try_into().unwrap()))
}

pub(super) fn short(bytes: &[u8], offset: usize) -> i16 {
    i16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

pub(super) struct Entries {
    pub data: Vec<u8>,
    features: Vec<u8>,
    spans: Vec<(u32, u32)>,
    ids: Vec<u32>,
}

impl Entries {
    fn load(mut data: Vec<u8>, mut features: Vec<u8>, map: Vec<u8>) -> Result<Self, String> {
        let count = integer(&map, 0)? as usize;
        if count > map.len() / 8 {
            return Err(invalid("too many mappings"));
        }
        let mut spans = Vec::with_capacity(count);
        let mut ids = Vec::new();
        let mut cursor = 4;
        let mut used = 0;
        for _ in 0..count {
            let key = integer(&map, cursor)? as usize;
            let length = integer(&map, cursor + 4)? as usize;
            cursor += 8;
            if key > map.len() / 4 || length > (map.len().saturating_sub(cursor)) / 4 {
                return Err(invalid("mapping outside file"));
            }
            spans.resize(spans.len().max(key + 1), (0, 0));
            spans[key] = (ids.len() as u32, length as u32);
            for _ in 0..length {
                let id = integer(&map, cursor)?;
                cursor += 4;
                if id as usize % 10 != 0 || id as usize + 10 > data.len() {
                    return Err(invalid("token outside file"));
                }
                let feature = integer(&data, id as usize + 6)? as usize;
                if feature >= features.len() {
                    return Err(invalid("feature outside file"));
                }
                used = used.max(id as usize + 10);
                ids.push(id);
            }
        }
        data.truncate(used);
        data.shrink_to_fit();
        features.truncate(
            features
                .iter()
                .rposition(|byte| *byte != 0)
                .map_or(0, |last| last + 2)
                .min(features.len()),
        );
        features.shrink_to_fit();
        let feature_text =
            std::str::from_utf8(&features).map_err(|_| invalid("features are not UTF-8"))?;
        if !features.ends_with(&[0]) {
            return Err(invalid("unterminated features"));
        }
        for id in &ids {
            let feature = integer(&data, *id as usize + 6)? as usize;
            if feature >= features.len() || !feature_text.is_char_boundary(feature) {
                return Err(invalid("feature points outside text"));
            }
        }
        spans.shrink_to_fit();
        ids.shrink_to_fit();
        Ok(Self {
            data,
            features,
            spans,
            ids,
        })
    }

    pub fn targets(&self, key: usize) -> &[u32] {
        let (start, length) = self.spans.get(key).copied().unwrap_or_default();
        &self.ids[start as usize..(start + length) as usize]
    }

    pub fn feature(&self, id: u32) -> &str {
        let offset = integer(&self.data, id as usize + 6).unwrap() as usize;
        let tail = &self.features[offset..];
        let length = tail
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(tail.len());
        std::str::from_utf8(&tail[..length]).unwrap_or("")
    }

    fn memory_bytes(&self) -> usize {
        self.data.len() + self.features.len() + self.spans.len() * 8 + self.ids.len() * 4
    }
}

#[derive(Clone, Copy)]
pub(super) struct Category {
    pub invoke: bool,
    pub group: bool,
}

pub(super) struct Dictionary {
    cells: Vec<(i32, i32)>,
    pub known: Entries,
    pub unknown: Entries,
    matrix: Vec<i16>,
    right_count: usize,
    characters: Vec<u8>,
    categories: Vec<Category>,
    default_category: usize,
}

impl Dictionary {
    pub fn load(mut read: impl FnMut(&str) -> Result<Vec<u8>, String>) -> Result<Self, String> {
        let base = read("base")?;
        let check = read("check")?;
        if base.len() != check.len() || base.len() < 4 || base.len() % 4 != 0 {
            return Err(invalid("bad double array"));
        }
        let cells = base
            .chunks_exact(4)
            .zip(check.chunks_exact(4))
            .map(|(base, check)| {
                (
                    i32::from_le_bytes(base.try_into().unwrap()),
                    i32::from_le_bytes(check.try_into().unwrap()),
                )
            })
            .collect();
        let known = Entries::load(read("tid")?, read("tid_pos")?, read("tid_map")?)?;
        let unknown = Entries::load(read("unk")?, read("unk_pos")?, read("unk_map")?)?;
        let raw_matrix = read("cc")?;
        if raw_matrix.len() < 4 {
            return Err(invalid("missing connection dimensions"));
        }
        let right_count = short(&raw_matrix, 0) as usize;
        let left_count = short(&raw_matrix, 2) as usize;
        if right_count == 0
            || left_count == 0
            || right_count
                .checked_mul(left_count)
                .and_then(|size| size.checked_mul(2))
                != Some(raw_matrix.len() - 4)
        {
            return Err(invalid("bad connection dimensions"));
        }
        let mut matrix = vec![0; right_count * left_count];
        for right in 0..right_count {
            for left in 0..left_count {
                matrix[left * right_count + right] =
                    short(&raw_matrix, (right * left_count + left) * 2 + 4);
            }
        }
        for entries in [&known, &unknown] {
            for id in &entries.ids {
                let offset = *id as usize;
                if short(&entries.data, offset) < 0
                    || short(&entries.data, offset) as usize >= left_count
                    || short(&entries.data, offset + 2) < 0
                    || short(&entries.data, offset + 2) as usize >= right_count
                {
                    return Err(invalid("context outside matrix"));
                }
            }
        }
        let characters = read("unk_char")?;
        let compatible = read("unk_compat")?;
        if characters.len() != 65536 || compatible.len() != 65536 * 4 {
            return Err(invalid("bad character definitions"));
        }
        let invoke = read("unk_invoke")?;
        let mut categories = Vec::new();
        let mut cursor = 0;
        let mut default_category = None;
        for id in 0..unknown.spans.len() {
            let flags = invoke
                .get(cursor..cursor + 6)
                .ok_or_else(|| invalid("truncated category"))?;
            let start = cursor + 6;
            let length = invoke[start..]
                .iter()
                .position(|byte| *byte == 0)
                .ok_or_else(|| invalid("unterminated category"))?;
            if &invoke[start..start + length] == b"DEFAULT" {
                default_category = Some(id);
            }
            categories.push(Category {
                invoke: flags[0] == 1,
                group: flags[1] == 1,
            });
            cursor = start + length + 1;
        }
        if characters
            .iter()
            .any(|id| *id as usize >= categories.len() || unknown.targets(*id as usize).is_empty())
        {
            return Err(invalid("unknown character category"));
        }
        Ok(Self {
            cells,
            known,
            unknown,
            matrix,
            right_count,
            characters,
            categories,
            default_category: default_category
                .ok_or_else(|| invalid("missing DEFAULT category"))?,
        })
    }

    pub fn category(&self, character: char) -> (usize, Category) {
        let id = self
            .characters
            .get(character as usize)
            .map_or(self.default_category, |id| *id as usize);
        (id, self.categories[id])
    }

    pub fn prefixes(&self, tail: &str, mut found: impl FnMut(usize, usize)) {
        let mut parent = 0;
        for (offset, byte) in tail.bytes().enumerate() {
            if byte == 0 {
                break;
            }
            let next = self.cells[parent].0 as i64 + byte as i64;
            let Some(&(base, check)) = usize::try_from(next)
                .ok()
                .and_then(|next| self.cells.get(next))
            else {
                break;
            };
            if check != parent as i32 {
                break;
            }
            parent = next as usize;
            if let Some(&(value, check)) = usize::try_from(base)
                .ok()
                .and_then(|end| self.cells.get(end))
            {
                if check == parent as i32 && value < 0 && tail.is_char_boundary(offset + 1) {
                    found(offset + 1, (-i64::from(value) - 1) as usize);
                }
            }
        }
    }

    pub fn has_surface(&self, surface: &str) -> bool {
        let mut present = false;
        self.prefixes(surface, |end, _| {
            present |= end == surface.len();
        });
        present
    }

    pub fn connection(&self, right: u16, left: u16) -> i32 {
        self.matrix[left as usize * self.right_count + right as usize] as i32
    }

    pub fn memory_bytes(&self) -> usize {
        self.cells.len() * 8
            + self.known.memory_bytes()
            + self.unknown.memory_bytes()
            + self.matrix.len() * 2
            + self.characters.len()
    }
}

pub fn gzip_asset(directory: &Path, name: &str) -> Result<Vec<u8>, String> {
    let path = directory.join(format!("{name}.dat.gz"));
    let file =
        std::fs::File::open(&path).map_err(|error| format!("{}: {error}", path.display()))?;
    let mut bytes = Vec::new();
    flate2::read::GzDecoder::new(file)
        .take(MAX_ASSET + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_ASSET {
        return Err(invalid("asset exceeds size limit"));
    }
    Ok(bytes)
}
