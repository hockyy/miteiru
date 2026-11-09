use super::{deinflect, Token};
use std::collections::HashMap;

pub(super) fn boundaries(
    mut tokens: Vec<Token>,
    lemmas: &HashMap<Box<str>, u16>,
    tokenize: &mut impl FnMut(&str) -> Vec<Token>,
) -> Vec<Token> {
    let mut start = 0;
    while start < tokens.len() {
        let first = &tokens[start];
        let Some(bits) = lemmas
            .get(first.basic_form.as_str())
            .copied()
            .filter(|_| first.word_id >= 0 && matches!(first.pos.as_str(), "動詞" | "形容詞"))
        else {
            start += 1;
            continue;
        };
        let base = first.basic_form.clone();
        let mut surface = first.surface_form.clone();
        for end in start + 1..tokens.len().min(start + 12) {
            let token = &tokens[end];
            if token.word_id < 0
                || !token
                    .surface_form
                    .chars()
                    .all(|character| ('ぁ'..='ゖ').contains(&character))
            {
                break;
            }
            if token.pos == "助詞"
                && !matches!(
                    token.surface_form.as_str(),
                    "て" | "で" | "ちゃ" | "じゃ" | "たら" | "だら" | "たり" | "だり" | "ば"
                )
            {
                break;
            }
            let mut replacement = None;
            for (offset, _) in token.surface_form.char_indices().skip(1) {
                // A real inflected auxiliary (e.g. ちゃわ + ない) is not a noun
                // that accidentally swallowed a final particle.
                if token.conjugated_type != "*" {
                    break;
                }
                let tail = &token.surface_form[offset..];
                if tail.chars().count() > 3
                    || !tail
                        .chars()
                        .all(|character| "かよねぞぜなのさわ".contains(character))
                {
                    continue;
                }
                let prefix = &token.surface_form[..offset];
                let candidate = format!("{surface}{prefix}");
                if candidate != base
                    && !deinflect(&candidate)
                        .iter()
                        .any(|(form, conditions)| form == &base && conditions & bits != 0)
                {
                    continue;
                }
                let mut head = token.clone();
                head.surface_form = prefix.into();
                head.word_type = "UNKNOWN".into();
                head.basic_form = "*".into();
                head.reading = Some(katakana(prefix));
                head.pronunciation = head.reading.clone();
                let mut pieces = vec![head];
                let mut position = token.word_position + prefix.chars().count();
                for character in tail.chars() {
                    let text = character.to_string();
                    for mut particle in tokenize(&text) {
                        particle.word_position = position;
                        position += particle.surface_form.chars().count();
                        pieces.push(particle);
                    }
                }
                replacement = Some(pieces);
                break;
            }
            if let Some(pieces) = replacement {
                tokens.splice(end..=end, pieces);
                break;
            }
            surface.push_str(&token.surface_form);
            if surface.chars().count() > 48 {
                break;
            }
        }
        start += 1;
    }
    tokens
}

fn katakana(text: &str) -> String {
    text.chars()
        .map(|character| {
            if ('ぁ'..='ゖ').contains(&character) {
                char::from_u32(character as u32 + 0x60).unwrap()
            } else {
                character
            }
        })
        .collect()
}
