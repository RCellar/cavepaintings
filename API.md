# Cavepaintings API Reference

Cavepaintings exposes a REST API and a WebSocket protocol for programmatic interaction with the canvas. All endpoints are localhost-only and require no authentication.

**Base URL:** `http://localhost:<port>` (default port 9731, auto-increments if in use)

---

## Security

All HTTP responses include these security headers:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https: ws://localhost:* wss://localhost:*` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |

### Origin Validation

WebSocket connections are validated against a localhost allowlist:
- `http://localhost:*` -- accepted
- `http://127.0.0.1:*` -- accepted
- `http://[::1]:*` -- accepted
- Missing `Origin` header -- accepted (non-browser clients)
- All other origins -- rejected with HTTP 403

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/canvas` | 30 requests | per minute per IP |
| `GET /api/submissions` | 60 requests | per minute per IP |
| `GET /api/info` | 60 requests | per minute per IP |
| WebSocket messages | 100 messages | per minute per connection |

Rate-limited responses return `429 Too Many Requests` with a `Retry-After` header (seconds until the oldest request in the window expires). WebSocket rate limit violations close the connection with code `1008` (Policy Violation).

---

## REST API

### GET /api/info

Returns the project directory name. Used by the canvas UI for the browser tab title.

**Response:**

```json
{
  "projectDir": "my-project"
}
```

`projectDir` is set by the `CAVEPAINTINGS_PROJECT_DIR` environment variable (passed automatically by the start script). Empty string if not set.

---

### GET /api/submissions

Poll for canvas submissions. Returns all submissions with timestamps newer than the `since` parameter.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `since` | integer | No | Unix timestamp in milliseconds. Only submissions newer than this value are returned. Defaults to `0` (all submissions). |

**Request:**

```bash
curl http://localhost:9731/api/submissions?since=0
```

**Response:**

```json
{
  "submissions": [
    {
      "id": "submission-1774030611729",
      "timestamp": 1774030611729,
      "prompt": "review this architecture",
      "png": "/tmp/cavepaintings/submissions/submission-1774030611729.png",
      "json": "/tmp/cavepaintings/submissions/submission-1774030611729.json"
    }
  ]
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique submission identifier (`submission-<timestamp>`) |
| `timestamp` | integer | Unix timestamp in milliseconds when the submission was received |
| `prompt` | string | Optional message the user typed in the prompt field (empty string if none) |
| `png` | string \| null | Absolute file path to the 2x HiDPI PNG screenshot, or `null` if no image was included |
| `json` | string | Absolute file path to the Fabric.js JSON file containing the full canvas state |

**Polling pattern:**

```bash
# First poll — get all submissions
SINCE=0
RESPONSE=$(curl -s "http://localhost:9731/api/submissions?since=$SINCE")

# Subsequent polls — only new submissions
SINCE=$(echo "$RESPONSE" | jq '.submissions[-1].timestamp // 0')
RESPONSE=$(curl -s "http://localhost:9731/api/submissions?since=$SINCE")
```

**Submission retention:** The server keeps the most recent 50 submissions by default. Older submissions are automatically deleted. Configure with `--max-submissions <n>` on the server command line.

---

### POST /api/canvas

Push Fabric.js objects to the connected browser canvas. Objects appear in real time via WebSocket forwarding.

**Request:**

```bash
curl -X POST http://localhost:9731/api/canvas \
  -H 'Content-Type: application/json' \
  -d '{
    "diagram": {
      "objects": [
        {
          "type": "rect",
          "left": 50,
          "top": 50,
          "width": 200,
          "height": 100,
          "fill": "#4a9eff",
          "stroke": "#fff",
          "strokeWidth": 2
        },
        {
          "type": "i-text",
          "left": 70,
          "top": 80,
          "text": "Hello from the API",
          "fill": "#fff",
          "fontSize": 16
        }
      ]
    },
    "mode": "merge"
  }'
```

**Body fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `diagram` | object | Yes | Must contain an `objects` array |
| `diagram.objects` | array | Yes | Array of Fabric.js object definitions. Each must have a string `type` field. |
| `mode` | string | Yes | `"merge"` to add objects to the existing canvas, or `"replace"` to clear the canvas and load only these objects |

**Validation rules:**
- Unknown top-level keys (beyond `diagram` and `mode`) are rejected
- Each object in `diagram.objects` must have a string `type` field
- Maximum request body size: 5 MB

**Supported object types:**

| Type | Description |
|------|-------------|
| `rect` | Rectangle with `left`, `top`, `width`, `height`, `fill`, `stroke` |
| `ellipse` | Ellipse with `left`, `top`, `rx`, `ry` |
| `line` | Line with `x1`, `y1`, `x2`, `y2` |
| `i-text` | Editable text with `left`, `top`, `text`, `fill`, `fontSize`, `fontFamily` |
| `path` | SVG path with `path` data |
| `polygon` | Polygon with `points` array of `{x, y}` |
| `group` | Group of nested objects with `objects` array |
| `image` | Image (limited support -- `src` must be a data URL or accessible URL) |

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `200` | `{"ok": true}` | Objects forwarded to browser |
| `400` | `{"error": "..."}` | Validation failed (missing fields, wrong types, unknown keys) |
| `413` | `{"error": "Payload too large (max 5 MB)"}` | Body exceeds 5 MB |
| `429` | `{"error": "Too many requests", "retryAfter": N}` | Rate limit exceeded |
| `503` | `{"error": "No browser client connected"}` | No browser tab has the canvas open |

**Mode examples:**

```bash
# Merge: add a rectangle to the existing canvas
curl -X POST http://localhost:9731/api/canvas \
  -H 'Content-Type: application/json' \
  -d '{"diagram":{"objects":[{"type":"rect","left":10,"top":10,"width":50,"height":50,"fill":"red"}]},"mode":"merge"}'

# Replace: clear canvas and load a fresh diagram
curl -X POST http://localhost:9731/api/canvas \
  -H 'Content-Type: application/json' \
  -d '{"diagram":{"objects":[{"type":"i-text","left":100,"top":100,"text":"Fresh start","fill":"#fff","fontSize":24}]},"mode":"replace"}'
```

---

## WebSocket Protocol

The server accepts WebSocket connections at `ws://localhost:<port>` (or `wss://` if behind TLS). Only one browser client is active at a time -- new connections displace the previous one.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:9731');
```

The maximum WebSocket message payload is 50 MB.

### Message Types

All messages are JSON-encoded strings.

#### Client to Server

**`submit`** -- Submit canvas content to Claude Code

```json
{
  "type": "submit",
  "image": "data:image/png;base64,...",
  "diagram": { "objects": [...], "version": "6.5.1" },
  "prompt": "optional user message"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"submit"` | Message type |
| `image` | string | Base64-encoded PNG data URL (2x HiDPI) |
| `diagram` | object | Full Fabric.js canvas JSON (`canvas.toJSON()`) |
| `prompt` | string | Optional message from the prompt input field |

The server writes the submission to disk as paired PNG + JSON files and responds with an `ack`.

#### Server to Client

**`ack`** -- Submission received

```json
{
  "type": "ack",
  "timestamp": 1774030611729
}
```

Sent after the submission files are written to disk. The client shows "Sent!" feedback on receipt.

**`load`** -- Push objects to the canvas

```json
{
  "type": "load",
  "diagram": { "objects": [...] },
  "mode": "merge"
}
```

Forwarded from `POST /api/canvas`. The client either merges the objects into the existing canvas or replaces the entire canvas, depending on `mode`.

**`displaced`** -- Another browser tab has connected

```json
{
  "type": "displaced",
  "message": "Another tab has connected"
}
```

Sent to the previously active client when a new WebSocket connection is established. The displaced client should close its connection and not auto-reconnect.

### Connection Lifecycle

1. Client connects to `ws://localhost:<port>`
2. If another client was connected, it receives a `displaced` message
3. Client sends `submit` messages when the user clicks "Submit to Claude"
4. Server responds with `ack` after writing files
5. Server sends `load` messages when the `POST /api/canvas` endpoint is called
6. On disconnect, the client attempts exponential backoff reconnect (1s, 2s, 4s... up to 30s)
7. If displaced, the client does not reconnect (user can reload to take over)

---

## CLI Options

```
node server.js [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port <n>` | `9731` | HTTP/WebSocket server port. Auto-increments if in use (up to 10 retries). |
| `--no-open` | (opens browser) | Don't open the browser automatically on startup |
| `--max-submissions <n>` | `50` | Maximum submissions to retain. Oldest are deleted when exceeded. |
| `--owner-pid <pid>` | (none) | Monitor this PID; shut down when it exits. Used by the start script to auto-cleanup when Claude Code exits. Skipped on Windows. |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CAVEPAINTINGS_PROJECT_DIR` | Project directory name shown in the browser tab title and used in export filenames |
| `CAVEPAINTINGS_NO_STATE` | If set, skip writing the state file to `/tmp/cavepaintings/state.json` (used in tests) |

---

## File Locations

| Path | Description |
|------|-------------|
| `<tmpdir>/cavepaintings/state.json` | Server state file (port, PID, URL). Created on startup, deleted on shutdown. |
| `<tmpdir>/cavepaintings/submissions/` | Submission files. PNG + JSON pairs named `submission-<timestamp>.*` |
| `<tmpdir>/cavepaintings/.last-seen-submission` | Timestamp tracker for the UserPromptSubmit hook |

`<tmpdir>` is `os.tmpdir()` -- typically `/tmp` on Linux/macOS, `%LOCALAPPDATA%\Temp` on Windows.

File permissions: directories are created with mode `0700`, files with `0600` (Linux/macOS only; no-op on Windows).
