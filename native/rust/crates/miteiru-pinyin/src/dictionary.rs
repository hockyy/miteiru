use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Copy, Clone)]
struct Pattern {
    pinyin: &'static str,
    length: usize,
    probability: f64,
}

#[derive(Default)]
struct Node {
    children: HashMap<char, usize>,
    fail: usize,
    pattern: Option<Pattern>,
}

pub(crate) struct Dictionary {
    characters: HashMap<char, &'static str>,
    nodes: Vec<Node>,
}

static SOURCE: LazyLock<String> = LazyLock::new(|| {
    let bytes = zstd::stream::decode_all(&include_bytes!("../dictionary.tsv.zst")[..])
        .expect("embedded pinyin dictionary");
    String::from_utf8(bytes).expect("pinyin dictionary UTF-8")
});
pub(crate) static DICTIONARY: LazyLock<Dictionary> = LazyLock::new(|| Dictionary::build(&SOURCE));

impl Dictionary {
    pub fn syllables(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.characters
            .values()
            .copied()
            .chain(
                self.nodes
                    .iter()
                    .filter_map(|node| node.pattern.map(|p| p.pinyin)),
            )
            .flat_map(|readings| readings.split(' '))
            .chain(["", "yi", "bu", "yí", "yì", "bú", "liǎo", "tóng"])
    }

    fn build(data: &'static str) -> Self {
        let mut nodes = vec![Node::default()];
        let mut characters = HashMap::new();
        for line in data.lines() {
            let mut fields = line.split('\t');
            let size = fields.next().unwrap();
            let word = fields.next().unwrap();
            let pinyin = fields.next().unwrap();
            if size == "1" {
                characters.insert(word.chars().next().unwrap(), pinyin);
                continue;
            }
            let rule = size == "0";
            let length = if rule {
                word.chars().count()
            } else {
                size.parse().unwrap()
            };
            let probability = if rule { 1e-12 } else { 2e-8 };
            let mut index = 0;
            for ch in word.chars() {
                if let Some(&child) = nodes[index].children.get(&ch) {
                    index = child;
                } else {
                    let child = nodes.len();
                    nodes.push(Node::default());
                    nodes[index].children.insert(ch, child);
                    index = child;
                }
            }
            if nodes[index]
                .pattern
                .is_none_or(|old| probability >= old.probability)
            {
                nodes[index].pattern = Some(Pattern {
                    pinyin,
                    length,
                    probability,
                });
            }
        }
        // Aho-Corasick suffix links. All parents at the previous depth are ready first.
        let mut queue: Vec<usize> = nodes[0].children.values().copied().collect();
        let mut index = 0;
        while index < queue.len() {
            let parent = queue[index];
            index += 1;
            let edges: Vec<_> = nodes[parent]
                .children
                .iter()
                .map(|(&c, &child)| (c, child))
                .collect();
            for (ch, child) in edges {
                let mut suffix = nodes[parent].fail;
                while suffix != 0 && !nodes[suffix].children.contains_key(&ch) {
                    suffix = nodes[suffix].fail;
                }
                nodes[child].fail = nodes[suffix].children.get(&ch).copied().unwrap_or(0);
                queue.push(child);
            }
        }
        Self { characters, nodes }
    }

    pub fn all(&self, ch: char) -> Option<&'static str> {
        self.characters.get(&ch).copied()
    }
    pub fn first(&self, ch: char) -> Option<&'static str> {
        self.all(ch).and_then(|readings| readings.split(' ').next())
    }

    fn matches(&self, chars: &[char]) -> Vec<Hit> {
        let mut node = 0;
        let mut result = Vec::new();
        for (i, ch) in chars.iter().enumerate() {
            while node != 0 && !self.nodes[node].children.contains_key(ch) {
                node = self.nodes[node].fail;
            }
            node = self.nodes[node].children.get(ch).copied().unwrap_or(0);
            let mut suffix = node;
            while suffix != 0 {
                if let Some(pattern) = self.nodes[suffix].pattern {
                    result.push(Hit {
                        start: i + 1 - pattern.length,
                        pattern,
                    });
                }
                suffix = self.nodes[suffix].fail;
            }
        }
        result
    }

    pub fn phrases(&self, chars: &[char]) -> Vec<Hit> {
        let hits = self.matches(chars);
        let mut remaining = hits.iter().rev().peekable();
        let terminal = Path {
            probability: 1.0,
            decimal: 0,
            hit: None,
            next: chars.len(),
        };
        let mut paths = vec![None; chars.len() + 1];
        paths[chars.len()] = Some(terminal);
        for i in (0..chars.len()).rev() {
            let suffix = paths[i + 1].unwrap();
            let next = if suffix.hit.is_some() {
                i + 1
            } else {
                suffix.next
            };
            while let Some(&&hit) = remaining.peek() {
                if hit.start + hit.pattern.length != i + 1 {
                    break;
                }
                choose(
                    &mut paths[hit.start],
                    Path {
                        probability: hit.pattern.probability * suffix.probability,
                        decimal: suffix.decimal,
                        hit: Some(hit),
                        next,
                    },
                );
                remaining.next();
            }
            // The unknown-character branch in 3.29.3 starts its decimal counter at zero.
            choose(
                &mut paths[i],
                Path {
                    probability: 1e-13 * suffix.probability,
                    decimal: 0,
                    hit: None,
                    next,
                },
            );
        }
        let mut result = Vec::new();
        let mut index = 0;
        while index < chars.len() {
            let path = paths[index].unwrap();
            if let Some(hit) = path.hit {
                result.push(hit);
            }
            index = path.next;
        }
        result
    }
}

#[derive(Copy, Clone)]
pub(crate) struct Hit {
    pub start: usize,
    pattern: Pattern,
}

impl Hit {
    pub fn length(self) -> usize {
        self.pattern.length
    }
    pub fn pinyin(self) -> &'static str {
        self.pattern.pinyin
    }
}

#[derive(Copy, Clone)]
struct Path {
    probability: f64,
    decimal: usize,
    hit: Option<Hit>,
    next: usize,
}

fn choose(slot: &mut Option<Path>, mut candidate: Path) {
    if candidate.probability < 1e-300 {
        candidate.probability *= 1e300;
        candidate.decimal += 1;
    }
    if slot.is_none_or(|old| {
        candidate.decimal < old.decimal
            || (candidate.decimal == old.decimal && candidate.probability >= old.probability)
    }) {
        *slot = Some(candidate);
    }
}
