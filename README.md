# Cavepaintings

A browser-based interactive drawing canvas that integrates with Claude Code. Draw diagrams, paste and annotate images, and submit canvas snapshots directly into your Claude Code conversation over a persistent WebSocket connection.

## Features

- **Drawing tools** -- rectangles, ellipses, arrows, freehand, text, and image paste (Ctrl+V)
- **Object copy/paste** -- Ctrl+C / Ctrl+V to duplicate canvas objects (multi-select supported)
- **Properties panel** -- fill, stroke, opacity, font size, z-ordering on selected objects
- **Zoom & pan** -- scroll wheel to zoom, Alt+drag or middle-click to pan, zoom indicator with click-to-reset
- **Snap-to-grid** -- toggle a dot grid and objects snap to it when moved
- **Undo/redo** -- full state stack with Ctrl+Z / Ctrl+Y
- **Export/import** -- PNG (2x HiDPI), SVG, and JSON export; JSON re-import to restore diagrams
- **Auto-save** -- canvas state persists in localStorage across browser refreshes
- **Submit to Claude** -- sends a 2x HiDPI PNG screenshot + Fabric.js JSON + optional message over WebSocket; Ctrl+Enter shortcut from the prompt field
- **Automatic notifications** -- a UserPromptSubmit hook detects new submissions (including multiple between messages) and injects them into Claude's context with prompt text and object summaries
- **Connection status** -- green/red indicator with automatic reconnect (exponential backoff)
- **Canvas push API** -- Claude (or any harness) can programmatically place objects on the canvas via `POST /api/canvas`
- **Submissions API** -- harness-agnostic `GET /api/submissions?since=<timestamp>` endpoint for polling new submissions

## Quick Start

```bash
git clone https://github.com/RCellar/cavepaintings.git
cd cavepaintings
npm install
node server.js
```

The browser opens automatically. Draw something, click **Submit to Claude**.

### CLI Options

```
node server.js                    # default port 9731, opens browser
node server.js --port 8080        # custom port
node server.js --no-open          # don't open browser
```

The server automatically tries the next port if the default is in use.

## Keyboard Shortcuts

| Key | Tool |
|-----|------|
| V | Select |
| R | Rectangle |
| E | Ellipse |
| A | Arrow |
| D | Freehand draw |
| T | Text |
| I | Image (file picker) |
| G | Toggle grid |
| Ctrl+C | Copy selected object(s) |
| Ctrl+V | Paste copied object(s) |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+Enter | Submit to Claude (when prompt field is focused) |
| Delete | Remove selected |
| Alt+Drag | Pan canvas |

## Installing as a Claude Code Plugin

Cavepaintings ships with two Claude Code skills (`/cavepaintings` to start, `/cavepaintings-stop` to stop). There are several ways to make them available.

