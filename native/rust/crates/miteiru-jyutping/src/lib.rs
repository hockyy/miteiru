//! Rust port of to-jyutping 3.1.1 by CanCLID (https://github.com/CanCLID/to-jyutping), BSD-2-Clause; see ../LICENSE.
//! Local changes from upstream:
//! - Embed the original packed trie with zstd and build it on the first Cantonese read.
//! - Keep the first pronunciation used by getJyutpingList and omit IPA, alternatives and customization.
//! - Return one optional reading per Unicode character, in batches of Jieba segments or whole lines.

use std::collections::HashMap;
use std::sync::LazyLock;

const ONSET: [&str; 20] = ["", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "ng", "gw", "kw", "w", "h", "z", "c", "s", "j"];
const NUCLEUS: [&str; 6] = ["aa", "a", "e", "i", "o", "u"];
const RHYME: [&str; 13] = ["oe", "oen", "oeng", "oet", "oek", "eoi", "eon", "eot", "yu", "yun", "yut", "m", "ng"];
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

static TRIE: LazyLock<Vec<Node>> = LazyLock::new(|| {
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
                if packed[offset] == '~' { offset += 1; } else { chars += 1; }
            }
            if nodes[node].reading.is_none() { nodes[node].reading = Some(syllables.join(" ")); }
        }
        match packed[offset] {
            '{' => { parents.push((node, depth)); offset += 1; }
            '}' => { parents.pop(); offset += 1; }
            _ => {} // Another key shares the current parent.
        }
    }
    nodes
});

pub fn readings(text: &str) -> Vec<Option<&'static str>> {
    let chars: Vec<char> = text.chars().collect();
    let mut result = Vec::with_capacity(chars.len());
    let mut start = 0;
    while start < chars.len() {
        let mut node = 0;
        let mut end = start + 1;
        let mut reading = None;
        for (index, ch) in chars.iter().enumerate().skip(start) {
            let Some(&child) = TRIE[node].children.get(ch) else { break };
            node = child;
            if let Some(value) = TRIE[node].reading.as_deref() {
                reading = Some(value);
                end = index + 1;
            }
        }
        if end == start + 1 {
            result.push(reading);
        } else if let Some(value) = reading {
            result.extend(value.split(' ').take(end - start).map(Some));
        }
        start = end;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn longest_word_astral_unknown_and_multisyllabic_character() {
        assert_eq!(readings("要求要𠵱🙂瓩"), [Some("jiu1"), Some("kau4"), Some("jiu3"), Some("ji1"), None, Some("cin1 ngaa5")]);
        assert!(readings("").is_empty());
    }
}
