use super::Token;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::OnceLock;
mod honorific;
mod repair;

pub const V1: u16 = 1;
pub const V5: u16 = 2;
pub const V5KS: u16 = 4;
pub const VS: u16 = 8;
pub const VK: u16 = 16;
pub const ADJI: u16 = 32;
pub const NA: u16 = 64;
pub const NOUN: u16 = 128;
const MASU: u16 = 256;
const TE: u16 = 512;
const NAI: u16 = 1024;
const ANY: u16 = u16::MAX;

pub fn pos_bits(tags: impl IntoIterator<Item = impl AsRef<str>>) -> u16 {
    tags.into_iter().fold(0, |bits, tag| {
        bits | match tag.as_ref() {
            "v1" | "v1-s" => V1,
            "v5k-s" => V5KS,
            "vs" | "vs-i" | "vs-s" | "vs-c" => VS,
            "vk" => VK,
            "adj-i" | "adj-ix" => ADJI,
            "adj-na" => NA,
            value if value.starts_with("v5") => V5,
            value if value == "n" || value.starts_with("n-") => NOUN,
            _ => 0,
        }
    })
}

struct Rule {
    from: String,
    to: String,
    input: u16,
    output: u16,
}

const GODAN: [(&str, &str, &str, &str, &str, &str, &str); 9] = [
    ("う", "い", "わ", "え", "お", "って", "った"),
    ("く", "き", "か", "け", "こ", "いて", "いた"),
    ("ぐ", "ぎ", "が", "げ", "ご", "いで", "いだ"),
    ("す", "し", "さ", "せ", "そ", "して", "した"),
    ("つ", "ち", "た", "て", "と", "って", "った"),
    ("ぬ", "に", "な", "ね", "の", "んで", "んだ"),
    ("ぶ", "び", "ば", "べ", "ぼ", "んで", "んだ"),
    ("む", "み", "ま", "め", "も", "んで", "んだ"),
    ("る", "り", "ら", "れ", "ろ", "って", "った"),
];