**Prerequisite:** [Node.js](https://nodejs.org/) (v18+) and npm must be installed. The start script automatically runs `npm install` on first launch if dependencies are missing.

### Option A: Project-level skills (simplest)

If you only need the skills in projects where cavepaintings is cloned, no extra setup is needed. Clone the repo into your working directory and Claude Code will discover the `skills/` folder automatically.

### Option B: Register as a custom marketplace plugin

This makes the skills available globally across all your Claude Code sessions. The repo already includes `.claude-plugin/` metadata.

**1. Register the marketplace in Claude Code**

Add the marketplace to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "extraKnownMarketplaces": {
    "cavepaintings-marketplace": {
      "repo": "RCellar/cavepaintings",
      "branch": "master"
    }
  }
}
```

Or ask Claude Code directly:

> "Add `RCellar/cavepaintings` as a custom marketplace called `cavepaintings-marketplace`"

**3. Install the plugin**

In Claude Code, run:

```
/plugins
```

Navigate to **Discover**, find `cavepaintings`, and install it.

### Option C: Manual skill symlink

If you prefer not to use the marketplace system, symlink the skill directories into a project that has a `skills/` directory:

```bash
ln -s /path/to/cavepaintings/skills/cavepaintings /your/project/skills/cavepaintings
ln -s /path/to/cavepaintings/skills/cavepaintings-stop /your/project/skills/cavepaintings-stop
```

## Usage with Claude Code

Once the skills are available:

```
/cavepaintings          # starts the server and opens the browser
/cavepaintings-stop     # stops the server
```

The canvas opens in your browser. Draw, paste screenshots, annotate -- then click **Submit to Claude** to send the canvas contents into your active Claude Code conversation. Claude receives both a PNG image (for visual understanding) and the full Fabric.js JSON (for programmatic reasoning about diagram objects).

### Submission flow

1. Draw or paste an image on the canvas
2. Click **Submit to Claude** or press **Ctrl+Enter** in the prompt field
3. The button shows "Sending..." while the server writes files, then "Sent!" on confirmation (or "Send failed" after 10s timeout)
4. Type anything in Claude Code (even just "check")
5. The plugin's `UserPromptSubmit` hook automatically detects new submissions and injects them into Claude's context -- including prompt text, object counts, and PNG paths
6. Claude reads the PNG and responds

The hook tracks submissions by timestamp and surfaces all new submissions since the last check, so rapid double-submits are never lost.

## Architecture

```
Browser Canvas  --WebSocket-->  Node.js Server  --files-->  Claude Code
  (Fabric.js)                   (http + ws)                (skill reads files)
```

- **server.js** -- HTTP static file server + WebSocket + REST API, state file lifecycle, cross-platform browser opening
- **app.js** -- Fabric.js canvas with all drawing tools, properties, undo/redo, export/import, WebSocket client with ack-based feedback
- **index.html + style.css** -- dark/light themed UI with left toolbar, floating properties panel, bottom submit bar with zoom indicator
- **vendor/fabric.min.js** -- locally bundled Fabric.js 6.5.1 (no CDN dependency)
- **skills/cavepaintings/** -- start skill with SKILL.md + utility scripts (session check, server start)
- **skills/cavepaintings-stop/** -- stop skill with SKILL.md + stop script
- **hooks/** -- `UserPromptSubmit` hook that detects new canvas submissions with multi-submission tracking
- **.claude-plugin/** -- plugin metadata for marketplace installation

## REST API

The server exposes two API endpoints for harness-agnostic integration:

**Poll for submissions:**
```bash
curl http://localhost:9731/api/submissions?since=0
```
Returns all submissions newer than the given timestamp, with prompt text, file paths, and metadata.

**Push objects to canvas:**
```bash
curl -X POST http://localhost:9731/api/canvas \
  -H 'Content-Type: application/json' \
  -d '{"diagram":{"objects":[{"type":"rect","left":50,"top":50,"width":100,"height":80,"fill":"#ff0000"}]},"mode":"merge"}'
```
Forwards Fabric.js objects to the connected browser client. Use `"mode": "merge"` to add to existing canvas or `"mode": "replace"` to clear and load.

## Running Tests

```bash
npm test
```

Runs 19 tests across 7 suites (HTTP serving, WebSocket protocol, submission storage, server lifecycle, start-server, end-to-end flow, API endpoints). Playwright browser tests (20 tests) are run separately with `npx playwright test`.

## Updating

After making changes to the plugin:

```bash
npm run release 0.2.0    # bumps version, commits, pushes, cleans old cache versions
```

Then in Claude Code:

```
/plugin update cavepaintings@cavepaintings-marketplace
/reload-plugins
```

Dependencies are installed automatically on session start via a `SessionStart` hook, so users never need to run `npm install` manually.

## Tech Stack

- [Fabric.js](http://fabricjs.com/) 6.5.1 (bundled locally, no CDN dependency)
- Node.js with `http` and `ws` modules
- Vanilla HTML/CSS/JS -- no framework, no bundler

## License

MIT
