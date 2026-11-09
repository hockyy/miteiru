//! Frequency-scored word lattice. Base data is immutable; app and user lexicons are independent.

use crate::lexicon::{ExtraWord, WordSource};
use cedarwood::Cedar;
use std::collections::BTreeMap;
use std::io::BufRead;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Language {
    #[default]
    Mandarin,
    Cantonese,
}

#[derive(Clone)]
struct Lexicon {
    trie: Cedar,
    costs: Vec<f64>,
}

impl Default for Lexicon {
    fn default() -> Self {
        Self {
            trie: Cedar::new(),
            costs: Vec::new(),
        }
    }
}

impl Lexicon {
    fn insert(&mut self, word: &str, cost: f64) {
        if let Some((index, _, _)) = self.trie.exact_match_search(word) {
            self.costs[index as usize] = cost;
        } else {
            self.trie.update(word, self.costs.len() as i32);
            self.costs.push(cost);
        }
    }

    fn cost(&self, word: &str) -> Option<f64> {
        self.trie
            .exact_match_search(word)
            .map(|(index, _, _)| self.costs[index as usize])
    }
}

struct Base {
    lexicon: Lexicon,
    unknown_cost: f64,
    extra_caps: [f64; 4],
    parts: Vec<u8>,
    name_weights: BTreeMap<char, f64>,
    name_median: f64,
    lexical_exceptions: BTreeMap<String, f64>,
}

#[derive(Clone)]
pub struct Tokenizer {
    base: Arc<Base>,
    app: Arc<Lexicon>,
    user: Lexicon,
    language: Language,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct OverlayStats {
    pub added: usize,
    pub filtered: usize,
    pub restored: usize,
}

impl Tokenizer {
    pub fn with_dict(reader: &mut impl BufRead, language: Language) -> Result<Self, String> {
        let mut lexicon = Lexicon::default();
        let mut frequencies = Vec::<u64>::new();
        let mut lengths = Vec::new();
        let mut parts = Vec::new();
        let mut allowed = Vec::new();
        let mut name_weights = BTreeMap::<char, f64>::new();
        let mut lexical_candidates = BTreeMap::<String, usize>::new();
        let mut line = String::new();
        let mut number = 0;
        while reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?
            != 0
        {
            number += 1;
            let mut fields = line.split_whitespace();
            if let Some(word) = fields.next() {
                if word.contains('\0') {
                    return Err(format!("line {number}: a word contains NUL"));
                }
                let frequency = fields
                    .next()
                    .unwrap_or("0")
                    .parse::<u64>()
                    .map_err(|error| format!("line {number}: invalid frequency: {error}"))?;
                let tag = fields.next().unwrap_or("");
                let part = if tag.starts_with("nr") {
                    b'R'
                } else {
                    tag.as_bytes().first().copied().unwrap_or(b'x')
                };
                let admissible = Self::grammatical_edge(word, part, language);
                let ambiguous = !admissible
                    && word
                        .chars()
                        .last()
                        .is_some_and(|letter| "過过着著".contains(letter));
                if part == b'R' {
                    for letter in word.chars().filter(|letter| is_han(*letter)) {
                        *name_weights.entry(letter).or_default() +=
                            (frequency.max(1) as f64).sqrt();
                    }
                }
                if let Some((index, _, _)) = lexicon.trie.exact_match_search(word) {
                    frequencies[index as usize] = frequency;
                    parts[index as usize] = part;
                    allowed[index as usize] = admissible;
                    if ambiguous {
                        lexical_candidates.insert(word.to_string(), index as usize);
                    }
                } else {
                    if ambiguous {
                        lexical_candidates.insert(word.to_string(), frequencies.len());
                    }
                    lexicon.insert(word, 0.0);
                    frequencies.push(frequency);
                    lengths.push(word.chars().count().min(3));
                    parts.push(part);
                    allowed.push(admissible);
                }
            }
            line.clear();
        }
        let total = frequencies
            .iter()
            .try_fold(0u64, |sum, value| sum.checked_add(*value))
            .ok_or("dictionary frequency total overflows")?;
        let unknown_cost = (total.max(1) as f64).ln();
        let lexical_exceptions = lexical_candidates
            .into_iter()
            .map(|(word, index)| (word, unknown_cost - (frequencies[index] as f64).ln()))
            .collect();
        let mut buckets: [Vec<u64>; 4] = std::array::from_fn(|_| Vec::new());
        for (index, frequency) in frequencies.into_iter().enumerate() {
            lexicon.costs[index] = if allowed[index] {
                unknown_cost - (frequency as f64).ln()
            } else {
                f64::INFINITY
            };
            if frequency > 0 {
                buckets[lengths[index]].push(frequency);
            }
        }
        let extra_caps = buckets.map(|mut bucket| {
            bucket.sort_unstable();
            unknown_cost - (bucket.get(bucket.len() * 9 / 10).copied().unwrap_or(1) as f64).ln()
        });
        let mut name_counts: Vec<_> = name_weights.values().copied().collect();
        name_counts.sort_unstable_by(f64::total_cmp);
        let name_median = name_counts
            .get(name_counts.len() / 2)
            .copied()
            .unwrap_or(1.0);
        Ok(Self {
            base: Arc::new(Base {
                lexicon,
                unknown_cost,
                extra_caps,
                parts,
                name_weights,
                name_median,
                lexical_exceptions,
            }),
            app: Arc::new(Lexicon::default()),
            user: Lexicon::default(),
            language,
        })
    }

