# Local API and MCP

Miteiru's language facts (word splitting, readings, ruby, dictionary glosses, levels, pitch accent, tones, conjugations and the learner's saved words) are available to other programs in two ways:

- **With Miteiru open**, the app answers a small HTTP API on `127.0.0.1`, and `miteiru --mcp` connects AI assistants to it. See [Connect an AI assistant](#connect-an-ai-assistant).
- **With Miteiru closed**, the [headless server](#the-headless-server-miteiru-closed) answers the same MCP tools from a checkout of this repository, with the same code, tokenizers and dictionaries, without opening a window.

Every fact comes from Miteiru's tokenizers and the dictionaries installed on this computer, never from a language model.

The Python CLI that used to live in `scripts/miteiru_cli.py` is gone. Its `health` command is `GET /health`, and its `analyze` command is `POST /analyze`, `POST /analyze-batch` or the `analyze_text` tool.

## Connect an AI assistant

**Settings → AI → AI assistants** in Miteiru shows both setups below with this computer's path filled in, ready to copy.

Claude Code:

```bash
claude mcp add miteiru -- "<path to miteiru>" --mcp
```

Other apps that take MCP servers (Claude Desktop, Cursor, Codex and others) take the same command in their settings:

```json
{
  "mcpServers": {
    "miteiru": {
      "command": "<path to miteiru>",
      "args": ["--mcp"]
    }
  }
}
```

| System | Path to miteiru |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Miteiru\miteiru.exe` (as a full path: `C:\Users\<you>\AppData\Local\Miteiru\miteiru.exe`) |
| macOS | `/Applications/Miteiru.app/Contents/MacOS/miteiru` |
| Linux | `/usr/bin/miteiru` from the `.deb`, or the `.AppImage` file itself |

`miteiru --mcp` doesn't open a window. It speaks MCP over stdin and stdout, answers the handshake and the tool list by itself so the assistant connects even while Miteiru is closed, and passes each tool call to the open app (`POST /mcp` below). When the app is closed, a tool call answers that Miteiru isn't open. A development build (`tauri dev`) is found too. A call the assistant cancels gets no answer; the app still finishes it. A client may write its requests and close stdin at once: every call still running is answered before `miteiru --mcp` exits. A registration left by an app that has closed is skipped without trying its port.

`miteiru --mcp --headless` is not part of the app: an installed Miteiru has no Node runtime, and its language code runs inside the app's window. Given `--headless`, `miteiru --mcp` says so on stderr and works as above. With Miteiru closed, use the headless server below.

On a Mac, open Miteiru from the Applications folder before copying the command: an app opened straight from Downloads runs from a temporary copy whose path changes on every launch, and Settings says so.

## The headless server (Miteiru closed)

A stdio MCP server that runs Miteiru's own language code (`main/`) in Node, tokenizes with the app's own Rust tokenizers through a small Node addon (`native/rust/crates/miteiru-node`), and reads the installed app's language packs, settings and saved words. It never opens a window and needs Miteiru neither open nor running.

From a checkout of this repository:

```bash
node <repo>/scripts/miteiru-mcp.mjs
```

or `npm run --silent mcp` in the repository (the `--silent` matters: npm otherwise prints a banner on stdout, which is the MCP channel). For an MCP client:

```json
{
  "mcpServers": {
    "miteiru": {
      "command": "node",
      "args": ["C:/path/to/miteiru/scripts/miteiru-mcp.mjs"]
    }
  }
}
```

```bash
claude mcp add miteiru-headless -- node C:/path/to/miteiru/scripts/miteiru-mcp.mjs
```

From Python, with the [MCP SDK](https://pypi.org/project/mcp/):

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server = StdioServerParameters(command="node", args=[r"C:\path\to\miteiru\scripts\miteiru-mcp.mjs"])

async def main():
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("analyze_text", {"language": "ja", "detail": "full", "text": "猫が好きです。"})
            print(result.structuredContent["tokens"])

asyncio.run(main())
```

**Needs:** Node 22.15 or newer, and Rust (`cargo`) the first time: the first start builds the addon (`cargo build --release -p miteiru-node`, about 20 seconds) and bundles the server with esbuild (under a second); later starts reuse both until their sources change. Build ahead with `npm run build:headless`.

**Language data.** Each language is read from the first of:

1. folders given with `--assets`;
2. the installed Miteiru's language packs (choose a language once on Miteiru's Home screen to download its pack);
3. this checkout's own data: `npm run script:initrepo` downloads it into `renderer/public/language-assets`, and `node scripts/miteiru-mcp.mjs --build` prepares it for the server in `dist/headless/language-assets`, the form a pack holds it in (the JSON dictionaries become data tables; every other file is a hard link to the checkout's). This takes about 90 seconds, once: `--build` prepares it again only when the downloaded data changed.

So a plain checkout works with no Miteiru installed: `npm install`, `npm run script:initrepo`, `node scripts/miteiru-mcp.mjs --build`, then `node scripts/miteiru-mcp.mjs`. When the downloaded data changed since the last `--build`, the server says so on stderr at start (and keeps reading the earlier preparation). `get_status` says where each language's data came from (`languages.<code>.data`: `installed pack`, `checkout` or `assets`).

