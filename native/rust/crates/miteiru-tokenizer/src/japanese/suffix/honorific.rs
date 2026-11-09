use super::{deinflect, is_kana, Token, GODAN, NOUN, V1, V5, V5KS, VK, VS};
use std::collections::HashMap;

type Lemmas = HashMap<Box<str>, u16>;

fn is_verb(form: &str, root: &str, allowed: u16, lemmas: &Lemmas) -> bool {
    lemmas.get(root).is_some_and(|bits| bits & allowed != 0)
        && (form == root
            || deinflect(form)
                .iter()
                .any(|(base, bits)| base == root && bits & allowed != 0))
}

fn stem_base(stem: &str, lemmas: &Lemmas) -> Option<String> {
    let mut candidates = vec![(format!("{stem}る"), V1)];
    for (ending, continuation, _, _, _, _, _) in GODAN {
        if let Some(prefix) = stem.strip_suffix(continuation) {
            candidates.push((
                format!("{prefix}{ending}"),
                V5 | if ending == "く" { V5KS } else { 0 },
            ));
        }
    }
    for (form, conditions) in candidates {
        if lemmas
            .get(form.as_str())
            .is_some_and(|bits| bits & conditions != 0)
        {
            return Some(form);
        }
        if let Some((base, _)) = deinflect(&form).into_iter().find(|(base, bits)| {
            lemmas
                .get(base.as_str())
                .is_some_and(|kind| kind & bits & (V1 | V5 | V5KS | VK) != 0)
        }) {
            return Some(base);
        }
    }
    None
}

fn honorific_base(surface: &str, lemmas: &Lemmas) -> Option<String> {
    let body = surface.strip_prefix('お')?;
    for (offset, _) in body.char_indices().skip(1) {
        let helper = &body[offset..];
        if !helper.starts_with(['し', 'す', 'く', 'い', 'に', '頂', '戴', '下']) {
            continue;
        }
        // A lexical suru noun (おかわり + する) remains nominal rather than
        // becoming an honorific of a homophonous verb (かわる).
        if lemmas
            .get(&surface[..'お'.len_utf8() + offset])
            .is_some_and(|bits| bits & (NOUN | VS) == (NOUN | VS))
        {
            continue;
        }
        let accepted = [
            ("する", VS),
            ("いたす", V5),
            ("いただく", V5),
            ("頂く", V5),
            ("戴く", V5),
            ("くださる", V5),
            ("下さる", V5),
        ]
        .iter()
        .any(|(root, kind)| is_verb(helper, root, *kind, lemmas))
            || helper
                .strip_prefix('に')
                .is_some_and(|form| is_verb(form, "なる", V5, lemmas));
        if accepted {
            if let Some(base) = stem_base(&body[..offset], lemmas) {
                return Some(base);
            }
        }
    }
    None
}

fn copula_base(surface: &str, lemmas: &Lemmas) -> Option<String> {
    let base = match surface {
        "だった" | "だったら" | "だったり" => "だ",
        "でした" | "でしたら" | "でして" => "です",
        "だろう" | "でしょう" => surface,
        _ => {
            if let Some(form) = surface.strip_prefix("じゃ") {
                if is_verb(form, "ない", super::ADJI, lemmas) {
                    return Some(
                        if lemmas.contains_key("じゃない") {
                            "じゃない"
                        } else {
                            "ない"
                        }
                        .into(),
                    );
                }
            }
            if let Some(form) = surface.strip_prefix('で') {
                if is_verb(form, "ござる", V5, lemmas) {
                    return Some(
                        if lemmas.contains_key("でござる") {
                            "でござる"
                        } else {
                            "ござる"
                        }
                        .into(),
                    );
                }
            }
            return None;
        }
    };
    lemmas.contains_key(base).then(|| base.to_string())
}

fn combined(
    chain: &[Token],
    base: String,
    verbal: bool,
    tokenize: &mut impl FnMut(&str) -> Vec<Token>,
) -> Token {
    let canonical = tokenize(&base);
    let mut token = canonical
        .into_iter()
        .find(|token| token.surface_form == base)
        .unwrap_or_else(|| chain[0].clone());
    token.word_position = chain[0].word_position;
    token.surface_form = chain
        .iter()
        .map(|token| token.surface_form.as_str())
        .collect();
    token.basic_form = base;
    token.pos = if verbal { "動詞" } else { "助動詞" }.into();
    token.pos_detail_1 = if verbal { "自立" } else { "*" }.into();
    token.pos_detail_2 = "*".into();
    token.pos_detail_3 = "*".into();
    token.conjugated_form = chain.last().unwrap().conjugated_form.clone();
    let reading = |spoken| {
        chain
            .iter()
            .map(|part| {
                let known = if spoken {
                    &part.pronunciation
                } else {
                    &part.reading
                };
                known.clone().or_else(|| {
                    part.surface_form
                        .chars()
                        .all(is_kana)
                        .then(|| part.surface_form.clone())
                })
            })
            .collect::<Option<Vec<_>>>()
            .map(|parts| parts.concat())
    };
    token.reading = reading(false);
    token.pronunciation = reading(true);
    token
}

pub(super) fn compose(
    tokens: Vec<Token>,
    lemmas: &Lemmas,
    tokenize: &mut impl FnMut(&str) -> Vec<Token>,
) -> Vec<Token> {
    let mut result = Vec::with_capacity(tokens.len());
    let mut start = 0;
    while start < tokens.len() {
        let first = &tokens[start];
        let honorific = first.surface_form == "お" && first.pos == "接頭詞";
        let copula = first.pos == "助動詞" || first.surface_form == "じゃ";
        let mut best = None;
        if first.word_id >= 0 && (honorific || copula) {
            let mut surface = first.surface_form.clone();
            for (end, next) in tokens.iter().enumerate().skip(start + 1).take(15) {
                if next.word_id < 0
                    || matches!(next.pos.as_str(), "記号" | "接続詞")
                    || next.surface_form.chars().any(char::is_whitespace)
                {
                    break;
                }
                if next.pos == "助詞"
                    && !matches!(next.surface_form.as_str(), "に" | "て" | "で" | "ば")
                {
                    break;
                }
                surface.push_str(&next.surface_form);
                if surface.chars().count() > 48 {
                    break;
                }
                let base = if honorific {
                    honorific_base(&surface, lemmas)
                } else {
                    copula_base(&surface, lemmas)
                };
                if let Some(base) = base {
                    best = Some((end, base));
                }
            }
        }
        if let Some((end, base)) = best {
            result.push(combined(&tokens[start..=end], base, honorific, tokenize));
            start = end + 1;
        } else {
            result.push(first.clone());
            start += 1;
        }
    }
    result
}