    pub fn has_word(&self, word: &str) -> bool {
        !word.contains('\0')
            && (self.base.lexicon.cost(word).is_some() || self.app.cost(word).is_some())
    }

    pub fn word_count(&self) -> usize {
        self.base.lexicon.costs.len()
    }

    pub fn app_word_count(&self) -> usize {
        self.app.costs.len()
    }

    pub fn user_word_count(&self) -> usize {
        self.user.costs.len()
    }

    pub fn set_app_words<'a>(&mut self, words: impl IntoIterator<Item = &'a str>) -> OverlayStats {
        let mut overlay = Lexicon::default();
        let mut stats = OverlayStats::default();
        for word in words {
            if word.contains('\0') {
                stats.filtered += 1;
                continue;
            }
            if overlay.cost(word).is_some() {
                continue;
            }
            if let Some(cost) = self
                .base
                .lexical_exceptions
                .get(word)
                .filter(|cost| cost.is_finite())
            {
                overlay.insert(word, *cost);
                stats.restored += 1;
                continue;
            }
            if self.base.lexicon.cost(word).is_some() {
                continue;
            }
            if word.chars().count() < 2
                || !word.chars().all(is_han)
                || self.particle_ending(word)
                || self.productive_phrase(word)
                || !Self::grammatical_edge(word, b'x', self.language)
            {
                stats.filtered += 1;
                continue;
            }
            overlay.insert(word, self.extra_cost(word, WordSource::AppDictionary));
            stats.added += 1;
        }
        self.app = Arc::new(overlay);
        stats
    }

    pub fn replace_user_words(&mut self, words: &[ExtraWord]) -> Result<(), String> {
        let mut unique = BTreeMap::<&str, WordSource>::new();
        for word in words {
            if word.surface.is_empty()
                || word.surface.contains('\0')
                || word.surface.chars().count() > 128
            {
                return Err("extra words must contain 1..128 non-NUL characters".into());
            }
            unique
                .entry(&word.surface)
                .and_modify(|source| *source = (*source).max(word.source))
                .or_insert(word.source);
        }
        let mut overlay = Lexicon::default();
        for (word, source) in unique {
            overlay.insert(word, self.extra_cost(word, source));
        }
        self.user = overlay;
        Ok(())
    }

    fn particle_ending(&self, word: &str) -> bool {
        if matches!(word, "睡着" | "睡著" | "為咗") {
            return false;
        }
        let particles = match self.language {
            Language::Mandarin => "的地了着過过嗎吗吧呢啊呀唄呗嘛啦",
            Language::Cantonese => "嘅咗緊啲過啊呀呢啦喇囉啫啩噃嗱吖嘞㗎喎嚟都",
        };
        word.chars()
            .last()
            .is_some_and(|letter| particles.contains(letter))
    }

    fn part(&self, word: &str) -> u8 {
        self.base
            .lexicon
            .trie
            .exact_match_search(word)
            .map_or(b'x', |(index, _, _)| self.base.parts[index as usize])
    }

