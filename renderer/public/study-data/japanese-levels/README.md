# Japanese JLPT levels and word frequencies

`words.json` gives the language tools (the MCP's `levels.jlpt`, `levels.freq_rank` and
`levels.freq_zipf`) a JLPT level and a frequency for Japanese words. It is licensed under
**CC BY-SA 4.0**, like both of its sources ([LICENSE](LICENSE)); this folder's licence is separate
from Miteiru's own (CC BY-NC-SA 4.0).

## Sources

**JLPT levels.** [stephenmk/yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab),
commit `b062d4e38c4bdd0950ae1d4ec55f04b176182e03`, `original_data/n1.csv` … `n5.csv`, CC BY-SA 4.0
(its LICENSE.txt is reproduced as [LICENSE](LICENSE)). The lists are
[Jonathan Waller's JLPT Resources](http://www.tanos.co.uk/jlpt/) (CC BY), the lists jisho.org uses,
with the [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) entry id of each word added by that
project. Only the entry id, level, spelling and reading are copied; Waller's definitions are not.
Official JLPT vocabulary lists do not exist: these are an educated guess from 2010, and a few basic
grammar words are listed at N1 (と, さん, なんか). The level is shown as the source gives it.

**Word frequencies.** [wordfreq](https://github.com/rspeer/wordfreq) 3.2 by **Robyn Speer**, commit
`42233e6c36ce792031bcccfa17cdd0cec9af5fa7`, `wordfreq/data/large_ja.msgpack.gz`. wordfreq's code is
Apache-2.0 and its data files are CC BY-SA 4.0. Its Japanese list combines five sources: Wikipedia,
subtitles (OPUS OpenSubtitles 2018), web text, Twitter and Reddit, tokenized with MeCab and IPADIC,
the dictionary Miteiru's tokenizer reads. wordfreq's [NOTICE](NOTICE-wordfreq.md), reproduced
unchanged, gives the licences of all its sources and the credit they require. The data is a snapshot
of language use through about 2021 and, as its README says, is unlikely to be updated.

## Format

```json
{
  "meta": {"format": 2, "jlpt": {...}, "frequency": {..., "zipfMin": 3}},
  "jlpt": [[1579110, 5, "今日", "きょう"], [1579110, 3, "今日", "こんにち"], [1000320, 5, "", "あそこ"], ...],
  "frequency": [[128, ["の"]], [148, ["に"]], ...]
}
```

- `jlpt`: `[JMdict entry id (0 when the word has none), level 1–5 for N1–N5, kanji spelling or "" for a
  kana word, kana reading]`. One entry can be listed per reading at different levels: 今日 is きょう at
  N5 and こんにち at N3, so a lookup takes the entry and the reading
  (`main/language/japaneseLevels.ts`).
- `frequency`: wordfreq's buckets, `[centibels, words]`, most frequent first. A word in bucket `c` has a
  frequency of 10^(−c/100) and a Zipf value of 9 − c/100; words in one bucket share a rank. Only words
  with kana or kanji and at least Zipf 3 (once per million words) are kept: 28,302 words. A word with no
  rank is rarer than that, or is not counted as wordfreq tokenizes.

Regenerate from the repository root (it checks both licences before writing):

```sh
npx tsx scripts/data/buildJapaneseLevels.ts
```
