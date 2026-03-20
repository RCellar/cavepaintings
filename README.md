# Cavepaintings

A browser-based interactive drawing canvas that integrates with Claude Code. Draw diagrams, paste and annotate images, and submit canvas snapshots directly into your Claude Code conversation over a persistent WebSocket connection.

## Features

- **Drawing tools** -- rectangles, ellipses, arrows, freehand, text, and image paste (Ctrl+V)
- **Properties panel** -- fill, stroke, opacity, font size, z-ordering on selected objects
- **Zoom & pan** -- scroll wheel to zoom, Alt+drag or middle-click to pan
- **Snap-to-grid** -- toggle a dot grid and objects snap to it when moved
- **Undo/redo** -- full state stack with Ctrl+Z / Ctrl+Y
- **Export/import** -- PNG, SVG, and JSON export; JSON re-import to restore diagrams
- **Auto-save** -- canvas state persists in localStorage across browser refreshes
- **Submit to Claude** -- sends a PNG screenshot + Fabric.js JSON + optional message to Claude Code over WebSocket
- **Connection status** -- green/red indicator with automatic reconnect (exponential backoff)

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
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Delete | Remove selected |
| Alt+Drag | Pan canvas |

## Installing as a Claude Code Plugin

Cavepaintings ships with two Claude Code skills (`/cavepaintings` to start, `/cavepaintings-stop` to stop). There are several ways to make them available.

### Option A: Project-level skills (simplest)

If you only need the skills in projects where cavepaintings is cloned, no extra setup is needed. Clone the repo into your working directory and Claude Code will discover the `skills/` folder automatically.

### Option B: Register as a custom marketplace plugin

This makes the skills available globally across all your Claude Code sessions.

**1. Create the plugin metadata**

Create a `.claude-plugin/` directory in the cavepaintings repo:

```bash
mkdir -p .claude-plugin
```

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "cavepaintings",
  "description": "Browser-based drawing canvas for submitting diagrams and annotated images to Claude Code",
  "version": "0.1.0",
  "author": { "name": "RCellar" },
  "repository": "https://github.com/RCellar/cavepaintings",
  "license": "MIT"
}
```

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "cavepaintings-marketplace",
  "description": "Cavepaintings drawing canvas plugin",
  "owner": { "name": "RCellar" },
  "plugins": [
    { "name": "cavepaintings", "version": "0.1.0", "source": "./" }
  ]
}
```

**2. Register the marketplace in Claude Code**

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

If you prefer not to use the marketplace system, symlink the skill files into a project that has a `skills/` directory:

```bash
ln -s /path/to/cavepaintings/skills/cavepaintings.md /your/project/skills/cavepaintings.md
ln -s /path/to/cavepaintings/skills/cavepaintings-stop.md /your/project/skills/cavepaintings-stop.md
```

## Usage with Claude Code

Once the skills are available:

```
/cavepaintings          # starts the server and opens the browser
/cavepaintings-stop     # stops the server
```

The canvas opens in your browser. Draw, paste screenshots, annotate -- then click **Submit to Claude** to send the canvas contents into your active Claude Code conversation. Claude receives both a PNG image (for visual understanding) and the full Fabric.js JSON (for programmatic reasoning about diagram objects).

## Architecture

```
Browser Canvas  --WebSocket-->  Node.js Server  --files-->  Claude Code
  (Fabric.js)                   (http + ws)                (skill reads files)
```

- **server.js** -- HTTP static file server + WebSocket, state file lifecycle, cross-platform browser opening
- **app.js** -- Fabric.js canvas with all drawing tools, properties, undo/redo, export/import, WebSocket client
- **index.html + style.css** -- dark-themed UI with left toolbar, floating properties panel, bottom submit bar
- **skills/** -- Claude Code skill definitions (start/stop pair)

## Running Tests

```bash
npm test
```

Runs 7 tests across 4 suites (HTTP serving, WebSocket protocol, submission storage, server lifecycle, end-to-end flow).

## Tech Stack

- [Fabric.js](http://fabricjs.com/) 6.x (CDN, no build step)
- Node.js with `http` and `ws` modules
- Vanilla HTML/CSS/JS -- no framework, no bundler

## License

MIT
