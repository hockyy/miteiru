# Found, not changed

Miteiru preserves WanaKana 5.3.1’s output for subtitles and the headless API. These observations give a later accuracy change concrete inputs to test.

## Loanword readings

Of the 39 kana combinations in ALA-LC’s non-traditional Japanese chart, 35 produce a different string in WanaKana. The chart treats combinations such as ティ and ファ as single loanword syllables. WanaKana often emits both vowels, or adds a `y` for small ィ and ェ. The table gives the measured outputs and the chart’s spelling in matching order. [ALA-LC Japanese Romanization Table, chart B](https://www.loc.gov/catdir/cpso/romanization/japanese.pdf)

| Kana | WanaKana 5.3.1 | ALA-LC |
| --- | --- | --- |
| イェ | ie | ye |
| ウァ, ウィ, ウェ, ウォ | ua, ui, ue, uo | wa, wi, we, wo |
| クァ, クィ, クェ, クォ | kua, kyi, kye, kuo | kwa, kwi, kwe, kwo |
| グァ, グィ, グェ, グォ | gua, gui, gue, guo | gwa, gwi, gwe, gwo |
| スィ, ズィ | sui, zui | si, zi |
| スェ | sue | swe (see below) |
| ツァ, ツィ, ツェ, ツォ | tsua, tsui, tsue, tsuo | tsa, tsi, tse, tso |
| ティ, トゥ, テュ | tei, tou, teyu | ti, tu, tyu |
| ディ, ドゥ, デュ | dei, dou, deyu | di, du, dyu |
| ファ, フィ, フェ, フォ | fua, fyi, fye, fuo | fa, fi, fe, fo |
| フィェ | fyie | fye |
| ヴァ, ヴィ, ヴェ, ヴォ | vua, vyi, vye, vuo | va, vi, ve, vo |

スェ needs a convention decision. Chart B gives `swe`, while its note iii gives `sue`. For learner-facing ティ, ファ and ヴァ, Japan’s Agency for Cultural Affairs gives `ti`, `fa` and `va` in its kana teaching chart. Passport names use a different convention, including `TEI` for ティ and `FUA` for ファ. [Kana teaching chart](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/handbook/pdf/sp_04.pdf) · [Passport romanization](https://www.ezairyu.mofa.go.jp/passport/hebon.html)

## Script and spelling

| Input | WanaKana 5.3.1 | Candidate reading or classification and reason |
| --- | --- | --- |
| くゎ, ぐゎ | `kuゎ`, `guゎ` | `kwa`, `gwa` when transcribing the historical spelling. Modern pronunciation can depend on the word. [Agency for Cultural Affairs guidance](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kokugo_shisaku/pdf/94340701_01.pdf) |
| か followed by U+3099 | `ka゙` (Latin letters followed by a combining dakuten) | `ga`. The canonically equivalent precomposed が already gives `ga`. [Unicode normalization](https://www.unicode.org/reports/tr15/) |
| ウ followed by U+3099, then ァ | `u゙a` | Canonical equivalence with ヴァ gives the current `vua`. The learner-reading candidate for both spellings is `va`. [Unicode normalization](https://www.unicode.org/reports/tr15/) · [ALA-LC chart B](https://www.loc.gov/catdir/cpso/romanization/japanese.pdf) |
| ｺｰﾋｰ | `ｺｰﾋｰ` | `koohii`. Its full-width NFKC equivalent コーヒー already gives this reading with Miteiru’s spelled-out vowels. [Unicode normalization](https://www.unicode.org/reports/tr15/) |
| `isKanji` on 㐀, 龰, 﨑, 𠮷 | `false` for each | A Han-script check would return `true`. Upstream’s range ends at U+9FAF and excludes the extension and compatibility blocks. [Unicode character properties](https://www.unicode.org/Public/UCD/latest/ucd/PropList.txt) |

## Context-dependent output

An expressive ンー becomes `n`, ッー becomes an empty string, and コ・ー becomes `ko/o` because the middle dot retains the preceding vowel in the converter. A standalone っ before や or な disappears (`ya`, `na`). The intended duration or pause in these fragments needs a word, recording, or subtitle context before assigning a replacement.