    fn productive_phrase(&self, word: &str) -> bool {
        let letters: Vec<_> = word.chars().collect();
        let first_end = letters[0].len_utf8();
        let first = &word[..first_end];
        let rest = &word[first_end..];
        if matches!(first, "每" | "又" | "仲" | "不") {
            return true;
        }
        if self.part(first) == b'v'
            && (rest.chars().count() >= 2 && self.part(rest) == b'n'
                || counted_form(rest)
                || "住吓先".contains(letters[letters.len() - 1])
                || letters.len() == 2 && letters[0] == letters[1])
        {
            return true;
        }
        if matches!(first, "去" | "嚟" | "來" | "来" | "有" | "冇")
            && rest.chars().count() >= 2
            && matches!(self.part(rest), b'n' | b'v')
        {
            return true;
        }
        if matches!(
            rest,
            "我" | "你" | "佢" | "他" | "她" | "它" | "您" | "我哋" | "你哋" | "佢哋"
        ) && (matches!(self.part(first), b'v' | b'p' | b'k')
            || matches!(first, "畀" | "比" | "给" | "給" | "為" | "为" | "跟" | "同"))
        {
            return true;
        }
        if letters.len() > 2
            && self.part(first) == b'v'
            && letters[1..letters.len() - 1]
                .iter()
                .any(|letter| "不得唔咗緊嘅啲".contains(*letter))
        {
            return true;
        }
        counted_form(word)
    }

    fn familiar_name(
        &self,
        text: &str,
        characters: &[(usize, char)],
        position: usize,
    ) -> Option<(usize, f64)> {
        let (start, prefix) = characters[position];
        if !matches!(prefix, '阿' | '小' | '老') {
            return None;
        }
        let &(given_start, given) = characters.get(position + 1)?;
        if !is_han(given)
            || "的是有不在和同與与個个到地得了著着過过嗎吗吧呢啊呀嘅咗緊啲㗎喇啦喎".contains(given)
        {
            return None;
        }
        let end = characters
            .get(position + 2)
            .map_or(text.len(), |item| item.0);
        let suffix = &text[given_start..];
        if self
            .base
            .lexicon
            .trie
            .common_prefix_iter(suffix)
            .any(|(index, offset)| {
                offset + 1 > given.len_utf8()
                    && self.base.parts[index as usize] != b'R'
                    && self.base.lexicon.costs[index as usize].is_finite()
            })
        {
            return None;
        }
        let weight = self
            .base
            .name_weights
            .get(&given)
            .copied()
            .unwrap_or(self.base.name_median / 2.0);
        let prefix_cost = self
            .base
            .lexicon
            .cost(&text[start..given_start])
            .unwrap_or(self.base.unknown_cost);
        let given_cost = self
            .base
            .lexicon
            .cost(&text[given_start..end])
            .unwrap_or(self.base.unknown_cost);
        Some((
            end,
            prefix_cost + given_cost - (1.0 + weight / self.base.name_median).min(4.0).ln(),
        ))
    }

    fn grammatical_edge(word: &str, part: u8, language: Language) -> bool {
        let mut letters = word.chars();
        let first = letters.next().unwrap();
        let Some(second) = letters.next() else {
            return true;
        };
        if counted_form(word) {
            return false;
        }
        if part == b'v' && counted_form(&word[first.len_utf8()..]) {
            return false;
        }
        if !is_han(first) || !is_han(second) {
            return true;
        }
        if matches!(word, "不是" | "還有" | "还有" | "仲有") {
            return false;
        }
        if matches!(first, '咱' | '我' | '你' | '他' | '她') && word.ends_with(['俩', '倆'])
        {
            return false;
        }
        if first == '每' && word.chars().count() == 2 && "次人個个年日月天位件份".contains(second)
        {
            return false;
        }
        if matches!(first, '這' | '这' | '那' | '呢' | '嗰')
            && letters.clone().next().is_none()
            && "個个隻只本間间條条位杯張张封件日天年".contains(second)
        {
            return false;
        }
        if "一不唔沒没".contains(second)
            && letters.next() == Some(first)
            && letters.next().is_none()
        {
            return false;
        }
        let last = word.chars().last().unwrap();
        if matches!(last, '們' | '们') && part != b'r' {
            return false;
        }
        match language {
            Language::Cantonese => {
                if matches!(word, "為咗" | "唔見") {
                    return true;
                }
                if first == '唔' && !matches!(word, "唔該" | "唔好") {
                    return false;
                }
                if "嘅咗㗎喇啦咩囉啫喎呀吖嘛呢噃嗱嘞啊".contains(last) {
                    return false;
                }
                if last == '緊' && !matches!(part, b'a' | b'd' | b't') {
                    return false;
                }
                if last == '過' && part == b'v' {
                    return false;
                }
                if last == '啲' && part != b'r' {
                    return false;
                }
            }
            Language::Mandarin => {
                if "的地了着著過过".contains(last)
                    && !matches!(part, b'n' | b'R' | b'c' | b'p')
                    && !matches!(word, "睡着" | "睡著")
                {
                    return false;
                }
                if word.contains(['得', '不']) && word.chars().count() > 2 && part == b'v' {
                    return false;
                }
            }
        }
        true
    }