| Option | Meaning |
| --- | --- |
| `--profile <dir>` | A Miteiru user data folder instead of the installed app's (as `MITEIRU_USER_DATA_DIR`); its packs are `<dir>/language-packs`. |
| `--dev-profile` | A development build's profile, `miteiru (development)`. |
| `--assets <dir>` | A folder of `<plugin>/…` language data in the installed packs' format (dictionaries as `.pack` tables), read before the installed packs (more than once for more folders). A development checkout's JSON dictionaries are imported only by the app. |
| `--preload learner\|all\|none` | Languages to load at start, in the background: the learner's (default), every installed one, or none. |
| `--no-proxy` | Never hand `open_video` or `set_word_levels` to a running Miteiru. |
| `--build` | Build the addon and the bundle, prepare this checkout's language data (when it changed), then exit. |
| `--check` | Print the paths it would use, then exit. |

**What it reads.** The installed app's profile (`%APPDATA%\miteiru`, `~/Library/Application Support/miteiru`, `~/.config/miteiru`), its language packs (`%LOCALAPPDATA%\id.hocky.miteiru\language-packs` and the macOS and Linux equivalents), `config.json` read-only (re-read when the app changes it: Your dictionary, the tone setting, the last chosen language), and the saved words in `learningStateDB.sqlite3`. SQLite lets the app and the headless server use the saved words at once: reads see a consistent snapshot, and a write waits up to 5 seconds for the other's. A Miteiru 7 profile whose saved words the app hasn't brought over yet is left alone; open Miteiru 8 once first. The server's own scratch files go to the system temp folder, never into the profile.

**With Miteiru open.** `open_video` needs the window, and `set_word_levels` should reach it at once, so these two go to the running app when there is one (a registration whose process is gone is skipped); everything else is answered by the headless server itself, with the same code. With the app closed, `open_video` answers that Miteiru isn't open, and `set_word_levels` writes the store directly; the app reads the change when it next loads the saved words.

**Speed** (Windows, a warm start with the addon and bundle built): the server answers `initialize` 0.2–0.3 s after it is spawned. A language's first call loads it: Japanese about 0.7 s, Mandarin about 0.2 s, Cantonese well under 0.1 s. After that, `analyze_text` with `detail: "full"` takes 25–50 ms for a 30-character Japanese line and 5–12 ms for a Mandarin or Cantonese one.

Nothing but MCP messages is written to stdout; progress and errors go to stderr. `get_status` says `"server": "headless"`, which languages are installed and loaded, and where each one's data comes from. A language with no data anywhere answers `409` saying how to get it (install its pack, or download and `--build` this checkout's data).

## Tools

