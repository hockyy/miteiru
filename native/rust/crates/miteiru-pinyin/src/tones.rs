// Order matters for numToSymbol: vowels before ui/iu, then i/u, then syllabic consonants.
const MARKS: &[(&str, [&str; 5])] = &[
    ("a", ["a", "ā", "á", "ǎ", "à"]),
    ("o", ["o", "ō", "ó", "ǒ", "ò"]),
    ("e", ["e", "ē", "é", "ě", "è"]),
    ("ü", ["ü", "ǖ", "ǘ", "ǚ", "ǜ"]),
    ("v", ["ü", "ǖ", "ǘ", "ǚ", "ǜ"]),
    ("ui", ["ui", "uī", "uí", "uǐ", "uì"]),
    ("iu", ["iu", "iū", "iú", "iǔ", "iù"]),
    ("i", ["i", "ī", "í", "ǐ", "ì"]),
    ("u", ["u", "ū", "ú", "ǔ", "ù"]),
    ("n", ["n", "n̄", "ń", "ň", "ǹ"]),
    ("m", ["m", "m̄", "ḿ", "m̌", "m̀"]),
    ("ê", ["ê", "ê̄", "ế", "ê̌", "ề"]),
];

const VOWELS: &[(&str, [&str; 4])] = &[
    ("a", ["ā", "á", "ǎ", "à"]),
    ("o", ["ō", "ó", "ǒ", "ò"]),
    ("e", ["ē", "é", "ě", "è"]),
    ("i", ["ī", "í", "ǐ", "ì"]),
    ("u", ["ū", "ú", "ǔ", "ù"]),
    ("ü", ["ǖ", "ǘ", "ǚ", "ǜ"]),
    ("n", ["n̄", "ń", "ň", "ǹ"]),
    ("m", ["m̄", "ḿ", "m̌", "m̀"]),
    ("ê", ["ê̄", "ế", "ê̌", "ề"]),
];

pub(crate) fn tone(text: &str) -> Option<u8> {
    for number in 0..4 {
        if VOWELS.iter().any(|(_, row)| text.contains(row[number])) {
            return Some(number as u8 + 1);
        }
    }
    (text.contains(['a', 'o', 'e', 'i', 'u', 'ü', 'ê']) || text.ends_with(['n', 'm'])).then_some(0)
}

pub(crate) fn without_tone(text: &str) -> String {
    if text.is_ascii() {
        return text.to_owned();
    }
    // Each source mark is consumed once, like upstream's global regexp. A second combining
    // mark following the replacement remains part of the caller's original string.
    let mut rest = text;
    let mut plain = String::with_capacity(text.len());
    while let Some(ch) = rest.chars().next() {
        let matched = VOWELS.iter().find_map(|(base, marks)| {
            marks
                .iter()
                .find_map(|mark| rest.strip_prefix(mark).map(|tail| (*base, tail)))
        });
        if let Some((base, tail)) = matched {
            plain.push_str(base);
            rest = tail;
        } else {
            plain.push(ch);
            rest = &rest[ch.len_utf8()..];
        }
    }
    plain
}

pub(crate) fn numbered(text: &str) -> String {
    let mut result = without_tone(text);
    if let Some(tone) = tone(text) {
        result.push(char::from(b'0' + tone));
    }
    result
}

fn last_number(text: &str) -> Option<(usize, usize)> {
    let (offset, ch) = text.char_indices().next_back()?;
    match ch {
        '0'..='4' => Some((offset, (ch as u8 - b'0') as usize)),
        // JS Number(<one UTF-16 code unit>) also accepts ECMAScript whitespace as zero.
        '\u{0009}'..='\u{000d}'
        | ' '
        | '\u{00a0}'
        | '\u{1680}'
        | '\u{2000}'..='\u{200a}'
        | '\u{2028}'
        | '\u{2029}'
        | '\u{202f}'
        | '\u{205f}'
        | '\u{3000}'
        | '\u{feff}' => Some((offset, 0)),
        _ => None,
    }
}

fn num_to_symbol(syllable: &str) -> String {
    let stem = syllable
        .strip_suffix('r')
        .filter(|stem| stem.encode_utf16().count() > 1 && last_number(stem).is_some());
    let text = stem.unwrap_or(syllable);
    if let Some((offset, number)) = last_number(text) {
        for (key, row) in MARKS {
            if text.contains(key) {
                let mut marked = text[..offset].replacen(key, row[number], 1);
                if stem.is_some() {
                    marked.push('r');
                }
                return marked;
            }
        }
    }
    syllable.to_owned()
}

fn symbol_to_num(syllable: &str) -> String {
    if !matches!(syllable, "er" | "ēr" | "ér" | "ěr" | "èr") {
        if let Some(stem) = syllable.strip_suffix('r') {
            if tone(stem).is_some_and(|n| n != 0) {
                return numbered(stem) + "r";
            }
        }
    }
    numbered(syllable)
}

pub fn convert(text: &str, to_symbols: bool) -> String {
    let format = if to_symbols {
        num_to_symbol
    } else {
        symbol_to_num
    };
    text.split(' ').map(format).collect::<Vec<_>>().join(" ")
}