    fn extra_cost(&self, word: &str, source: WordSource) -> f64 {
        let split_cost = self.base_fragment_cost(word);
        let gain: f64 = match source {
            WordSource::AppDictionary => 1.5,
            WordSource::UserAi => 4.0,
            WordSource::UserManual => 64.0,
        };
        let cost = split_cost - gain.ln();
        if source == WordSource::AppDictionary {
            cost.max(self.base.extra_caps[word.chars().count().min(3)])
        } else {
            cost
        }
    }

    fn base_fragment_cost(&self, word: &str) -> f64 {
        let split = self.cut_layers(word, false, false);
        split
            .iter()
            .map(|token| {
                self.base
                    .lexicon
                    .cost(token)
                    .unwrap_or(self.base.unknown_cost)
            })
            .sum()
    }

    fn titled_name(
        &self,
        text: &str,
        characters: &[(usize, char)],
        position: usize,
    ) -> Option<(usize, f64)> {
        let (start, first) = characters[position];
        if !is_han(first)
            || is_numeral(first)
            || "我你佢他她它是有在的地得了著着過过不無无冇呢嗰這这那".contains(first)
        {
            return None;
        }
        if position > 0 {
            let previous = characters[position - 1].1;
            if is_han(previous)
                && !"請请和同叫找替問问給给幫帮為为向跟讓让把對对".contains(previous)
            {
                return None;
            }
        }
        for length in [3, 2, 4] {
            let Some(&(end, _)) = characters.get(position + length) else {
                continue;
            };
            if !person_title(&text[end..]) {
                continue;
            }
            let word = &text[start..end];
            if !word.chars().all(is_han)
                || word.chars().any(|letter| {
                    is_numeral(letter) || "的地得了著着過过在是有不冇嘅咗緊啲".contains(letter)
                })
            {
                continue;
            }
            if length == 2 && self.part(&text[start..start + first.len_utf8()]) != b'R' {
                continue;
            }
            let middle = characters[position + 2].0;
            if self.base.lexicon.cost(&text[start..middle]).is_some()
                && self.part(&text[start..middle]) != b'R'
            {
                continue;
            }
            if length == 3
                && self.part(&text[start..start + first.len_utf8()]) != b'R'
                && self
                    .base
                    .lexicon
                    .cost(&text[characters[position + 1].0..end])
                    .is_some()
                && self.part(&text[characters[position + 1].0..end]) != b'R'
            {
                continue;
            }
            if length == 4 && self.part(&text[start..middle]) != b'R' {
                continue;
            }
            if self.base.lexicon.cost(word).is_some() && self.part(word) != b'R' {
                continue;
            }
            return Some((end, self.base_fragment_cost(word) - 4.0f64.ln()));
        }
        None
    }

