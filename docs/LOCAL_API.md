# Local API and MCP

While Miteiru is open, it answers a small HTTP API on `127.0.0.1`. AI assistants reach it through Miteiru's MCP server (`miteiru --mcp`), and other programs can call it directly. Everything it does uses the language the learner chose in Miteiru, the same word splitting as the subtitles, and the learner's saved words. It never runs on its own: with Miteiru closed, there is nothing to answer.

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

`miteiru --mcp` doesn't open a window. It speaks MCP over stdin and stdout, answers the handshake and the tool list by itself so the assistant connects even while Miteiru is closed, and passes each tool call to the open app (`POST /mcp` below). When the app is closed, a tool call answers that Miteiru isn't open. A development build (`tauri dev`) is found too. A call the assistant cancels gets no answer; the app still finishes it.

On a Mac, open Miteiru from the Applications folder before copying the command: an app opened straight from Downloads runs from a temporary copy whose path changes on every launch, and Settings says so.

### Tools

| Tool | What it does |
| --- | --- |
| `get_status` | The learning language, how many words are saved as Learning and Known, the last video watched, and whether yt-dlp is installed. |
| `search_videos` | Searches YouTube (through yt-dlp) and keeps the videos that have captions in the learning language: by the uploader or automatic (`learning-language`, the default), by the uploader only (`uploader`), or unchecked (`any`). Optional `duration`: `short`, `medium` or `long`. Returns up to `limit` videos (1 to 10, 5 by default). |
| `rate_video` | Splits a video's captions into words with Miteiru's tokenizer and compares them with the saved words: the share of spoken words saved as Known and Learning, a verdict (95%+ comfortable, 85–95% challenging, less hard), the most frequent unsaved words, the Learning words it repeats, words per minute and the first lines. Japanese leaves particles, auxiliary verbs, prefixes (お, ご), grammatical nouns (の, こと, よう), name suffixes (さん), interjections and fillers out of the count. |
| `open_video` | Plays a YouTube video in Miteiru with captions in the learning language as the main subtitle and English underneath, unless other tracks are named (`main_subtitle`, `translation`, which can be `none`). Starts at `start_at` seconds, which must be before the end. If Miteiru is on its Home screen, it loads the last-chosen language first. Miteiru comes to the front and goes to its video page; on a page holding typed text (Study a text) it asks the learner first, and if they stay, the answer says so. `opened: true` means the window took the video and began loading it. A newer call replaces one the window hasn't taken yet, and the older one's answer says it won't open. |
| `analyze_text` | Splits text into words with their dictionary forms, readings, and saved level (`new`, `learning` or `known`). |
| `list_saved_words` | The saved words, `learning`, `known` or `all`, most recently changed first. |

The names, descriptions and argument schemas are in [`main/mcp/definitions.json`](../main/mcp/definitions.json). Both the app and `miteiru --mcp` read that file.

Limits that keep the tools from getting in the learner's way:

- **YouTube:** every caption check is a full yt-dlp run against YouTube, and many in a row can get the computer asked to prove it isn't a bot, which also stops Miteiru playing YouTube for a while. The tools run at most 3 at once, across every call, each given up after 40 seconds, and a search checks at most 15 videos within 45 seconds. What the tools read of a video (its captions and details, without its streams) is kept for 20 minutes, 30 videos at most, so rating or opening a video the search found costs no new run.
- **The backend:** `rate_video` calls run one at a time and read at most 2000 caption lines, since the learner's own subtitles use the same backend. The local API answers within 2 minutes, so a rating that waited over a minute for its turn answers that Miteiru is busy, and one still reading after 90 seconds rates the lines it has read and says how many (`captionLines`, and its `note`).
- **Untrusted text:** titles, channel names, descriptions and caption lines come from YouTube. The server's instructions tell the assistant to treat them as content and never as instructions.

## Finding the API

The server binds to `127.0.0.1` on port `0`, so the system picks a free port each run. After starting, Miteiru writes `analyzer-server.json` to its user data folder (`%APPDATA%\miteiru` on Windows, `~/Library/Application Support/miteiru` on macOS, `~/.config/miteiru` on Linux; a development build uses `miteiru (development)`; `MITEIRU_USER_DATA_DIR` overrides both):

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

Miteiru doesn't delete the file when it closes. A missing file, a refused connection or a `401` all mean Miteiru isn't open. On macOS and Linux the file can be read by its owner only (`0600`), since its token lets a program open videos and read saved words.

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

The same for several texts: `{"texts": ["我", "你"]}` answers `{"ok": true, "active": {…}, "results": [[…], […]]}`.

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

Failures answer `{"ok": false, "error": "…"}` with status `400` (bad arguments or body), `404` (no such tool, or a video without captions in the language), `409` (no language chosen yet, or it failed to load) or `502` (yt-dlp or YouTube failed).

### `POST /mcp`

MCP's Streamable HTTP transport, answering with plain JSON (no event streams and no sessions): `initialize`, `ping`, `tools/list` and `tools/call`. Notifications are answered `202` with no body. `GET /mcp` answers `405`. A batch (from clients older than MCP 2025-06-18) holds 1 to 10 messages, run one after another. Since the port and the token change on every run, assistants use `miteiru --mcp`, which reads them from the registration file each time.

## Errors from the server itself

- `503`: Miteiru's window wasn't ready, or the page reloaded before it answered. Try again.
- `504`: no answer within 120 seconds.
- `421`: the request named another host. Address the server as `127.0.0.1:<port>` or `localhost:<port>`; other names are refused so that web pages can't reach it through DNS rebinding.
- `403`: the request came from a web page (it had an `Origin` header).