fn rules() -> &'static [Rule] {
    static RULES: OnceLock<Vec<Rule>> = OnceLock::new();
    RULES.get_or_init(|| {
        let mut rules = Vec::new();
        let mut add = |from: &str, to: &str, input, output| {
            rules.push(Rule {
                from: from.into(),
                to: to.into(),
                input,
                output,
            })
        };
        for (from, to) in [
            ("ません", "ます"),
            ("ました", "ます"),
            ("ませんでした", "ます"),
            ("ましょう", "ます"),
            ("まして", "ます"),
        ] {
            add(from, to, ANY, MASU);
        }
        for (from, to, input, output) in [
            ("かった", "い", ANY, ADJI | NAI),
            ("かったら", "い", ANY, ADJI | NAI),
            ("くない", "い", ADJI | NAI, ADJI),
            ("くて", "い", ANY, ADJI | NAI),
            ("ければ", "い", ANY, ADJI | NAI),
            ("さ", "い", ANY, ADJI),
            ("そう", "い", ANY, ADJI),
            ("ます", "る", MASU, V1),
            ("ない", "る", NAI, V1),
            ("た", "る", ANY, V1),
            ("たら", "る", ANY, V1),
            ("たり", "る", ANY, V1),
            ("て", "る", TE, V1),
            ("れば", "る", ANY, V1 | V5),
            ("られる", "る", V1, V1 | V5),
            ("れる", "る", V1, V1 | V5),
            ("させる", "る", V1, V1),
            ("たい", "る", ADJI, V1),
            ("そう", "る", ANY, V1),
            ("すぎる", "る", V1, V1),
            ("すぎる", "い", V1, ADJI),
            ("ちゃう", "てしまう", V5, TE),
            ("じゃう", "でしまう", V5, TE),
            ("とく", "ておく", V5, TE),
            ("どく", "でおく", V5, TE),
            ("なきゃ", "ない", ANY, NAI),
            ("なくちゃ", "ない", ANY, NAI),
            ("んだ", "", ANY, ANY),
            ("んです", "", ANY, ANY),
            ("んだった", "", ANY, ANY),
            ("っす", "", ANY, ANY),
            ("じゃん", "", ANY, ANY),
            ("っけ", "", ANY, ANY),
            ("らしい", "", ADJI, ANY),
            ("っぽい", "", ADJI, NOUN | NA),
            ("っぽい", "る", ADJI, V1),
            ("んじゃない", "", NAI | ADJI, ANY),
            ("たがる", "たい", V5, ADJI),
            ("がる", "い", V5, ADJI),
            ("んない", "らない", NAI, NAI),
            ("さそう", "い", ANY, ADJI | NAI),
            ("すぎる", "", V1, NA),
            ("よう", "る", ANY, V1),
            ("います", "る", MASU, V5),
            ("ませ", "ます", ANY, MASU),
            ("ないで", "ない", TE, NAI),
            ("くんない", "くれない", NAI, NAI),
            ("ちゃ", "て", TE, TE),
            ("じゃ", "で", TE, TE),
        ] {
            add(from, to, input, output);
        }
        for (ending, stem, negative, potential, volitional, te, past) in GODAN {
            let conditions = V5 | if ending == "く" { V5KS } else { 0 };
            add(&format!("{stem}ます"), ending, MASU, conditions);
            add(&format!("{negative}ない"), ending, NAI, conditions);
            add(&format!("{negative}れる"), ending, V1, conditions);
            add(&format!("{negative}せる"), ending, V1, conditions);
            add(&format!("{potential}る"), ending, V1, conditions);
            add(&format!("{potential}ば"), ending, ANY, conditions);
            add(&format!("{volitional}う"), ending, ANY, conditions);
            add(&format!("{stem}たい"), ending, ADJI, conditions);
            add(&format!("{stem}そう"), ending, ANY, conditions);
            add(&format!("{stem}すぎる"), ending, V1, conditions);
            add(&format!("{stem}っぽい"), ending, ADJI, conditions);
            let classes = V5;
            add(te, ending, TE, classes);
            add(past, ending, ANY, classes);
            add(&format!("{past}ら"), ending, ANY, classes);
            add(&format!("{past}り"), ending, ANY, classes);
        }
        add("って", "く", TE, V5KS);
        add("った", "く", ANY, V5KS);
        add("ったら", "く", ANY, V5KS);
        add("ったり", "く", ANY, V5KS);
        for ending in ["て", "で"] {
            for (auxiliary, input) in [
                ("いる", V1),
                ("る", V1),
                ("おく", V5),
                ("みる", V1),
                ("ある", V5),
                ("しまう", V5),
                ("いく", V5),
                ("くる", VK),
                ("いただく", V5),
                ("くださる", V5),
                ("ください", ANY),
                ("ほしい", ADJI),
                ("あげる", V1),
                ("もらう", V5),
                ("くれる", V1),
            ] {
                add(&format!("{ending}{auxiliary}"), ending, input | TE, TE);
            }
        }
        for (from, input) in [
            ("しない", NAI),
            ("します", MASU),
            ("した", ANY),
            ("したら", ANY),
            ("して", TE),
            ("される", V1),
            ("させる", V1),
            ("しよう", ANY),
            ("すれば", ANY),
        ] {
            add(from, "する", input, VS);
        }
        for (from, input) in [
            ("来ます", MASU),
            ("来た", ANY),
            ("来て", TE),
            ("来ない", NAI),
            ("来られる", V1),
            ("来れる", V1),
            ("きます", MASU),
            ("きた", ANY),
            ("きて", TE),
            ("こない", NAI),
        ] {
            add(
                from,
                if from.starts_with('来') {
                    "来る"
                } else {
                    "くる"
                },
                input,
                VK,
            );
        }
        rules
    })
}

pub fn deinflect(surface: &str) -> Vec<(String, u16)> {
    if surface.chars().count() > 64 {
        return Vec::new();
    }
    let mut queue = VecDeque::from([(surface.to_string(), ANY, 0)]);
    let mut seen = HashSet::from([(surface.to_string(), ANY)]);
    let mut candidates = Vec::new();
    while let Some((form, conditions, steps)) = queue.pop_front() {
        if steps >= 8 || seen.len() >= 256 {
            continue;
        }
        for rule in rules_for(&form) {
            if rule.input & conditions == 0 {
                continue;
            }
            let Some(prefix) = form.strip_suffix(&rule.from) else {
                continue;
            };
            if prefix.is_empty() && rule.from.chars().count() < 2 {
                continue;
            }
            let next = format!("{prefix}{}", rule.to);
            if next.is_empty() || !seen.insert((next.clone(), rule.output)) {
                continue;
            }
            candidates.push((next.clone(), rule.output));
            queue.push_back((next, rule.output, steps + 1));
        }
    }
    candidates
}

fn rules_for(form: &str) -> impl Iterator<Item = &'static Rule> {
    static ENDINGS: OnceLock<HashMap<char, Vec<usize>>> = OnceLock::new();
    let endings = ENDINGS.get_or_init(|| {
        let mut endings = HashMap::<char, Vec<usize>>::new();
        for (index, rule) in rules().iter().enumerate() {
            endings
                .entry(rule.from.chars().next_back().unwrap())
                .or_default()
                .push(index);
        }
        endings
    });
    form.chars()
        .next_back()
        .and_then(|last| endings.get(&last))
        .into_iter()
        .flatten()
        .map(|index| &rules()[*index])
}

