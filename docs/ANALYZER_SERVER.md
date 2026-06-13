# Analyzer Server

Miteiru exposes a local analyzer server while the desktop app is running. The server follows the language currently selected in the desktop UI and returns the same token JSON used by subtitles.

## Registration

The server binds to `127.0.0.1` on port `0`, so the OS assigns a free port. After startup, Miteiru writes `analyzer-server.json` in Electron's user data directory.

```json
{
  "host": "127.0.0.1",
  "port": 49183,
  "token": "random-session-token",
  "pid": 12345,
  "startedAt": 1781320900000,
  "version": "6.0.1"
}
```

Miteiru closes the server during app shutdown but does not delete this file. External clients should treat missing files, stale ports, connection failures, or auth failures as "server not found" and should not start standalone analysis.

## Authentication

All endpoints except `GET /health` require the registration token:

```text
X-Miteiru-Analyzer-Token: random-session-token
```

## Endpoints

### `GET /health`

Returns server status, active desktop language/tokenizer, and supported analyzer modes.

```json
{
  "ok": true,
  "version": "6.0.1",
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

Analyzes one text string using the current desktop selection.

```json
{
  "text": "我叫做佩奇"
}
```

Response:

```json
{
  "ok": true,
  "active": {
    "tokenizerMode": "jieba",
    "languageCode": "zh-CN",
    "pluginId": "mandarin-jieba",
    "name": "Jieba - Chinese"
  },
  "tokens": []
}
```

Optional `lang` and `tokenizer` request fields are assertions only. If they do not match the current desktop selection, the server returns `409` and does not switch languages.

### `POST /analyze-batch`

Analyzes multiple text strings using the current desktop selection.

```json
{
  "texts": ["我", "你"]
}
```

Response:

```json
{
  "ok": true,
  "active": {
    "tokenizerMode": "jieba",
    "languageCode": "zh-CN",
    "pluginId": "mandarin-jieba",
    "name": "Jieba - Chinese"
  },
  "results": [
    [],
    []
  ]
}
```
