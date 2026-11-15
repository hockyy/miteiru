//! Word costs for IPADIC entries carried over from the pyopenjtalk-plus dictionary
//! (data/ipadic-costs.tsv, made by scripts/data/buildJapaneseCosts.ts, which says what is carried
//! over and why; licences in NOTICE). They make the lattice prefer the readings and whole words that
//! dictionary's maintainers settled on (日本 にほん, 日本酒 as one word, 後 あと) without a second
//! dictionary: the entries are IPADIC's own, only their costs change.

use super::dictionary::Dictionary;

pub(super) const TABLE: &str = include_str!("../../data/ipadic-costs.tsv");

/// Whether an entry's features (surface, part of speech, three details, conjugation type and form,
/// base form, reading, pronunciation) have this part of speech and reading.
fn matches(feature: &str, part_of_speech: &str, reading: &str) -> bool {
    let mut fields = feature.split(',');
    fields.next();
    if !part_of_speech
        .split(',')
        .all(|wanted| fields.next() == Some(wanted))
    {
        return false;
    }
    fields.next();
    fields.next() == Some(reading)
}

/// Sets the word cost of every entry the table lists; returns how many entries changed. Lines that
/// match no entry (another IPADIC build) are skipped.
pub(super) fn apply(dictionary: &mut Dictionary, table: &str) -> usize {
    let mut parts_of_speech: Vec<&str> = Vec::new();
    let mut ids = Vec::new();
    let mut changed = 0;
    for line in table.lines() {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(part_of_speech) = line.strip_prefix('@') {
            parts_of_speech.push(part_of_speech);
            continue;
        }
        let mut fields = line.split('\t');
        let (Some(surface), Some(reading), Some(part_of_speech), Some(cost)) =
            (fields.next(), fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let (Some(part_of_speech), Ok(cost)) = (
            part_of_speech
                .parse::<usize>()
                .ok()
                .and_then(|index| parts_of_speech.get(index)),
            cost.parse::<i16>(),
        ) else {
            continue;
        };
        ids.clear();
        dictionary.prefixes(surface, |length, key| {
            if length == surface.len() {
                ids.extend_from_slice(dictionary.known.targets(key));
            }
        });
        for id in &ids {
            if matches(dictionary.known.feature(*id), part_of_speech, reading) {
                dictionary.known.set_cost(*id, cost);
                changed += 1;
            }
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_table_is_well_formed() {
        let mut parts_of_speech = 0;
        let mut entries = 0;
        for line in TABLE
            .lines()
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
        {
            if line.starts_with('@') {
                assert_eq!(line[1..].split(',').count(), 6, "{line}");
                parts_of_speech += 1;
                continue;
            }
            let fields: Vec<&str> = line.split('\t').collect();
            assert_eq!(fields.len(), 4, "{line}");
            assert!(
                fields[2]
                    .parse::<usize>()
                    .is_ok_and(|index| index < parts_of_speech),
                "{line}"
            );
            assert!(fields[3].parse::<i16>().is_ok(), "{line}");
            entries += 1;
        }
        assert!(entries > 10_000, "{entries}");
    }

    #[test]
    fn features_match_on_part_of_speech_and_reading() {
        let feature = "日本,名詞,固有名詞,地域,国,*,*,日本,ニホン,ニホン";
        assert!(matches(feature, "名詞,固有名詞,地域,国,*,*", "ニホン"));
        assert!(!matches(feature, "名詞,固有名詞,地域,国,*,*", "ニッポン"));
        assert!(!matches(feature, "名詞,一般,*,*,*,*", "ニホン"));
    }
}
