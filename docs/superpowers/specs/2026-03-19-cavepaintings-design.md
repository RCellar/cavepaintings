# Cavepaintings — Design Spec

A browser-based interactive drawing canvas that integrates with Claude Code via a skill pair. Users draw diagrams, paste and annotate images, and submit canvas snapshots directly into their Claude Code conversation over a persistent WebSocket connection.

## Architecture

Three components:

### 1. Local Server (Node.js)

A lightweight HTTP + WebSocket server using only `http` and `ws` modules.

**Startup sequence:**
1. Finds an available port (default 9731, fallback to next available)
2. Starts HTTP server (serves static files) + WebSocket server on the same port
3. Writes state file to `<os.tmpdir()>/cavepaintings/state.json` containing `{ port, pid, url }`
4. Opens the browser via platform-appropriate command (`xdg-open` on Linux, `open` on macOS, `start` on Windows)

**Cross-platform paths:**
- All temp files use `os.tmpdir()` — resolves correctly on Linux (`/tmp`), macOS (`/var/folders/.../T/`), and Windows (`AppData\Local\Temp`)
- All paths constructed with `path.join()` — no hardcoded separators
- Submissions stored in `<os.tmpdir()>/cavepaintings/submissions/`

**Shutdown:**
- Stop skill reads state file, sends SIGTERM to server PID via `process.kill()`
- Server cleans up submission temp files on exit
- State file removed

### 2. Browser Canvas (Fabric.js + Vanilla JS)

A single-page application served by the local server.

**Layout:**
- Full viewport
- Left toolbar (~56px) with drawing tools and canvas actions
- Center canvas area with optional dot grid
- Floating properties panel (appears on object selection, top-right)
- Bottom bar with connection status, optional message input, and "Submit to Claude" button

**Drawing tools:**
- Select/Move — click to select, drag to move, handles for resize/rotate
- Rectangle — click-drag to draw
- Ellipse — click-drag to draw
- Line/Arrow — click-drag, arrowhead toggle
- Freehand Draw — brush tool, adjustable size
- Text — click to place, inline editing
- Image Paste — Ctrl+V pastes clipboard images; also a file picker button

**Properties panel (shown on selection):**
- Fill color, stroke color, stroke width
- Font size (for text objects)
- Opacity
- Delete, duplicate, bring forward/send backward

**Canvas actions:**
- Undo/Redo (Fabric.js state stack)
- Clear canvas
- Zoom in/out (scroll wheel support)
- Grid toggle (snap-to-grid)

**Image handling:**
- Ctrl+V pastes clipboard images as Fabric.js Image objects
- Images are movable, resizable
- Other shapes can be drawn on top of pasted images
- Core workflow: paste a screenshot, annotate with diagram blocks

### 3. Claude Code Skills (Start/Stop Pair)

**`cavepaintings` (start):**
1. Checks for existing session via state file
2. If running and PID alive, opens browser to existing URL
3. If not running (or stale PID), launches `node server.js` as background process
4. Confirms with URL

**`cavepaintings-stop` (stop):**
1. Reads state file, sends SIGTERM to server PID
2. Server gracefully shuts down WebSocket connections, cleans up temp files
3. Removes state file
4. Confirms shutdown

## Data Flow

```
Browser Canvas → WebSocket → Local Server → File System → Claude Code
                                          (PNG + JSON)
```

### WebSocket Protocol

Messages are JSON-encoded with a `type` field.

**Browser → Server (`submit`):**
```json
{
  "type": "submit",
  "image": "<base64 encoded PNG>",
  "diagram": {
    "version": "6.0.0",
    "objects": [...],
    "background": "#1a1a2e"
  },
  "prompt": "Optional user message"
}
```

- `image`: PNG screenshot via `canvas.toDataURL()`
- `diagram`: Fabric.js native `canvas.toJSON()` output — full object graph with positions, styles, content
- `prompt`: Optional text from the bottom bar input field

**Server → Browser (`ack`):**
```json
{ "type": "ack", "timestamp": 1706000101 }
```

### Submission Storage

Server writes two files per submission:
- `submission-<timestamp>.png` — canvas screenshot
- `submission-<timestamp>.json` — contains diagram JSON and prompt text

### What Claude Code Receives

The skill presents each submission as:
1. The PNG image as an attachment (visual understanding)
2. The user's prompt text (if provided)
3. A note that the full Fabric.js JSON is at the file path for programmatic reasoning

## Canvas Persistence & Export

**On submission:** Canvas is NOT cleared. Submission is a snapshot — user continues working on the same drawing.

**Auto-save (localStorage):**
- Canvas JSON saved to `localStorage` every 30 seconds and on every object modification
- On page load, restores from `localStorage` if saved state exists
- "New Canvas" button clears canvas and saved state (with confirmation prompt)

**Export options:**
- Export PNG — downloads PNG of current canvas
- Export SVG — downloads SVG via `canvas.toSVG()`
- Export JSON — downloads Fabric.js JSON (re-importable)
- Import JSON — file picker to load previously exported canvas, restoring full diagram

## Error Handling

**Connection management:**
- Browser shows "Disconnected" (red dot) if WebSocket drops
- Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Submit button disabled while disconnected
- Server tolerates browser refreshes — new connections replace old ones

**Large submissions:**
- No artificial size limit — local traffic handles large PNGs fine
- Base64 ~33% inflation is acceptable for localhost

**Concurrent sessions:**
- One session at a time, enforced by state file
- Starting while running opens browser to existing session

**Crash recovery:**
- Start skill checks if PID in state file is still alive
- If dead, cleans up stale state and starts fresh

## Technology

- **Canvas library:** Fabric.js (~300KB, no build step, vanilla JS)
- **Server:** Node.js with `http` and `ws` modules only
- **Frontend:** Vanilla HTML/CSS/JS, no framework, no build step
- **Dependencies:** `ws` (WebSocket library) — single npm dependency

## Project Structure

```
cavepaintings/
├── server.js              # HTTP + WebSocket server
├── index.html             # Canvas app (Fabric.js + vanilla JS)
├── style.css              # Canvas app styles
├── package.json           # Minimal deps: ws
├── skills/
│   ├── cavepaintings.md   # Start skill definition
│   └── cavepaintings-stop.md  # Stop skill definition
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-03-19-cavepaintings-design.md
```