    pub fn cut<'a>(&self, text: &'a str, oov: bool) -> Vec<&'a str> {
        self.cut_layers(text, oov, true)
    }

    fn cut_layers<'a>(&self, text: &'a str, oov: bool, overlays: bool) -> Vec<&'a str> {
        if text.is_empty() {
            return Vec::new();
        }
        let characters: Vec<_> = text.char_indices().collect();
        let (atoms, boundaries) = typed_atoms(text, &characters, oov);
        let mut route = vec![(f64::INFINITY, text.len()); text.len() + 1];
        route[text.len()] = (0.0, text.len());
        let mut ascii_end = text.len();
        for position in (0..characters.len()).rev() {
            let (start, letter) = characters[position];
            let end = characters
                .get(position + 1)
                .map_or(text.len(), |item| item.0);
            let mut fallback_end = end;
            if letter.is_ascii_alphanumeric() {
                let next = characters.get(position + 1).map(|item| item.1);
                if next.is_some_and(|next| next.is_ascii_alphanumeric()) {
                    fallback_end = ascii_end;
                } else if oov
                    && letter.is_ascii_digit()
                    && next == Some('.')
                    && characters
                        .get(position + 2)
                        .is_some_and(|item| item.1.is_ascii_digit())
                {
                    fallback_end = route[end].1;
                } else if oov && letter.is_ascii_digit() && next == Some('%') {
                    fallback_end = end + 1;
                }
                ascii_end = fallback_end;
            } else {
                if oov
                    && letter == '.'
                    && position > 0
                    && characters[position - 1].1.is_ascii_digit()
                    && characters
                        .get(position + 1)
                        .is_some_and(|item| item.1.is_ascii_digit())
                {
                    fallback_end = ascii_end;
                } else {
                    ascii_end = end;
                }
                if letter == '\r' && text[end..].starts_with('\n') {
                    fallback_end = end + 1;
                }
            }
            if let Some(atom_end) = atoms.get(start).copied().filter(|end| *end != 0) {
                fallback_end = atom_end;
            }
            let fallback = &text[start..fallback_end];
            let mut cost = self
                .base
                .lexicon
                .cost(fallback)
                .unwrap_or(self.base.unknown_cost);
            if oov && fallback.chars().count() > 1 && fallback.chars().all(is_numeral) {
                let component_cost: f64 = fallback
                    .char_indices()
                    .map(|(offset, letter)| {
                        self.base
                            .lexicon
                            .cost(&fallback[offset..offset + letter.len_utf8()])
                            .unwrap_or(self.base.unknown_cost)
                    })
                    .sum();
                cost = cost.min(component_cost - 2.0f64.ln());
            }
            let mut best = (cost + route[fallback_end].0, fallback_end);
            if oov {
                if let Some((name_end, name_cost)) = self.familiar_name(text, &characters, position)
                {
                    let candidate = (name_cost + route[name_end].0, name_end);
                    if candidate.0 < best.0 {
                        best = candidate;
                    }
                }
                if let Some((name_end, name_cost)) = self.titled_name(text, &characters, position) {
                    let candidate = (name_cost + route[name_end].0, name_end);
                    if candidate.0 < best.0 {
                        best = candidate;
                    }
                }
            }
            let suffix = &text[start..];
            for lexicon in [&self.base.lexicon].into_iter().chain(
                overlays
                    .then_some([self.app.as_ref(), &self.user])
                    .into_iter()
                    .flatten(),
            ) {
                if lexicon.costs.is_empty() {
                    continue;
                }
                if letter == '\0' {
                    continue;
                }
                for (index, offset) in lexicon.trie.common_prefix_iter(suffix) {
                    let end = start + offset + 1;
                    if !boundaries[end] {
                        continue;
                    }
                    if std::ptr::eq(lexicon, self.app.as_ref())
                        && !is_numeral(letter)
                        && text[start..end].chars().last().is_some_and(is_numeral)
                        && unit_prefix(&text[end..])
                    {
                        continue;
                    }
                    if !std::ptr::eq(lexicon, &self.user)
                        && position > 0
                        && text[start..end].ends_with('人')
                        && "個个班群位".contains(letter)
                        && text[start..end].chars().count() == 2
                        && (is_numeral(characters[position - 1].1)
                            || "半每成這这那呢嗰".contains(characters[position - 1].1))
                    {
                        continue;
                    }
                    let candidate = (lexicon.costs[index as usize] + route[end].0, end);
                    if candidate.0 < best.0 || (candidate.0 == best.0 && candidate.1 > best.1) {
                        best = candidate;
                    }
                }
            }
            route[start] = best;
        }
        let mut result = Vec::with_capacity(characters.len() / 2);
        let mut start = 0;
        while start < text.len() {
            let end = route[start].1;
            result.push(&text[start..end]);
            start = end;
        }
        result
    }
}