pub(super) fn join(
    tokens: Vec<Token>,
    lemmas: &HashMap<Box<str>, u16>,
    mut tokenize: impl FnMut(&str) -> Vec<Token>,
) -> Vec<Token> {
    if lemmas.is_empty() {
        return tokens;
    }
    let tokens = repair::boundaries(tokens, lemmas, &mut tokenize);
    let tokens = honorific::compose(tokens, lemmas, &mut tokenize);
    let mut result = Vec::with_capacity(tokens.len());
    let mut start = 0;
    while start < tokens.len() {
        let original = &tokens[start];
        let mut corrected = None;
        if original.word_id >= 0
            && !lemmas.contains_key(original.basic_form.as_str())
            && matches!(original.pos.as_str(), "動詞" | "形容詞")
        {
            let allowed = if original.pos == "形容詞" {
                ADJI
            } else {
                V1 | V5 | V5KS | VS | VK
            };
            if let Some((base, _)) =
                deinflect(&original.surface_form)
                    .into_iter()
                    .find(|(form, conditions)| {
                        lemmas
                            .get(form.as_str())
                            .is_some_and(|bits| bits & conditions & allowed != 0)
                    })
            {
                let mut token = original.clone();
                token.basic_form = base;
                corrected = Some(token);
            }
        }
        let first = corrected.as_ref().unwrap_or(original);
        if let Some(next) = tokens
            .get(start + 1)
            .filter(|next| next.surface_form == "う")
        {
            let surface = format!("{}{}", first.surface_form, next.surface_form);
            if matches!(surface.as_str(), "だろう" | "でしょう")
                && lemmas.contains_key(surface.as_str())
            {
                let mut modal = first.clone();
                modal.surface_form = surface.clone();
                modal.basic_form = surface;
                modal.reading = first
                    .reading
                    .as_ref()
                    .zip(next.reading.as_ref())
                    .map(|(first, next)| format!("{first}{next}"));
                modal.pronunciation = first
                    .pronunciation
                    .as_ref()
                    .zip(next.pronunciation.as_ref())
                    .map(|(first, next)| format!("{first}{next}"));
                result.push(modal);
                start += 2;
                continue;
            }
        }
        let mut lookup_base = first.basic_form.clone();
        let mut lemma = lemmas.get(first.basic_form.as_str()).copied();
        let uncertain = first.pos == "助動詞" && first.conjugated_form == "体言接続";
        let recover = uncertain
            || (lemma.is_none()
                && first.word_type == "UNKNOWN"
                && first.surface_form.chars().count() >= 2
                && first.surface_form.chars().all(is_kana));
        if uncertain {
            lemma = None;
        }
        let mut best = start;
        let content =
            first.pos != "名詞" || !matches!(first.pos_detail_1.as_str(), "非自立" | "接尾" | "数");
        let verbal_auxiliary = first.pos == "助動詞"
            && lemma.is_some_and(|bits| bits & (V1 | V5 | V5KS | VS | VK) != 0);
        if first.word_id >= 0
            && content
            && (recover
                || verbal_auxiliary
                || matches!(first.pos.as_str(), "動詞" | "形容詞" | "名詞"))
        {
            if lemma.is_some() || recover {
                let mut surface = first.surface_form.clone();
                for (end, token) in tokens.iter().enumerate().skip(start + 1).take(15) {
                    if matches!(
                        token.basic_form.as_str(),
                        "らしい" | "じゃん" | "っす" | "っけ" | "よう" | "みたい"
                    ) || matches!(
                        token.surface_form.as_str(),
                        "の" | "だろ" | "だろう" | "でしょ" | "でしょう"
                    ) || (token.surface_form == "ん" && token.pos == "名詞")
                        || (token.surface_form == "じゃ"
                            && (first.pos != "動詞" || tokens[end - 1].conjugated_form == "基本形"))
                    {
                        break;
                    }
                    if token.pos == "助詞"
                        && !matches!(
                            token.surface_form.as_str(),
                            "て" | "で"
                                | "ちゃ"
                                | "じゃ"
                                | "ば"
                                | "たら"
                                | "だら"
                                | "たり"
                                | "だり"
                                | "ながら"
                        )
                    {
                        break;
                    }
                    if token.surface_form == "そう"
                        && (first.surface_form == first.basic_form
                            || tokens[end - 1].conjugated_type == "特殊・タ")
                    {
                        break;
                    }
                    if token.word_id < 0
                        || !token.surface_form.chars().all(|character| {
                            ('ぁ'..='ゖ').contains(&character) || character == 'ー'
                        })
                    {
                        break;
                    }
                    surface.push_str(&token.surface_form);
                    if surface.chars().count() > 48 {
                        break;
                    }
                    let candidates = deinflect(&surface);
                    if let Some(bits) = lemma {
                        if candidates.iter().any(|(form, conditions)| {
                            form == &lookup_base && conditions & bits != 0
                        }) {
                            best = end;
                        }
                    } else if let Some((base, _)) =
                        candidates.into_iter().find(|(form, conditions)| {
                            form.starts_with(&first.surface_form)
                                && form.chars().take(2).eq(surface.chars().take(2))
                                && lemmas.get(form.as_str()).is_some_and(|bits| {
                                    bits & conditions & (V1 | V5 | V5KS | VS | VK | ADJI) != 0
                                })
                        })
                    {
                        lookup_base = base;
                        lemma = lemmas.get(lookup_base.as_str()).copied();
                        best = end;
                    }
                }
            }
        }
        let mut joined = first.clone();
        if best > start {
            let chain = &tokens[start..=best];
            joined.surface_form = chain
                .iter()
                .map(|token| token.surface_form.as_str())
                .collect();
            joined.basic_form = lookup_base;
            if recover {
                joined.pos = if lemma.unwrap_or(0) & ADJI != 0 {
                    "形容詞"
                } else {
                    "動詞"
                }
                .into();
                joined.pos_detail_1 = "自立".into();
            }
            if first.pos != "動詞" {
                let lexical = lemmas
                    .get(joined.surface_form.as_str())
                    .copied()
                    .filter(|bits| bits & (ADJI | NOUN | NA) != 0)
                    .map(|bits| (joined.surface_form.clone(), bits))
                    .or_else(|| {
                        deinflect(&joined.surface_form).into_iter().find_map(
                            |(form, conditions)| {
                                lemmas
                                    .get(form.as_str())
                                    .copied()
                                    .filter(|bits| bits & conditions & (ADJI | NOUN | NA) != 0)
                                    .map(|bits| (form, bits))
                            },
                        )
                    });
                if let Some((base, bits)) = lexical {
                    joined.basic_form = base;
                    if bits & ADJI != 0 {
                        joined.pos = "形容詞".into();
                        joined.pos_detail_1 = "自立".into();
                        if let Some(adjective) =
                            chain.iter().rev().find(|token| token.pos == "形容詞")
                        {
                            joined.conjugated_type = adjective.conjugated_type.clone();
                        }
                    } else if bits & NOUN != 0 {
                        joined.pos = "名詞".into();
                        joined.pos_detail_1 = "一般".into();
                        joined.conjugated_type = "*".into();
                        joined.conjugated_form = "*".into();
                    }
                }
            }
            let reading = |token: &Token, spoken: bool| {
                let known = if spoken {
                    &token.pronunciation
                } else {
                    &token.reading
                };
                known.clone().or_else(|| {
                    token
                        .surface_form
                        .chars()
                        .all(is_kana)
                        .then(|| token.surface_form.clone())
                })
            };
            joined.reading = chain
                .iter()
                .map(|token| reading(token, false))
                .collect::<Option<Vec<_>>>()
                .map(|parts| parts.concat());
            joined.pronunciation = chain
                .iter()
                .map(|token| reading(token, true))
                .collect::<Option<Vec<_>>>()
                .map(|parts| parts.concat());
            joined.conjugated_form = tokens[best].conjugated_form.clone();
        }
        result.push(joined);
        start = best + 1;
    }
    result
}