| Tool | What it does |
| --- | --- |
| `get_status` | The learning language, how many words are saved as Learning and Known, the last video watched, whether yt-dlp is installed, each language's state (`languages`: installed, loaded), where the tools run (`server`: `app` or `headless`) and the data sources with their licences (`sources`). |
| `search_videos` | Searches YouTube (through yt-dlp) and keeps the videos that have captions in the language: by the uploader or automatic (`learning-language`, the default), by the uploader only (`uploader`), or unchecked (`any`). Optional `duration`: `short`, `medium` or `long`. Returns up to `limit` videos (1 to 10, 5 by default). |
| `rate_video` | Splits a video's captions into words with Miteiru's tokenizer and compares them with the saved words: the share of spoken words saved as Known and Learning, a verdict (95%+ comfortable, 85–95% challenging, less hard), the most frequent unsaved words, the Learning words it repeats, words per minute and the first lines. Japanese leaves particles, auxiliary verbs, prefixes (お, ご), grammatical nouns (の, こと, よう), name suffixes (さん), interjections and fillers out of the count. |
| `open_video` | Plays a YouTube video in Miteiru with captions in the language as the main subtitle and English underneath, unless other tracks are named (`main_subtitle`, `translation`, which can be `none`). Starts at `start_at` seconds, which must be before the end. If Miteiru is on its Home screen, it loads the last-chosen language first. Miteiru comes to the front and goes to its video page; on a page holding typed text (Study a text) it asks the learner first, and if they stay, the answer says so. `opened: true` means the window took the video and began loading it. A newer call replaces one the window hasn't taken yet, and the older one's answer says it won't open. |
| `analyze_text` | Splits `text` (or up to 200 `texts`) into words. By default, the words with their dictionary forms, readings and saved levels, as it always answered; with `detail: "full"`, every piece of the text as a token with all its dictionary facts ([below](#analyze_text-in-full-detail)). |
| `list_saved_words` | The saved words, `learning`, `known` or `all`, most recently changed first. |
| `lookup_word` | Every dictionary entry for a word, with every sense, its parts of speech, the common flag, a stable entry id, all spellings and readings, and its levels. An inflected Japanese word is looked up by its dictionary form. Filters: `reading`, `pos`. |
| `lookup_character` | A kanji or hanzi: readings, meanings, grade, levels, stroke count, radical, and the stroke paths (KanjiVG for Japanese, Make Me a Hanzi for Chinese). |
| `readings` | Every reading the dictionaries give a word, with the entries it belongs to, beside the tokenizer's own reading. |
| `text_coverage` | For a set of texts: how many words are saved as Known and Learning (by count and by lemma), coverage percentages, and the unsaved words with their levels, most frequent first. |
| `known_words` | The saved words of a language, `learning`, `known` or `all`, with the time each was saved, newest first, in pages. |
| `set_word_levels` | Saves words as `new`, `learning` or `known`, with the time, through Miteiru's own store. The only tool that writes. |
| `conjugate` | A Japanese verb or adjective: its dictionary form, the ladder from an inflected form back to it, and its main forms. |
| `romanize` | Text in Latin letters: Hepburn for Japanese, Hanyu Pinyin with tone marks for Mandarin, Jyutping for Cantonese, Vietnamese without diacritics. |

The names, descriptions and argument schemas are in [`main/mcp/definitions.json`](../main/mcp/definitions.json). The app, `miteiru --mcp` and the headless server all read that file, and check every call's arguments against it before the tool runs.

### Languages

Every text tool takes `language`:

| `language` | Language | Engine and dictionary |
| --- | --- | --- |
| `ja` | Japanese | Miteiru's Rust tokenizer (IPADIC), JMdict, KANJIDIC2, KanjiVG |
| `zh-Hans` | Mandarin, simplified characters | Miteiru's tokenizer, CC-CEDICT, Make Me a Hanzi |
| `zh-Hant` | Mandarin, traditional characters | the same, with traditional forms preferred |
| `yue` | Cantonese | Miteiru's tokenizer, CantoDict, Make Me a Hanzi |
| `vi` | Vietnamese | Miteiru's Vietnamese word splitter, VNEDict |

Without `language`, a tool uses the language the learner chose in Miteiru. Each language's engine and dictionaries load on their own, the first time a call needs them, and stay loaded; loading one never changes the language the player shows. A language whose pack isn't installed answers `409` (for MCP, a tool error) saying so.

### Limits

- **Text:** `analyze_text` takes one `text` of up to 5000 characters or up to 200 `texts`, read four at a time; `text_coverage` up to 1000 texts. Either way, at most 200,000 characters in all.
- **YouTube:** every caption check is a full yt-dlp run against YouTube, and many in a row can get the computer asked to prove it isn't a bot, which also stops Miteiru playing YouTube for a while. The tools run at most 3 at once, across every call, each given up after 40 seconds, and a search checks at most 15 videos within 45 seconds. What the tools read of a video (its captions and details, without its streams) is kept for 20 minutes, 30 videos at most, so rating or opening a video the search found costs no new run.
- **The backend:** `rate_video` calls run one at a time and read at most 2000 caption lines, since the learner's own subtitles use the same backend. The local API answers within 2 minutes, so a rating that waited over a minute for its turn answers that Miteiru is busy, and one still reading after 90 seconds rates the lines it has read and says how many (`captionLines`, and its `note`).
- **Untrusted text:** titles, channel names, descriptions and caption lines come from YouTube. The server's instructions tell the assistant to treat them as content and never as instructions.

## `analyze_text` in full detail

`{"language": "ja", "detail": "full", "text": "…"}` answers `{"language", "detail": "full", "format": 2, "text", "tokens"}`, and with `texts` instead, `{"language", "detail": "full", "format": 2, "results": [{"text", "tokens"}, …]}` in the same order.

**The tokens cover the text exactly.** Joining every token's `s` gives back the input, character for character: spaces, line breaks, punctuation, emoji and anything the tokenizer dropped or changed are tokens of their own. `start` and `end` count Unicode code points, as Python's `str` indexes, so `text[start:end] == s`.

| Field | On | Meaning |
| --- | --- | --- |
| `s` | every token | The exact text it covers. |
| `start`, `end` | every token | Code point offsets, end exclusive. |
| `word` | every token | `false` for spaces, punctuation and symbols. |
| `pos` | every token | A coarse part of speech: `noun`, `proper_noun`, `pronoun`, `verb`, `adjective`, `adverb`, `particle`, `auxiliary`, `conjunction`, `interjection`, `determiner`, `numeral`, `classifier`, `prefix`, `suffix`, `filler`, `idiom`, `expression`, `other`, and for pieces that aren't words `space`, `punct` or `symbol`. Mandarin and Cantonese use the tag in the tokenizer word list. An untagged word gets `word`, and an entry from Your dictionary gets `noun`. |
| `tag` | Tagged Japanese, Mandarin and Cantonese words | The original IPADIC tag for Japanese (`名詞-接尾-人名`) or jieba tag for Chinese (`vg` for 喝 in the Mandarin word list). |
| `base` | words | The dictionary form (書いた → 書く); the word itself in Chinese and Vietnamese. |
| `reading` | words that have one | Japanese `{kana, romaji}` (hiragana, Hepburn); Mandarin `{pinyin, pinyin_num}` (`méi xiǎng dào`, `mei2 xiang3 dao4`, the neutral tone `5`); Cantonese `{jyutping}` (`jam2 caa4`). Never changed by the learner's tone display setting. Vietnamese has none: it is written as it is read. |
| `ruby` | Japanese, Mandarin and Cantonese words | `[{base, ruby}]` whose `base`s join to `s`. Japanese: each kanji run with its part of the reading, okurigana and kana bare (送り仮名 → `送`/おく, `り`, `仮名`/がな). Chinese: one per character. |
| `gloss` | words, or `null` | `{en, source, entry_id}`: the dictionary's senses, best fit first (Japanese senses are ranked by the token's part of speech and place in the sentence, so さん after a name is "Mr.; Mrs.", not 酸 "acid"), from `JMdict`, `CC-CEDICT`, `CantoDict`, `VNEDict` or `Your dictionary`, with the entry's stable id. Also `alternatives` (other entries that fit, `{entry_id, en}`), and for Chinese `measure_words`, `references` and `standard_chinese` (CantoDict) when the entry has them. |
| `levels` | words | `jlpt` (`N5`…`N1`), `freq_rank` and `freq_zipf` for Japanese; `hsk` (1–6, 7 for the 7–9 band) for Mandarin. Each only when the word is listed. |
| `pitch` | Japanese words Kanjium lists | `{reading, accents, patterns, morae}`: the downstep positions (0 is heiban) and their names. |
| `tones` | Mandarin and Cantonese words | Each syllable's tone: Mandarin as spoken, after tone sandhi (不 before a fourth tone is 2; 一 is 2 before a fourth tone and 4 before the others, except as a number or an ordinal; a third tone before a third tone in the same word is 2), neutral 5; Cantonese from jyutping (1–6). `tones_dictionary` gives Mandarin's tones before sandhi. |
| `forms` | Mandarin words | `{simplified, traditional}`. |
| `conjugation` | inflected Japanese verbs and adjectives | `{dictionary_form, kind, ladder}`: the steps from the inflected form back to the dictionary form. |
| `saved` | words | `new`, `learning` or `known`, from the learner's saved words. |
| `reading_check` | words | `dictionary` when the tokenizer's reading is one the dictionary gives the word, `mismatch` when it isn't (then `dictionary_readings` lists the dictionary's), `unknown` when the dictionary doesn't have the word. |

`format` changes only when a field changes meaning or shape; new fields can be added to format 2.

Example, `{"language": "ja", "detail": "full", "text": "猫が好きです。"}`, as the headless server answered it (two senses lists shortened):

```json
{
  "language": {"code": "ja", "name": "Japanese"}, "detail": "full", "format": 2, "text": "猫が好きです。",
  "tokens": [
    {"s": "猫", "start": 0, "end": 1, "word": true, "pos": "noun", "tag": "名詞-一般", "base": "猫",
     "reading": {"kana": "ねこ", "romaji": "neko"}, "ruby": [{"base": "猫", "ruby": "ねこ"}],
     "gloss": {"en": ["cat", "shamisen", "geisha", "…"], "source": "JMdict", "entry_id": "1467640", "alternatives": [{"entry_id": "2698030", "en": ["cat"]}]},
     "levels": {"jlpt": "N5", "freq_rank": 739, "freq_zipf": 5.05},
     "pitch": {"reading": "ねこ", "accents": [1], "patterns": ["atamadaka"], "morae": ["ね", "こ"]},
     "saved": "known", "reading_check": "dictionary"},
    {"s": "が", "start": 1, "end": 2, "word": true, "pos": "particle", "tag": "助詞-格助詞-一般", "base": "が",
     "reading": {"kana": "が", "romaji": "ga"}, "ruby": [{"base": "が", "ruby": ""}],
     "gloss": {"en": ["indicates sentence subject", "indicates possessive", "but; however; still; and", "regardless of; whether"], "source": "JMdict", "entry_id": "2028930"},
     "levels": {"freq_rank": 5, "freq_zipf": 7.43}, "saved": "new", "reading_check": "dictionary"},
    {"s": "好き", "start": 2, "end": 4, "word": true, "pos": "adjective", "tag": "名詞-形容動詞語幹", "base": "好き",
     "reading": {"kana": "すき", "romaji": "suki"}, "ruby": [{"base": "好", "ruby": "す"}, {"base": "き", "ruby": ""}],
     "gloss": {"en": ["liking; being fond of; to one's liking; to one's taste; preferred; favourite", "…"], "source": "JMdict", "entry_id": "1277450"},
     "levels": {"jlpt": "N5", "freq_rank": 123, "freq_zipf": 5.77}, "saved": "new", "reading_check": "dictionary"},
    {"s": "です", "start": 4, "end": 6, "word": true, "pos": "auxiliary", "tag": "助動詞", "base": "です",
     "reading": {"kana": "です", "romaji": "desu"}, "ruby": [{"base": "です", "ruby": ""}],
     "gloss": {"en": ["be; is"], "source": "JMdict", "entry_id": "1628500"},
     "levels": {"freq_rank": 18, "freq_zipf": 6.79}, "saved": "new", "reading_check": "dictionary"},
    {"s": "。", "start": 6, "end": 7, "word": false, "pos": "punct"}
  ]
}
```

The full answers for three test lines (Japanese, Mandarin, Cantonese) are in [`tests/fixtures/mcp-golden/`](../tests/fixtures/mcp-golden).

## Tool reference

Each example is a `tools/call` request's `arguments` and the answer's `structuredContent` (the same JSON is the result's text content). Long answers are shortened with `…`.

### `analyze_text` (basic)

The default, as it always answered: the words, with `reading` following the learner's tone display setting.

```json
{"language": "ja", "text": "猫が好きです。"}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "text": "猫が好きです。", "words": [
  {"text": "猫", "reading": "ねこ", "pos": "名詞-一般", "level": "known"},
  {"text": "が", "pos": "助詞-格助詞-一般", "level": "new"},
  {"text": "好き", "reading": "すき", "pos": "名詞-形容動詞語幹", "level": "new"},
  {"text": "です", "pos": "助動詞", "level": "new"}]}
```

Arguments: `text` or `texts` (not both), `language`, `detail` (`basic` or `full`).

### `lookup_word`

Arguments: `language` (required), `word` (required), `reading`, `pos` (`noun`, `verb`, `adjective`, `adverb`, `particle`, `suffix`, … as in `analyze_text`), `limit` (1–50, 10 by default).

```json
{"language": "ja", "word": "さん", "pos": "suffix", "limit": 1}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "word": "さん", "total": 3, "entries": [
  {"entry_id": "1005340", "source": "JMdict", "common": true, "spellings": [],
   "readings": [{"text": "さん", "romaji": "san", "common": true, "tags": [], "applies_to_spellings": ["*"]}],
   "senses": [
     {"pos": ["suf"], "pos_names": ["suffix"], "gloss": ["Mr.", "Mrs.", "Miss", "Ms.", "-san"], "misc": ["hon", "fam"],
      "info": ["after a person's name (or position, etc.)"], "related": ["様・さま・1"]},
     {"pos": ["suf"], "pos_names": ["suffix"], "gloss": ["politeness marker"], "misc": ["pol"], "info": ["usu. after a noun or sometimes na-adjective"]}],
   "levels": {"jlpt": "N1", "freq_rank": 75, "freq_zipf": 6.07}}]}
```

Mandarin and Cantonese entries give `traditional`, `simplified`, `pinyin` (`[{pinyin_num, pinyin}]`) or `jyutping`, `senses`, and when the entry has them `measure_words`, `references`, `standard_chinese`, `notes`, `surname`, `proper_noun`:

```json
{"language": "zh-Hans", "word": "行"}
```

```json
{"language": {"code": "zh-Hans", "name": "Mandarin Chinese (simplified)"}, "word": "行", "total": 2, "entries": [
  {"entry_id": "95860", "source": "CC-CEDICT", "traditional": "行", "simplified": "行",
   "pinyin": [{"pinyin_num": "xing2", "pinyin": "xíng"}], "senses": ["to walk", "to go", "to travel", "…"], "levels": {"hsk": 1}},
  {"entry_id": "95859", "source": "CC-CEDICT", "traditional": "行", "simplified": "行",
   "pinyin": [{"pinyin_num": "hang2", "pinyin": "háng"}], "senses": ["row", "line", "commercial firm", "…"], "levels": {"hsk": 1}}]}
```

```json
{"language": "vi", "word": "sinh viên"}
```

```json
{"language": {"code": "vi", "name": "Vietnamese"}, "word": "sinh viên", "total": 1, "entries": [
  {"entry_id": "sinh viên", "source": "VNEDict", "word": "sinh viên", "senses": ["(university) student"]}]}
```

A word in Your dictionary comes first, as `{"entry_id": "user:<language>:<word>", "source": "Your dictionary", …}`. An inflected Japanese word (`行かなかった`) adds `"dictionary_form": "行く"`.

For a Japanese numeral followed by a counter, `lookup_word` can also return `composed_readings` at the top level. The entry IDs in its two parts identify the numeral and the counter sense. Each part gives its pronunciation in the compound. For example, the headless server answers `{"language":"ja","word":"六匹"}` with

```json
{"language":{"code":"ja","name":"Japanese"},"word":"六匹","total":0,"entries":[],
 "composed_readings":[{"reading":"ろっぴき","romaji":"roppiki","rule":"counter","parts":[
   {"s":"六","reading":"ろっ","entry_id":"1585310"},{"s":"匹","reading":"ぴき","entry_id":"1583370"}]}]}
```

### `lookup_character`

Arguments: `language` (`ja`, `zh-Hans`, `zh-Hant` or `yue`), `char` (one kanji or hanzi).

```json
{"language": "ja", "char": "話"}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "char": "話", "codepoint": "U+8A71", "source": "KANJIDIC2", "found": true,
 "readings": {"on": ["ワ"], "kun": ["はな.す", "はなし"], "nanori": [], "pinyin": ["hua4"], "korean": ["화"]},
 "meanings": ["tale", "talk"], "levels": {"grade": 2, "jlpt_old": 4, "freq_rank": 134}, "stroke_count": 13, "radical": 149,
 "strokes": {"source": "KanjiVG", "count": 13, "paths": ["M24.99,14c2.36,1.5,6.1,6.17,6.7,8.5…", "…"]}}
```

`jlpt_old` is KANJIDIC2's level from the JLPT before 2010 (4 easiest). KanjiVG paths are in a 109×109 box, one per stroke in stroke order. For Chinese:

```json
{"language": "zh-Hans", "char": "龙"}
```

```json
{"language": {"code": "zh-Hans", "name": "Mandarin Chinese (simplified)"}, "char": "龙", "codepoint": "U+9F99", "source": "CC-CEDICT", "found": true,
 "readings": {"pinyin": ["lóng"], "pinyin_num": ["long2"]}, "meanings": ["dragon; symbol of the emperor"],
 "decomposition": "⿻尤丿", "radical": "龙", "etymology": {"type": "pictographic", "hint": "A dragon"}, "stroke_count": 5, "variants": [],
 "levels": {"hsk": 3},
 "strokes": {"source": "Make Me a Hanzi", "count": 5, "outlines": ["M 508 507 Q 571 520 641 532 Q …", "…"], "medians": ["M 231 506 L 277 498 L 339 502 …", "…"]}}
```

Make Me a Hanzi's outlines fill each stroke, and the medians are each stroke's centre line, both in stroke order. They are in Make Me a Hanzi's coordinates, with y pointing up: draw them in a `viewBox="0 0 1024 1024"` inside `<g transform="scale(1, -1) translate(0, -900)">`, as its own SVG files do.

### `readings`

Arguments: `language` (`ja`, `zh-Hans`, `zh-Hant` or `yue`), `word`.

```json
{"language": "ja", "word": "今日"}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "word": "今日", "source": "JMdict", "tokenizer_reading": "きょう", "readings": [
  {"reading": "きょう", "romaji": "kyou", "common": true, "entry_ids": ["1579110"], "pitch": {"accents": [1], "patterns": ["atamadaka"]}},
  {"reading": "こんにち", "romaji": "konnichi", "common": true, "entry_ids": ["1579110"]},
  {"reading": "こんち", "romaji": "konchi", "common": false, "entry_ids": ["1579110"]},
  {"reading": "こんじつ", "romaji": "konjitsu", "common": false, "entry_ids": ["1579110"]}]}
```

`readings` and `lookup_word` both add `composed_readings` when the tokenizer splits the input into a numeral (kanji, digits, or 何) and one counter, and JMdict identifies both parts. The whole reading comes from the tokenizer’s counter rules. If JMdict lists the whole word, the composed reading must agree with one of its readings. `readings` lists the whole word’s dictionary readings, and `tokenizer_reading` separates its tokens with spaces. These are headless responses for 三杯, 一杯 and 何本.

```json
{"language":{"code":"ja","name":"Japanese"},"word":"三杯","source":"JMdict","tokenizer_reading":"さん ばい","readings":[],
 "composed_readings":[{"reading":"さんばい","romaji":"sanbai","rule":"counter","parts":[
   {"s":"三","reading":"さん","entry_id":"1579350"},{"s":"杯","reading":"ばい","entry_id":"2019640"}]}]}
```

```json
{"language":{"code":"ja","name":"Japanese"},"word":"一杯","source":"JMdict","tokenizer_reading":"いっ ぱい",
 "readings":[{"reading":"いっぱい","romaji":"ippai","common":true,"entry_ids":["1165670"],"pitch":{"accents":[1],"patterns":["atamadaka"]}}],
 "composed_readings":[{"reading":"いっぱい","romaji":"ippai","rule":"counter","parts":[
   {"s":"一","reading":"いっ","entry_id":"1160790"},{"s":"杯","reading":"ぱい","entry_id":"2019640"}]}]}
```

```json
{"language":{"code":"ja","name":"Japanese"},"word":"何本","source":"JMdict","tokenizer_reading":"なん ぼん","readings":[],
 "composed_readings":[{"reading":"なんぼん","romaji":"nanbon","rule":"counter","parts":[
   {"s":"何","reading":"なん","entry_id":"2846738"},{"s":"本","reading":"ぼん","entry_id":"1522150"}]}]}
```

```json
{"language": "yue", "word": "行"}
```

```json
{"language": {"code": "yue", "name": "Cantonese"}, "word": "行", "source": "CantoDict", "tokenizer_reading": "haang4", "readings": [
  {"jyutping": "haang4", "entry_ids": ["2800"], "sense": "to walk"},
  {"jyutping": "hong2", "entry_ids": ["32371", "32370"], "sense": "perfunctory"},
  {"jyutping": "hang4", "entry_ids": ["32528"], "sense": "to the peak or the limit"},
  {"jyutping": "hong4", "entry_ids": ["33849"], "sense": "a line"}]}
```

Mandarin readings are `{pinyin_num, pinyin}`, and the tokenizer's reading is `{"pinyin_num": …, "pinyin": …}`.

### `text_coverage`

Arguments: `language` (required), `texts` (required, 1–1000), `limit` (the most unsaved words to list, 50 by default).

```json
{"language": "ja", "texts": ["猫が好きです。", "税理士さんと話した。"], "limit": 5}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "texts": 2, "words": {"counted": 4, "distinct": 4},
 "coverage": {"known": 25, "learning": 25, "known_or_learning": 50, "new": 50},
 "lemmas": {"new": 2, "learning": 1, "known": 1},
 "unknown_words": [
   {"word": "好き", "reading": "すき", "count": 1, "levels": {"jlpt": "N5", "freq_rank": 123, "freq_zipf": 5.77}},
   {"word": "話す", "count": 1, "levels": {"jlpt": "N5", "freq_rank": 2143, "freq_zipf": 4.61}}],
 "by_lemma": [{"word": "猫", "count": 1, "saved": "known"}, {"word": "好き", "count": 1, "saved": "new"}, {"word": "税理士", "count": 1, "saved": "learning"}, {"word": "話す", "count": 1, "saved": "new"}],
 "note": "Particles, auxiliary verbs, prefixes (お, ご), grammatical nouns (の, こと, よう), name suffixes (さん), interjections and fillers are not counted."}
```

Words are counted by their dictionary form, so 話した counts as 話す. Percentages are of the counted words.

### `known_words`

Arguments: `language` (required), `level` (`learning`, `known` or `all`, the default), `limit` (up to 100,000; 10,000 by default), `offset`.

```json
{"language": "ja", "limit": 2}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "total": {"learning": 1, "known": 1}, "count": 2, "words": [
  {"word": "猫", "level": "known", "updated_ms": 1794741632867, "updated": "2026-11-15T11:20:32.867Z"},
  {"word": "税理士", "level": "learning", "updated_ms": 1794741632867, "updated": "2026-11-15T11:20:32.867Z"}]}
```

When there are more, the answer has `next_offset`; pass it as `offset` for the next page.

### `set_word_levels`

Arguments: `language` (required), `words` (required: 1–1000 of `{"word", "level"}`, the level `new`, `learning` or `known`; a word given twice takes its last level).

```json
{"language": "ja", "words": [{"word": "猫", "level": "known"}, {"word": "税理士", "level": "learning"}]}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "updated": 2, "words": [
  {"word": "猫", "level": "known", "previous": "known"}, {"word": "税理士", "level": "learning", "previous": "learning"}]}
```

Words are saved in their dictionary form, as Miteiru saves them when the learner clicks one. Every word of a call gets the same time, and a stored entry newer than that (from another device's sync) is kept. An open Miteiru window reloads the saved words at once.

### `conjugate`

Arguments: `word` (required: a Japanese verb or adjective, in any form), `language` (`ja`, the default).

```json
{"word": "行かなかった"}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "word": "行かなかった", "dictionary_form": "行く", "reading": "いく", "kind": "verb",
 "entry_id": "1578850", "pos": ["v5k-s", "vi", "aux-v"], "is_inflected": true,
 "ladder": [{"surface": "行かなかった", "description": "negative auxiliary (past (ta))"}, {"surface": "行く", "description": "dictionary form"}],
 "forms": [
   {"id": "plain", "label": "Plain present", "forms": ["行く"], "use": "Casual statements, among friends, or inside grammar patterns.", "essential": true},
   {"id": "negative", "label": "Negative", "forms": ["行かない"], "use": "Say something does not happen or is not true.", "essential": true},
   "…"]}
```

### `romanize`

Arguments: `language`, `text`.

```json
{"language": "ja", "text": "今日ねなんか税理士さんとね、お話ししたんですね"}
```

```json
{"language": {"code": "ja", "name": "Japanese"}, "text": "今日ねなんか税理士さんとね、お話ししたんですね",
 "system": "Hepburn (wanakana, long vowels spelled out)",
 "romanized": "kyou ne nanka zeirishi san to ne, ohanashishita n desu ne",
 "tokens": [{"s": "今日", "romanized": "kyou"}, {"s": "ね", "romanized": "ne"}, "…"]}
```

Mandarin: `"没想到，龙王回到龙宫后"` is `"méixiǎngdào, lóngwáng huídào lónggōng hòu"` (Hanyu Pinyin with tone marks). Cantonese: `"佢哋今日去咗飲茶"` is `"keoi5 dei6 gam1 jat6 heoi3 zo2 jam2 caa4"` (Jyutping). Vietnamese: `"Tiếng Việt rất hay"` is `"Tieng Viet rat hay"`.

### `get_status`

From the headless server, with Japanese as the learner's language:

```json
{"version": "8.2.0", "language": {"code": "ja", "name": "Japanese", "loaded": false}, "savedWords": {"learning": 1, "known": 1}, "lastVideo": null,
 "youtube": {"ytDlp": true},
 "languages": {"ja": {"installed": true, "loaded": true, "data": "installed pack"}, "zh-Hans": {"installed": true, "loaded": false, "data": "checkout"},
               "zh-Hant": {"installed": true, "loaded": false, "data": "checkout"}, "yue": {"installed": true, "loaded": false, "data": "installed pack"},
               "vi": {"installed": true, "loaded": false, "data": "checkout"}},
 "server": "headless",
 "sources": [{"name": "JMdict", "use": "Japanese words, readings and glosses", "license": "CC BY-SA 4.0", "url": "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project", "credit": "Electronic Dictionary Research and Development Group"}, "…"]}
```

`language.loaded` says whether the player has the learner's language loaded (in the headless server, only after a tool that uses the player's language, such as `rate_video`, loaded it); `languages` says which languages' tools are ready and, in the headless server, where each one's data is read from (`installed pack`, `checkout` or `assets`; see [Language data](#the-headless-server-miteiru-closed)).

## Data sources

`get_status` lists every source with its licence. The data sets: JMdict and KANJIDIC2 (EDRDG, CC BY-SA 4.0), KanjiVG (CC BY-SA 3.0), Kanjium pitch accents (CC BY-SA 4.0), CC-CEDICT (CC BY-SA 4.0), CantoDict, VNEDict, Make Me a Hanzi (Arphic Public License and LGPL), HSK 3.0 levels from complete-hsk-vocabulary (MIT), and for Japanese:

- **JLPT levels:** Jonathan Waller's [JLPT Resources](http://www.tanos.co.uk/jlpt/) (CC BY) with JMdict entry ids from [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) (CC BY-SA 4.0). There are no official JLPT word lists: these are an educated guess, and a few basic grammar words are listed at N1. Levels are looked up by the token's JMdict entry and reading, since one entry can be listed at two levels (今日: きょう N5, こんにち N3).
- **Word frequency:** [wordfreq](https://github.com/rspeer/wordfreq) 3.2 by Robyn Speer (data CC BY-SA 4.0): `freq_zipf` is log10 of the word's frequency per billion words, and `freq_rank` its rank (1 is the most frequent; words of the same frequency share one). Words seen less than once per million (Zipf 3) have neither.

Both live in [`renderer/public/study-data/japanese-levels/`](../renderer/public/study-data/japanese-levels) with their licence and notices.

**Grammar points are not served.** The JLPT grammar catalogue Miteiru's Learn page uses (`language-assets/japanese/grammar/jp_grammar.json`) was taken from jlptsensei.com, whose terms reserve all rights, allow personal use only, and forbid republishing, copying and redistributing its material. No tool exposes it. An openly licensed list would be needed first.

## Finding the API

The app's server binds to `127.0.0.1` on port `0`, so the system picks a free port each run. After starting, Miteiru writes `analyzer-server.json` to its user data folder (`%APPDATA%\miteiru` on Windows, `~/Library/Application Support/miteiru` on macOS, `~/.config/miteiru` on Linux; a development build uses `miteiru (development)`; `MITEIRU_USER_DATA_DIR` overrides both):

```json
{
  "host": "127.0.0.1",
  "port": 49183,
  "token": "random-session-token",
  "pid": 12345,
  "startedAt": 1781320900000,
  "version": "8.2.0"
}
```

Miteiru doesn't delete the file when it closes. A missing file, a process that is gone (`pid`), a refused connection or a `401` all mean Miteiru isn't open. On macOS and Linux the file can be read by its owner only (`0600`), since its token lets a program open videos and read saved words. The headless server writes no registration.

## Authentication

Every endpoint except `GET /health` needs the token from the registration file:

```text
X-Miteiru-Analyzer-Token: random-session-token
```

Requests that carry an `Origin` header are refused with `403`. Browsers add one to requests from web pages, and the API's clients are programs, which don't.

## Endpoints

### `GET /health`

Server status, the language selected in Miteiru, and the languages it supports.

```json
{
  "ok": true,
  "version": "8.2.0",
  "active": {
    "tokenizerMode": "jieba",
    "languageCode": "zh-CN",
    "pluginId": "mandarin-jieba",
    "name": "Jieba - Chinese"
  },
  "supportedPlugins": []
}
```

### `POST /analyze`

Splits one text into Miteiru's tokens (the full token JSON the subtitles use) in the selected language.

```json
{"text": "我叫做佩奇"}
```

```json
{"ok": true, "active": {"tokenizerMode": "jieba", "languageCode": "zh-CN", "pluginId": "mandarin-jieba", "name": "Jieba - Chinese"}, "tokens": []}
```

`lang` and `tokenizer` fields are only assertions: if they don't match the selection, the answer is `409` and the language stays as it is.

### `POST /analyze-batch`

The same for several texts: `{"texts": ["我", "你"]}` answers `{"ok": true, "active": {…}, "results": [[…], […]]}`, in the same order. The texts are read four at a time. At most 2000 texts and 200,000 characters in all (`413` beyond that), and every item must be a string (`400`).

### `GET /tools`

The tool definitions: `{"ok": true, "tools": [...]}`.

### `POST /tools/<name>`

Runs one tool with its arguments as the JSON body, and answers its result:

```json
{"query": "猫 vlog", "limit": 5}
```

```json
{"ok": true, "result": {"language": {"code": "ja", "name": "Japanese"}, "query": "猫 vlog", "videos": []}}
```

Failures answer `{"ok": false, "error": "…"}` with status `400` (bad arguments or body), `404` (no such tool, no such word or character, or a video without captions in the language), `409` (no language chosen yet, a language not installed, or one that failed to load), `502` (yt-dlp or YouTube failed) or `503` (the language tools aren't available).

### `POST /mcp`

MCP's Streamable HTTP transport, answering with plain JSON (no event streams and no sessions): `initialize`, `ping`, `tools/list` and `tools/call`. Notifications are answered `202` with no body. `GET /mcp` answers `405`. A batch (from clients older than MCP 2025-06-18) holds 1 to 10 messages, run one after another. Since the port and the token change on every run, assistants use `miteiru --mcp`, which reads them from the registration file each time.

## Errors from the server itself

- `503`: Miteiru's window wasn't ready, or the page reloaded before it answered. Try again.
- `504`: no answer within 120 seconds.
- `421`: the request named another host. Address the server as `127.0.0.1:<port>` or `localhost:<port>`; other names are refused so that web pages can't reach it through DNS rebinding.
- `403`: the request came from a web page (it had an `Origin` header).