fn typed_atoms(text: &str, characters: &[(usize, char)], enabled: bool) -> (Vec<usize>, Vec<bool>) {
    let mut ends = vec![0; text.len() + 1];
    let mut boundaries = vec![true; text.len() + 1];
    if !enabled {
        return (ends, boundaries);
    }
    let mut position = 0;
    while position < characters.len() {
        let (start, first) = characters[position];
        let mut stop = position + 1;
        if first.is_whitespace() {
            while stop < characters.len() && characters[stop].1.is_whitespace() {
                stop += 1;
            }
        } else if first.is_ascii_alphanumeric()
            || matches!(first, '@' | '#')
                && characters
                    .get(stop)
                    .is_some_and(|item| item.1.is_ascii_alphanumeric())
        {
            while stop < characters.len() {
                let letter = characters[stop].1;
                let next = characters.get(stop + 1).map(|item| item.1);
                if letter.is_ascii_alphanumeric()
                    || letter == '_'
                    || matches!(letter, '-' | '\'' | '.')
                        && next.is_some_and(|letter| letter.is_ascii_alphanumeric())
                    || first.is_ascii_digit()
                        && letter == ':'
                        && next.is_some_and(|letter| letter.is_ascii_digit())
                    || first.is_ascii_digit() && letter == '%'
                {
                    stop += 1;
                } else {
                    break;
                }
            }
        } else if is_numeral(first) {
            while stop < characters.len() && is_numeral(characters[stop].1) {
                stop += 1;
            }
        }
        if stop > position + 1 {
            let end = characters.get(stop).map_or(text.len(), |item| item.0);
            ends[start] = end;
            if !is_numeral(first) {
                for &(inside, _) in &characters[position + 1..stop] {
                    boundaries[inside] = false;
                }
            }
        }
        position = stop;
    }
    (ends, boundaries)
}

fn is_numeral(letter: char) -> bool {
    "零〇一二三四五六七八九十百千萬万億亿兆兩两幾几廿卅卌".contains(letter)
}

fn counted_form(word: &str) -> bool {
    if matches!(
        word,
        "一点" | "一點" | "一会儿" | "一會兒" | "一会" | "一會"
    ) {
        return false;
    }
    let numeric = word.trim_start_matches(['第', '上', '下', '每', '頭', '头']);
    let suffix = numeric.trim_start_matches(|letter: char| {
        is_numeral(letter) || letter.is_ascii_digit() || ".半".contains(letter)
    });
    if suffix == numeric {
        return false;
    }
    if suffix.is_empty() {
        return word.starts_with('第');
    }
    matches!(
        suffix,
        "個" | "个"
            | "站"
            | "杯"
            | "張"
            | "张"
            | "雙"
            | "双"
            | "隻"
            | "只"
            | "本"
            | "碗"
            | "條"
            | "条"
            | "對"
            | "对"
            | "件"
            | "間"
            | "间"
            | "位"
            | "架"
            | "台"
            | "箱"
            | "次"
            | "句"
            | "份"
            | "口"
            | "聲"
            | "声"
            | "覺"
            | "觉"
            | "票"
            | "朵"
            | "封"
            | "公斤"
            | "台斤"
            | "公里"
            | "斤"
            | "分鐘"
            | "分钟"
            | "個鐘"
            | "年"
            | "日"
            | "月"
            | "天"
            | "點"
            | "点"
            | "元"
            | "蚊"
            | "度"
            | "歲"
            | "岁"
            | "小時"
            | "小时"
    )
}

fn unit_prefix(text: &str) -> bool {
    [
        "公斤", "公里", "台斤", "分鐘", "分钟", "小時", "小时", "個", "个", "張", "张", "箱", "句",
        "份", "次", "年", "日", "月", "天", "蚊", "元",
    ]
    .iter()
    .any(|unit| text.starts_with(unit))
}

fn person_title(text: &str) -> bool {
    match text.chars().next() {
        Some('先') => text.starts_with("先生"),
        Some('小') => text.starts_with("小姐"),
        Some('老') => ["老師", "老师", "老闆", "老板"]
            .iter()
            .any(|title| text.starts_with(title)),
        Some('師') => ["師兄", "師弟", "師姐", "師姊", "師傅", "師父", "師太"]
            .iter()
            .any(|title| text.starts_with(title)),
        Some('师') => ["师兄", "师弟", "师姐", "师傅", "师父", "师太"]
            .iter()
            .any(|title| text.starts_with(title)),
        Some('醫') => text.starts_with("醫生") || text.starts_with("醫師"),
        Some('医') => text.starts_with("医生") || text.starts_with("医师"),
        Some('主') => text.starts_with("主任"),
        Some('經') => text.starts_with("經理"),
        Some('经') => text.starts_with("经理"),
        Some('店') => text.starts_with("店長") || text.starts_with("店长"),
        Some('隊') => text.starts_with("隊長"),
        Some('队') => text.starts_with("队长"),
        Some('導') => text.starts_with("導遊") || text.starts_with("導演"),
        Some('导') => text.starts_with("导游") || text.starts_with("导演"),
        Some('伯') => text.starts_with("伯父") || text.starts_with("伯母"),
        Some('叔') => text.starts_with("叔叔") || text.starts_with("叔父"),
        Some('姑') => text.starts_with("姑娘") || text.starts_with("姑姑"),
        Some('警') => text.starts_with("警官"),
        Some('教') => text.starts_with("教授"),
        Some('同') => text.starts_with("同學") || text.starts_with("同学"),
        Some('總') => text.starts_with("總監"),
        Some('总') => text.starts_with("总监"),
        Some('院') => text.starts_with("院長") || text.starts_with("院长"),
        Some('大') => text.starts_with("大俠") || text.starts_with("大侠"),
        Some('護') => text.starts_with("護士"),
        Some('护') => text.starts_with("护士"),
        Some('少') => text.starts_with("少俠") || text.starts_with("少侠"),
        Some('女') => text.starts_with("女俠") || text.starts_with("女侠"),
        Some('掌') => text.starts_with("掌櫃") || text.starts_with("掌柜"),
        _ => false,
    }
}

