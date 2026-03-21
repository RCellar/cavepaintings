# Changelog

All notable changes to Cavepaintings are documented here.

## [0.3.3] - 2026-03-21

### Added
- **Owner-process watchdog** — server auto-shuts down when the parent Claude Code process exits (15-second poll via `--owner-pid`)
- **Dated export filenames** — exports now use project directory + timestamp (e.g., `myproject-20260321-051234.png`) instead of generic `cavepaintings.png`

### Fixed
- **Windows compatibility** — 6 fixes for Windows Server / Git Bash environments:
  - OS detection fallback via `Windows_NT` env var
  - Owner-pid watchdog skipped on win32 (unreliable `process.kill` signal 0)
  - PID reuse check uses `tasklist` on Windows with WSL exclusion
  - State file paths passed via env vars (avoids backslash escape issues in `node -e`)
  - `check-session.js` uses platform-aware liveness check
  - `stop-server.js` uses `taskkill /F` on Windows
- `.gitignore` scoped `scripts/` exclusion to top-level only

## [0.3.1] - 2026-03-20

### Security
- Removed `unsafe-inline` from CSP `script-src` — tightened to `script-src 'self'`

### Added
- **Version identifier** — version displayed in HTML meta tag and bottom bar label
- **Submission retention** — configurable `--max-submissions` CLI option (default 50) with automatic cleanup of oldest submissions
- **Displaced tab notification** — when a new browser tab connects, the old tab shows "Another tab connected" and stops auto-reconnecting
- **Polygon touch support** — polygon tool now works on touch devices via single-tap vertex placement
- **Test coverage** — added Playwright tests for undo/redo, grid toggle, and connector reroute on resize

### Fixed
- Connector index now clears when canvas is cleared, preventing stale references
- Object list panel responsive on tablet — renders as bottom sheet with mutual exclusion
- Bump script now updates version in `index.html` alongside JSON files

### Changed
- Extracted shared `showToast`/`hideToast` into `src/toast.js`, removed duplicates from `tools.js` and `image-utils.js`

## [0.3.0] - 2026-03-20

### Security
- HTTP security headers on all responses (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Input schema validation on `POST /api/canvas` with 5 MB body limit
- WebSocket origin checking — accepts only localhost, rejects cross-site hijacking
- Restrictive file permissions on submissions and state (0700 dirs, 0600 files)
- Rate limiting on all API endpoints (30-60 req/min) and WebSocket messages (100 msg/min)

### Added
- **Line tool** (L) — drag to draw plain lines
- **Polygon tool** (P) — click to place vertices, double-click or click first vertex to close
- **Connector tool** (C) — connect objects with lines that follow on move/resize, automatic obstacle routing
- **Object list panel** (O) — view all objects, click to select, drag to reorder z-index, double-click to rename, keyboard navigation (Arrow keys, Alt+Arrow to reorder, Delete to remove)
- **Properties panel discoverability** — always-visible empty state, first-use hint, toolbar toggle (Q)
- **Image URL paste** — paste an image URL to load it onto the canvas; dedicated URL input when image tool is active
- **Responsive tablet layout** — toolbar moves to horizontal top bar below 768px, panels become bottom sheets, 44px touch targets
- **Touch gestures** — pinch to zoom, two-finger pan, long-press context menu, double-tap to edit text
- **Object ID system** — every object gets a stable `caveId` (UUID) for connector references and serialization
- **Toast notifications** — brief feedback messages with screen reader support (`role="alert"`)
- **Viewport management** — handles virtual keyboard on mobile via `visualViewport` API

### Changed
- Split monolithic `app.js` (977 lines) into focused ES modules: `canvas-core.js`, `tools.js`, `connectors.js`, `object-list.js`, `properties.js`, `websocket-client.js`, `image-utils.js`, `touch.js`
- Client scripts now load as ES modules (`type="module"`)
- Canvas JSON serialization includes custom properties (`caveId`, `caveName`) via `toObject` prototype patch
- Bottom sheets on tablet are mutually exclusive (opening one closes the other)

### Fixed
- `loadFromJSON` in JSON import now uses Fabric.js 6.x Promise API instead of deprecated callback
- Rate limit store cleaned up periodically to prevent memory leak

## [0.2.7] - 2026-03-20

### Added
- Favicon (SVG) and dynamic browser tab title showing project directory name

## [0.2.6] - 2026-03-20

### Fixed
- Submission hook wrapped in try/catch to handle race condition with server shutdown

## [0.2.5] - 2026-03-19

### Added
- Drag-and-drop image attachment to canvas

## [0.2.4] - 2026-03-19

### Changed
- Trimmed skill token weight for lighter plugin packaging
- Added `.gitattributes` export-ignore and `.npmignore` for cleaner distribution

## [0.2.3] - 2026-03-19

### Fixed
- Undo/redo rendering and stack pollution from localStorage restore

## [0.2.2] - 2026-03-19

### Fixed
- Redo broken by `loadFromJSON` triggering `saveState` which cleared the redo stack

## [0.2.1] - 2026-03-19

### Fixed
- Undo/redo rendering and stack pollution from localStorage restore

## [0.2.0] - 2026-03-19

### Added
- Submissions API endpoint (`GET /api/submissions?since=<timestamp>`)
- Canvas push API (`POST /api/canvas`) for programmatically placing objects
- Ack-based submit feedback with sending/sent/failed states
- Multi-submission hook with rich context injection
- Object copy/paste (Ctrl+C/V) with multi-select support
- Zoom indicator with click-to-reset
- Ctrl+Enter submit shortcut from prompt field
- Accessibility: aria-labels, label associations, aria-pressed states
- Dark/light theme toggle with persistence

### Changed
- Bundled Fabric.js 6.5.1 locally (no CDN dependency)
- Async submission I/O with active WebSocket tracking
- HiDPI (2x) PNG submissions
- Deduplicated canvas serialization with dirty flag for auto-save

### Security
- Path traversal fix in static file server
- WebSocket message size limit (50 MB)
- Submission cleanup on server shutdown

## [0.1.6] - 2026-03-19

### Fixed
- Freehand drawing and tool selection bug
- Added theme toggle and brush customization options

### Security
- Path traversal and query string handling fix in static server

## [0.1.5] - 2026-03-18

### Fixed
- Port retry race condition causing wrong port in state file

## [0.1.4] - 2026-03-18

### Added
- Auto-install npm dependencies on session start via SessionStart hook
- Single-command release workflow (`npm run release`)

## [0.1.3] - 2026-03-18

### Fixed
- Switched submission hook to UserPromptSubmit for idle notification support

## [0.1.2] - 2026-03-18

### Fixed
- Server crash on port fallback
- Start script reliability improvements

## [0.1.1] - 2026-03-18

### Added
- Version bump script with marketplace cache refresh

### Fixed
- Discard zero-size shapes (click without drag)
- Submission notification hook

## [0.1.0] - 2026-03-18

### Added
- Initial release
- HTTP server with static file serving
- WebSocket server with submit/ack protocol
- Fabric.js canvas with drawing tools (select, rectangle, ellipse, arrow, freehand, text, image)
- Properties panel (fill, stroke, opacity, font size, z-ordering)
- Undo/redo with 50-state stack
- Zoom/pan with scroll wheel and Alt+drag
- Snap-to-grid with toggle
- Export (PNG, SVG, JSON) and JSON import
- Auto-save to localStorage
- Canvas state persistence across browser refreshes
- Cross-platform browser opening on startup
- State file management and graceful shutdown
- Claude Code skills (`/cavepaintings`, `/cavepaintings-stop`)
- Claude Code marketplace plugin structure
