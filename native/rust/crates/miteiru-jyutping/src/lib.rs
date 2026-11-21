//! Rust port of to-jyutping 3.1.1 by CanCLID (https://github.com/CanCLID/to-jyutping), BSD-2-Clause; see ../LICENSE.
//! Local changes from upstream:
//! - Embed the original packed trie with zstd and build it on the first Cantonese read.
//! - Keep the first pronunciation used by getJyutpingList and omit IPA, alternatives and customization.
//! - Return one optional reading per Unicode character, in batches of Jieba segments or whole lines.

use std::collections::HashMap;
use std::sync::LazyLock;

const ONSET: [&str; 20] = [
  "", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "ng", "gw", "kw", "w", "h", "z", "c", "s", "j",
];
const NUCLEUS: [&str; 6] = ["aa", "a", "e", "i", "o", "u"];
const RHYME: [&str; 13] = [
  "oe", "oen", "oeng", "oet", "oek", "eoi", "eon", "eot", "yu", "yun", "yut", "m", "ng",
];
const CODA: [&str; 9] = ["", "i", "u", "m", "n", "ng", "p", "t", "k"];

fn decode(id: usize) -> String {
  let final_index = (id % 402) / 6;
  let mut syllable = ONSET[id / 402].to_owned();
  if final_index >= 54 {
    syllable.push_str(RHYME[final_index - 54]);
  } else {
    syllable.push_str(NUCLEUS[final_index / 9]);
    syllable.push_str(CODA[final_index % 9]);
  }
  syllable.push((b'1' + (id % 6) as u8) as char);
  syllable
}

#[derive(Default)]
struct Node {
  children: HashMap<char, usize>,
  reading: Option<String>,
}

struct Trie {
  nodes: Vec<Node>,
  // Direct first-character lookup for the BMP. Zero is the root and never a child.
  bmp: Vec<usize>,
}

static TRIE: LazyLock<Trie> = LazyLock::new(|| {
  let bytes = zstd::stream::decode_all(&include_bytes!("../trie.txt.zst")[..]).expect("embedded Jyutping dictionary");
  let packed: Vec<char> = std::str::from_utf8(&bytes).expect("Jyutping UTF-8").chars().collect();
  let mut nodes = vec![Node::default()];
  let mut parents = vec![(0, 0)];
  let mut offset = 1;
  while let Some(&(mut node, mut depth)) = parents.last() {
    while packed[offset] as u32 >= 256 {
      let child = nodes.len();
      nodes.push(Node::default());
      nodes[node].children.insert(packed[offset], child);
      node = child;
      depth += 1;
      offset += 1;
    }
    while (packed[offset] as u32) < 123 {
      let mut syllables = Vec::new();
      let mut chars = 0;
      while chars < depth {
        let id = (packed[offset] as usize - 33) * 90 + packed[offset + 1] as usize - 33;
        if nodes[node].reading.is_none() {
          syllables.push(decode(id));
        }
        offset += 2;
        if packed[offset] == '~' {
          offset += 1;
        } else {
          chars += 1;
        }
      }
      if nodes[node].reading.is_none() {
        nodes[node].reading = Some(syllables.join(" "));
      }
    }
    match packed[offset] {
      '{' => {
        parents.push((node, depth));
        offset += 1;
      }
      '}' => {
        parents.pop();
        offset += 1;
      }
      _ => {} // Another key shares the current parent.
    }
  }
  let mut bmp = vec![0; 65_536];
  for (&ch, &child) in &nodes[0].children {
    if let Some(slot) = bmp.get_mut(ch as usize) {
      *slot = child;
    }
  }
  Trie { nodes, bmp }
});

fn visit(text: &str, mut emit: impl FnMut(Option<&'static str>)) {
  let trie = &*TRIE;
  let mut chars = text.chars();
  while let Some(first) = chars.next() {
    let mut node = trie
      .bmp
      .get(first as usize)
      .copied()
      .unwrap_or_else(|| trie.nodes[0].children.get(&first).copied().unwrap_or(0));
    if node == 0 {
      emit(None);
      continue;
    }
    let mut extra = 0;
    let mut reading = trie.nodes[node].reading.as_deref();
    for (offset, ch) in chars.clone().enumerate() {
      let Some(&child) = trie.nodes[node].children.get(&ch) else {
        break;
      };
      node = child;
      if let Some(value) = trie.nodes[node].reading.as_deref() {
        reading = Some(value);
        extra = offset + 1;
      }
    }
    if extra == 0 {
      emit(reading);
    } else if let Some(value) = reading {
      for syllable in value.split(' ').take(extra + 1) {
        emit(Some(syllable));
      }
      chars.nth(extra - 1);
    }
  }
}

/// One ASCII reading per code point. An empty field means unknown, and the caller has the line lengths.
pub fn batch(texts: &[String]) -> String {
  let mut output = String::with_capacity(texts.iter().map(String::len).sum::<usize>() * 2);
  for text in texts {
    visit(text, |reading| {
      output.push_str(reading.unwrap_or(""));
      output.push('\n');
    });
  }
  output
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn longest_word_astral_unknown_and_multisyllabic_character() {
    assert_eq!(
      batch(&["要求要𠵱🙂瓩".into(), "".into()]),
      "jiu1\nkau4\njiu3\nji1\n\ncin1 ngaa5\n"
    );
  }
}