pub fn is_han(letter: char) -> bool {
    matches!(letter as u32, 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff | 0x20000..=0x323af)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample() -> Tokenizer {
        Tokenizer::with_dict(
            &mut Cursor::new("我 100\n愛 100\n北京 1000 ns\n天安門 1000\n星際 10\n薯片 20\n"),
            Language::Mandarin,
        )
        .unwrap()
    }

    #[test]
    fn frequencies_choose_a_global_path_and_preserve_text() {
        let tokenizer = sample();
        assert_eq!(
            tokenizer.cut("我愛北京天安門", true),
            ["我", "愛", "北京", "天安門"]
        );
        for text in [
            "",
            "A股iPhone15！😀",
            "㐀𠮷𰻞\r\n 1.25%",
            "a\0b",
            "呢個App真係好用㗎喎！",
        ] {
            assert_eq!(tokenizer.cut(text, true).concat(), text);
        }
    }

    #[test]
    fn typed_oov_preserves_labels_numbers_and_whitespace() {
        let tokenizer = sample();
        assert_eq!(
            tokenizer.cut(
                "Wi-Fi USB-C don't @miki #tag v2.0 12:30 20% 五百\r\n  好",
                true
            ),
            [
                "Wi-Fi", " ", "USB-C", " ", "don't", " ", "@miki", " ", "#tag", " ", "v2.0", " ",
                "12:30", " ", "20%", " ", "五百", "\r\n  ", "好"
            ]
        );
    }

    #[test]
    fn familiar_names_do_not_consume_known_following_words() {
        let mut tokenizer = sample();
        assert_eq!(
            tokenizer.cut("小欣說阿偉問", true),
            ["小欣", "說", "阿偉", "問"]
        );
        tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("小 10 a\n老 10 a\n欣賞 100 v\n朋友 100 n\n"),
            Language::Mandarin,
        )
        .unwrap();
        assert_eq!(
            tokenizer.cut("小欣賞老朋友", true),
            ["小", "欣賞", "老", "朋友"]
        );
    }

    #[test]
    fn numeral_candidates_do_not_force_boundaries_inside_surrounding_words() {
        let tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("下 10\n周六 1000\n一起 1000\n下周 100\n六一 1\n起 1000\n"),
            Language::Mandarin,
        )
        .unwrap();
        assert_eq!(tokenizer.cut("下周六一起", true), ["下", "周六", "一起"]);
    }

    #[test]
    fn extra_headwords_cannot_glue_pronouns_particles_or_counters() {
        let mut tokenizer = Tokenizer::with_dict(
            &mut Cursor::new(
                "畀 100 v\n我 100 r\n有 100 r\n興趣 100 n\n找 100 v\n不 100 d\n到 100 v\n",
            ),
            Language::Cantonese,
        )
        .unwrap();
        let stats = tokenizer.set_app_words([
            "畀我",
            "有興趣",
            "找不到",
            "下一站",
            "半個鐘",
            "乜都",
            "食緊",
            "冰咖啡",
        ]);
        assert_eq!(stats.filtered, 7);
        assert_eq!(stats.added, 1);
    }

    #[test]
    fn approximate_numerals_keep_their_unit_separate() {
        let tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("十 1000 m\n幾 1000 m\n年 2000 t\n"),
            Language::Cantonese,
        )
        .unwrap();
        assert_eq!(tokenizer.cut("十幾年", true), ["十幾", "年"]);
    }

    #[test]
    fn context_can_recognize_a_new_person_name_without_inventing_a_noun_phrase() {
        let tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("先生 100 n\n老師 100 n\n公司 100 n\n"),
            Language::Mandarin,
        )
        .unwrap();
        assert_eq!(tokenizer.cut("汪聿新先生", true), ["汪聿新", "先生"]);
        assert_eq!(tokenizer.cut("貴公司老師", true), ["貴", "公司", "老師"]);
    }

    #[test]
    fn lookup_headwords_restore_lexical_uses_of_ambiguous_aspect_characters() {
        let mut tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("超 100 v\n過 100 u\n超過 1000 v\n"),
            Language::Mandarin,
        )
        .unwrap();
        assert_eq!(tokenizer.cut("超過", true), ["超", "過"]);
        let stats = tokenizer.set_app_words(["超過"]);
        assert_eq!(stats.restored, 1);
        assert_eq!(tokenizer.cut("超過", true), ["超過"]);
    }

    #[test]
    fn lexical_particles_and_small_quantity_words_are_not_plain_counters() {
        let tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("覺得 100 v\n記得 100 v\n一點 100 m\n辣椒 100 n\n"),
            Language::Mandarin,
        )
        .unwrap();
        assert_eq!(
            tokenizer.cut("覺得記得一點辣椒", true),
            ["覺得", "記得", "一點", "辣椒"]
        );
        let tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("為咗 100 p\n唔見 100 v\n"),
            Language::Cantonese,
        )
        .unwrap();
        assert_eq!(tokenizer.cut("為咗唔見", true), ["為咗", "唔見"]);
    }

    #[test]
    fn productive_function_phrases_split_but_manual_words_can_override_them() {
        let mut tokenizer = Tokenizer::with_dict(
            &mut Cursor::new("不是 100 c\n還有 100 c\n每次 100 r\n"),
            Language::Mandarin,
        )
        .unwrap();
        assert_eq!(
            tokenizer.cut("不是還有每次", true),
            ["不", "是", "還", "有", "每", "次"]
        );
        tokenizer
            .replace_user_words(&[ExtraWord {
                surface: "不是".into(),
                source: WordSource::UserManual,
            }])
            .unwrap();
        assert_eq!(tokenizer.cut("不是", true), ["不是"]);
    }

    #[test]
    fn a_manual_entry_competes_more_strongly_than_an_overlapping_ai_entry() {
        let mut tokenizer = sample();
        tokenizer
            .replace_user_words(&[
                ExtraWord {
                    surface: "星際".into(),
                    source: WordSource::UserManual,
                },
                ExtraWord {
                    surface: "星際薯片".into(),
                    source: WordSource::UserAi,
                },
            ])
            .unwrap();
        assert_eq!(tokenizer.cut("星際薯片", true), ["星際", "薯片"]);
    }

    #[test]
    fn replacement_is_light_atomic_and_reversible() {
        let mut tokenizer = sample();
        let base = tokenizer.base.clone();
        tokenizer
            .replace_user_words(&[ExtraWord {
                surface: "星際薯片".into(),
                source: WordSource::UserManual,
            }])
            .unwrap();
        assert_eq!(
            tokenizer.cut("我愛星際薯片", true),
            ["我", "愛", "星際薯片"]
        );
        assert!(tokenizer
            .replace_user_words(&[ExtraWord {
                surface: "\0".into(),
                source: WordSource::UserAi
            }])
            .is_err());
        assert_eq!(tokenizer.user_word_count(), 1);
        tokenizer.replace_user_words(&[]).unwrap();
        assert!(Arc::ptr_eq(&base, &tokenizer.base));
        assert_eq!(
            tokenizer.cut("我愛星際薯片", true),
            ["我", "愛", "星際", "薯片"]
        );
    }

    #[test]
    fn app_words_are_deduplicated_and_do_not_swallow_particles() {
        let mut tokenizer = sample();
        let stats = tokenizer.set_app_words(["星際薯片", "星際薯片", "北京", "北京的"]);
        assert_eq!(stats.added, 1);
        assert_eq!(stats.filtered, 1);
        assert!(tokenizer.has_word("星際薯片"));
    }

    #[test]
    fn malformed_and_duplicate_frequencies() {
        assert!(Tokenizer::with_dict(&mut Cursor::new("字 nope"), Language::Mandarin).is_err());
        let tokenizer =
            Tokenizer::with_dict(&mut Cursor::new("字 1\n字 3\n詞\n"), Language::Mandarin).unwrap();
        assert_eq!(tokenizer.word_count(), 2);
        assert_eq!(tokenizer.cut("詞字", true).concat(), "詞字");
    }
}