fn is_kana(character: char) -> bool {
    matches!(character, 'ぁ'..='ゖ' | 'ァ'..='ヺ' | 'ー')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_suffix_rewrites_reach_dictionary_forms() {
        for (surface, base, condition) in [
            ("食べてる", "食べる", V1),
            ("食べちゃった", "食べる", V1),
            ("飲んじゃう", "飲む", V5),
            ("書いとく", "書く", V5),
            ("食べなきゃ", "食べる", V1),
            ("食べなくちゃ", "食べる", V1),
            ("食べたかった", "食べる", V1),
            ("食べそう", "食べる", V1),
            ("子供っぽい", "子供", NOUN),
            ("学生らしい", "学生", NOUN),
            ("高さ", "高い", ADJI),
            ("高すぎる", "高い", ADJI),
            ("学生っす", "学生", NOUN),
            ("食べたんだ", "食べる", V1),
            ("食べさせていただきます", "食べる", V1),
        ] {
            assert!(
                deinflect(surface)
                    .iter()
                    .any(|(form, bits)| form == base && bits & condition != 0),
                "{surface} -> {base}"
            );
        }
    }

    #[test]
    fn rejects_godan_classes_that_do_not_match() {
        assert!(!deinflect("書いた")
            .iter()
            .any(|(form, bits)| form == "書く" && bits & V5KS != 0));
        assert!(deinflect(&"食".repeat(65)).is_empty());
    }
}
