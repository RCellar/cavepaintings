# Cavepaintings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based drawing canvas that submits diagrams and screenshots to Claude Code over WebSocket.

**Architecture:** Node.js server (http + ws) serves a vanilla HTML/JS/CSS single-page app using Fabric.js for the canvas. A start/stop skill pair manages the server lifecycle. Submissions write PNG + JSON to temp files for Claude Code to consume.

**Tech Stack:** Node.js, Fabric.js 6.x (CDN), `ws` npm package, vanilla HTML/CSS/JS

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "cavepaintings",
  "version": "0.1.0",
  "type": "module",
  "description": "Browser-based drawing canvas for Claude Code",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/*.test.mjs"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
.superpowers/
```

- [ ] **Step 3: Install dependencies**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && npm install`
Expected: `node_modules/` created with `ws` package

- [ ] **Step 4: Initialize git repo**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && git init && git add package.json package-lock.json .gitignore && git commit -m "chore: initialize project with ws dependency"`
Expected: Initial commit created

---

### Task 2: Server — HTTP Static File Serving

**Files:**
- Create: `server.js`
- Create: `index.html` (minimal placeholder)

- [ ] **Step 1: Write test — server serves index.html**

Create `test/server.test.mjs`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('HTTP Server', () => {
  let proc;
  const PORT = 19731;

  before(async () => {
    proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], {
      cwd: ROOT,
      env: { ...process.env, CAVEPAINTINGS_NO_STATE: '1' },
    });
    await new Promise((resolve) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      setTimeout(resolve, 2000);
    });
  });

  after(() => { proc?.kill(); });

  it('serves index.html at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('<!DOCTYPE html>'));
    assert.ok(res.headers['content-type'].includes('text/html'));
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`http://localhost:${PORT}/nonexistent`);
    assert.strictEqual(res.status, 404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/server.test.mjs`
Expected: FAIL — `server.js` does not exist

- [ ] **Step 3: Create minimal index.html placeholder**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cavepaintings</title>
</head>
<body>
  <div id="app">Loading...</div>
</body>
</html>
```

- [ ] **Step 4: Write server.js with HTTP static file serving**

Create `server.js`:

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function parseArgs(args) {
  const opts = { port: 9731, open: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) opts.port = parseInt(args[i + 1], 10);
    if (args[i] === '--no-open') opts.open = false;
  }
  return opts;
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const opts = parseArgs(process.argv.slice(2));
const server = http.createServer(serveStatic);

function listen(port, maxRetries = 10) {
  server.listen(port, () => {
    opts.port = port;
    console.log(`listening on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxRetries > 0) {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      server.removeAllListeners('error');
      listen(port + 1, maxRetries - 1);
    } else {
      console.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    }
  });
}

listen(opts.port);

export { server, opts };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/server.test.mjs`
Expected: PASS — both tests green

- [ ] **Step 6: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add server.js index.html test/server.test.mjs
git commit -m "feat: HTTP server with static file serving"
```

---

### Task 3: Server — WebSocket Support

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Write test — WebSocket connection and echo**

Append to `test/server.test.mjs`:

```js
import WebSocket from 'ws';

describe('WebSocket Server', () => {
  let proc;
  const PORT = 19732;

  before(async () => {
    proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], {
      cwd: ROOT,
      env: { ...process.env, CAVEPAINTINGS_NO_STATE: '1' },
    });
    await new Promise((resolve) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      setTimeout(resolve, 2000);
    });
  });

  after(() => { proc?.kill(); });

  it('accepts WebSocket connections', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.close();
  });

  it('sends ack on submit message', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve) => ws.on('open', resolve));

    const response = await new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      ws.send(JSON.stringify({
        type: 'submit',
        image: 'data:image/png;base64,iVBOR',
        diagram: { version: '6.0.0', objects: [] },
        prompt: 'test submission'
      }));
    });

    assert.strictEqual(response.type, 'ack');
    assert.ok(response.timestamp);
    ws.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/server.test.mjs`
Expected: FAIL — WebSocket tests fail, no WS server running

- [ ] **Step 3: Add WebSocket server to server.js**

Add to `server.js` after `server.listen`:

```js
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server });
let activeSocket = null;

wss.on('connection', (ws) => {
  activeSocket = ws;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'submit') {
      handleSubmission(msg);
      ws.send(JSON.stringify({ type: 'ack', timestamp: Date.now() }));
    }
  });
  ws.on('close', () => {
    if (activeSocket === ws) activeSocket = null;
  });
});

function handleSubmission(msg) {
  // Submission storage implemented in Task 4
}
```

Note: Move the `ws` import to the top of the file with the other imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/server.test.mjs`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add server.js test/server.test.mjs
git commit -m "feat: add WebSocket server with submit/ack protocol"
```

---

### Task 4: Server — Submission Storage

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Write test — submissions write PNG and JSON files**

Create `test/submissions.test.mjs`:

```js
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

describe('Submission Storage', () => {
  let proc;
  const PORT = 19733;

  before(async () => {
    // Clean submissions dir
    if (fs.existsSync(SUBMISSIONS_DIR)) {
      fs.rmSync(SUBMISSIONS_DIR, { recursive: true });
    }

    proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], {
      cwd: ROOT,
      env: { ...process.env, CAVEPAINTINGS_NO_STATE: '1' },
    });
    await new Promise((resolve) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      setTimeout(resolve, 2000);
    });
  });

  after(() => {
    proc?.kill();
    if (fs.existsSync(SUBMISSIONS_DIR)) {
      fs.rmSync(SUBMISSIONS_DIR, { recursive: true });
    }
  });

  it('writes PNG and JSON files on submit', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve) => ws.on('open', resolve));

    // 1x1 red pixel PNG as base64
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const diagram = { version: '6.0.0', objects: [{ type: 'rect', left: 0, top: 0 }] };

    await new Promise((resolve) => {
      ws.on('message', () => resolve());
      ws.send(JSON.stringify({
        type: 'submit',
        image: `data:image/png;base64,${tinyPng}`,
        diagram,
        prompt: 'test prompt'
      }));
    });

    ws.close();

    // Check files were created
    const files = fs.readdirSync(SUBMISSIONS_DIR);
    const pngFiles = files.filter(f => f.endsWith('.png'));
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    assert.strictEqual(pngFiles.length, 1, 'Expected one PNG file');
    assert.strictEqual(jsonFiles.length, 1, 'Expected one JSON file');

    // Verify JSON content
    const jsonContent = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, jsonFiles[0]), 'utf8'));
    assert.strictEqual(jsonContent.prompt, 'test prompt');
    assert.deepStrictEqual(jsonContent.diagram, diagram);

    // Verify PNG is valid (starts with PNG magic bytes)
    const pngData = fs.readFileSync(path.join(SUBMISSIONS_DIR, pngFiles[0]));
    assert.ok(pngData[0] === 0x89 && pngData[1] === 0x50, 'File should be valid PNG');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/submissions.test.mjs`
Expected: FAIL — `handleSubmission` is a no-op

- [ ] **Step 3: Implement handleSubmission in server.js**

Replace the `handleSubmission` stub in `server.js`:

```js
import os from 'node:os';

const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

function handleSubmission(msg) {
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
  const timestamp = Date.now();
  const baseName = `submission-${timestamp}`;

  // Write PNG
  if (msg.image) {
    const base64Data = msg.image.replace(/^data:image\/png;base64,/, '');
    const pngPath = path.join(SUBMISSIONS_DIR, `${baseName}.png`);
    fs.writeFileSync(pngPath, Buffer.from(base64Data, 'base64'));
  }

  // Write JSON (diagram + prompt)
  const jsonPath = path.join(SUBMISSIONS_DIR, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    prompt: msg.prompt || '',
    diagram: msg.diagram || {},
    timestamp,
  }, null, 2));
}
```

Note: Move the `os` import to the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/submissions.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add server.js test/submissions.test.mjs
git commit -m "feat: write submission PNG and JSON to temp directory"
```

---

### Task 5: Server — State File & Lifecycle

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Write test — state file creation and cleanup**

Create `test/lifecycle.test.mjs`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(os.tmpdir(), 'cavepaintings', 'state.json');

describe('Server Lifecycle', () => {
  it('writes state file on startup and removes on shutdown', async () => {
    // Clean up
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);

    const PORT = 19734;
    const proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], {
      cwd: ROOT,
    });

    // Wait for server to start
    await new Promise((resolve) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      setTimeout(resolve, 2000);
    });

    // State file should exist
    assert.ok(fs.existsSync(STATE_FILE), 'State file should exist after startup');
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    assert.strictEqual(state.port, PORT);
    assert.strictEqual(state.pid, proc.pid);
    assert.ok(state.url.includes(String(PORT)));

    // Kill server
    proc.kill('SIGTERM');
    await new Promise((resolve) => proc.on('close', resolve));

    // State file should be removed
    assert.ok(!fs.existsSync(STATE_FILE), 'State file should be removed after shutdown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/lifecycle.test.mjs`
Expected: FAIL — no state file written

- [ ] **Step 3: Add state file management to server.js**

Add to `server.js`:

```js
const STATE_DIR = path.join(os.tmpdir(), 'cavepaintings');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const noState = process.env.CAVEPAINTINGS_NO_STATE === '1';

// After server.listen callback, add:
if (!noState) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    port: opts.port,
    pid: process.pid,
    url: `http://localhost:${opts.port}`,
  }, null, 2));
}

// Add graceful shutdown:
function shutdown() {
  if (!noState && fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
  // Clean up submission temp files
  if (fs.existsSync(SUBMISSIONS_DIR)) {
    fs.rmSync(SUBMISSIONS_DIR, { recursive: true });
  }
  wss.close();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/lifecycle.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add server.js test/lifecycle.test.mjs
git commit -m "feat: state file management and graceful shutdown"
```

---

### Task 6: Server — Browser Opening

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add cross-platform browser open function**

Add to `server.js`:

```js
import { exec } from 'node:child_process';

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) console.error('Could not open browser:', err.message);
  });
}
```

In the `server.listen` callback, add:
```js
if (opts.open) {
  openBrowser(`http://localhost:${opts.port}`);
}
```

- [ ] **Step 2: Manually verify**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node server.js --port 9731`
Expected: Browser opens to `http://localhost:9731`, shows placeholder page. Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add server.js
git commit -m "feat: cross-platform browser opening on startup"
```

---

### Task 7: Canvas — HTML Structure & CSS

**Files:**
- Modify: `index.html`
- Create: `style.css`

- [ ] **Step 1: Write the full index.html**

Replace `index.html` with the complete canvas app structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cavepaintings</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <!-- Left Toolbar -->
    <div id="toolbar">
      <div class="tool-group">
        <button class="tool-btn active" data-tool="select" title="Select (V)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
        </button>
        <button class="tool-btn" data-tool="rect" title="Rectangle (R)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
        </button>
        <button class="tool-btn" data-tool="ellipse" title="Ellipse (E)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="9"/></svg>
        </button>
        <button class="tool-btn" data-tool="arrow" title="Arrow (A)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="14 5 19 5 19 10"/></svg>
        </button>
        <button class="tool-btn" data-tool="draw" title="Freehand (D)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c3-3 6 2 9-1s3-6 6-4"/></svg>
        </button>
        <button class="tool-btn" data-tool="text" title="Text (T)">
          <span style="font-weight:bold;font-size:16px">T</span>
        </button>
        <button class="tool-btn" data-tool="image" title="Image (I)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </button>
      </div>

      <div class="tool-separator"></div>

      <div class="tool-group">
        <button class="tool-btn" id="btn-undo" title="Undo (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button class="tool-btn" id="btn-redo" title="Redo (Ctrl+Y)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
        </button>
        <button class="tool-btn" id="btn-grid" title="Toggle Grid (G)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
        <button class="tool-btn" id="btn-clear" title="Clear Canvas">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="tool-separator"></div>

      <!-- Export/Import -->
      <div class="tool-group">
        <button class="tool-btn" id="btn-export-png" title="Export PNG">PNG</button>
        <button class="tool-btn" id="btn-export-svg" title="Export SVG">SVG</button>
        <button class="tool-btn" id="btn-export-json" title="Export JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <button class="tool-btn" id="btn-import-json" title="Import JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    </div>

    <!-- Canvas Area -->
    <div id="canvas-container">
      <canvas id="drawing-canvas"></canvas>
    </div>

    <!-- Properties Panel (hidden by default) -->
    <div id="properties-panel" class="hidden">
      <div class="panel-title">Properties</div>
      <div class="prop-row">
        <label>Fill</label>
        <input type="color" id="prop-fill" value="#4a9eff">
      </div>
      <div class="prop-row">
        <label>Stroke</label>
        <input type="color" id="prop-stroke" value="#4a9eff">
      </div>
      <div class="prop-row">
        <label>Stroke Width</label>
        <input type="range" id="prop-stroke-width" min="1" max="20" value="2">
      </div>
      <div class="prop-row">
        <label>Font Size</label>
        <input type="range" id="prop-font-size" min="8" max="72" value="16">
      </div>
      <div class="prop-row">
        <label>Opacity</label>
        <input type="range" id="prop-opacity" min="0" max="100" value="100">
      </div>
      <div class="prop-actions">
        <button id="prop-delete" title="Delete">Del</button>
        <button id="prop-duplicate" title="Duplicate">Dup</button>
        <button id="prop-forward" title="Bring Forward">↑</button>
        <button id="prop-backward" title="Send Backward">↓</button>
      </div>
    </div>

    <!-- Bottom Bar -->
    <div id="bottom-bar">
      <div id="connection-status">
        <span id="status-dot" class="disconnected"></span>
        <span id="status-text">Disconnected</span>
      </div>
      <input type="text" id="prompt-input" placeholder="Add a message (optional)...">
      <button id="btn-submit" disabled>Submit to Claude</button>
    </div>
  </div>

  <!-- Hidden file input for image/json import -->
  <input type="file" id="file-input-image" accept="image/*" style="display:none">
  <input type="file" id="file-input-json" accept=".json" style="display:none">

  <script src="https://cdn.jsdelivr.net/npm/fabric@6.5.1/dist/index.min.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write style.css**

Create `style.css`:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a2e;
  color: #e0e0f0;
  overflow: hidden;
  height: 100vh;
}

#app {
  display: flex;
  height: 100vh;
  flex-direction: row;
}

/* Toolbar */
#toolbar {
  width: 56px;
  background: #16213e;
  border-right: 1px solid #0f3460;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
  overflow-y: auto;
  flex-shrink: 0;
}

.tool-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.tool-btn {
  width: 40px;
  height: 40px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #a0a0b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.tool-btn:hover {
  background: #0f3460;
  color: #e0e0f0;
}

.tool-btn.active {
  background: #0f3460;
  border-color: #e94560;
  color: #e94560;
}

.tool-separator {
  width: 32px;
  height: 1px;
  background: #0f3460;
  margin: 4px 0;
}

/* Canvas Container */
#canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

#canvas-container canvas {
  display: block;
}

/* Properties Panel */
#properties-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 180px;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  padding: 12px;
  z-index: 10;
}

#properties-panel.hidden {
  display: none;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.prop-row {
  margin-bottom: 6px;
}

.prop-row label {
  display: block;
  font-size: 11px;
  color: #a0a0b8;
  margin-bottom: 2px;
}

.prop-row input[type="color"] {
  width: 100%;
  height: 24px;
  border: 1px solid #0f3460;
  border-radius: 4px;
  background: #1a1a2e;
  cursor: pointer;
}

.prop-row input[type="range"] {
  width: 100%;
  accent-color: #4a9eff;
}

.prop-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.prop-actions button {
  flex: 1;
  padding: 4px;
  background: #0f3460;
  border: 1px solid #1a3a6e;
  border-radius: 4px;
  color: #a0a0b8;
  cursor: pointer;
  font-size: 11px;
}

.prop-actions button:hover {
  color: #e0e0f0;
  background: #1a3a6e;
}

/* Bottom Bar */
#bottom-bar {
  position: fixed;
  bottom: 0;
  left: 56px;
  right: 0;
  height: 48px;
  background: #16213e;
  border-top: 1px solid #0f3460;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  z-index: 10;
}

#connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}

#status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

#status-dot.connected { background: #50c878; }
#status-dot.disconnected { background: #e94560; }

#prompt-input {
  flex: 1;
  height: 32px;
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 6px;
  padding: 0 10px;
  color: #e0e0f0;
  font-size: 13px;
  outline: none;
}

#prompt-input:focus {
  border-color: #4a9eff;
}

#prompt-input::placeholder {
  color: #606080;
}

#btn-submit {
  height: 32px;
  background: #e94560;
  border: none;
  border-radius: 6px;
  padding: 0 16px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}

#btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

#btn-submit:not(:disabled):hover {
  opacity: 0.9;
}
```

- [ ] **Step 3: Manually verify layout**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node server.js --port 9731`
Expected: Browser shows the layout with toolbar, canvas area, and bottom bar. Kill with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add index.html style.css
git commit -m "feat: canvas app HTML structure and CSS theme"
```

---

### Task 8: Canvas — Fabric.js Initialization & Drawing Tools

**Files:**
- Create: `app.js`

- [ ] **Step 1: Write app.js with canvas init and tool switching**

Create `app.js`:

```js
/* global fabric */

// --- State ---
let canvas;
let currentTool = 'select';
let isDrawing = false;
let drawStart = null;
let tempShape = null;
let undoStack = [];
let redoStack = [];
let gridVisible = false;

// --- Canvas Init ---
function initCanvas() {
  const container = document.getElementById('canvas-container');
  canvas = new fabric.Canvas('drawing-canvas', {
    width: container.clientWidth,
    height: container.clientHeight - 48, // subtract bottom bar
    backgroundColor: '#1a1a2e',
    selection: true,
  });

  window.addEventListener('resize', () => {
    canvas.setDimensions({
      width: container.clientWidth,
      height: container.clientHeight - 48,
    });
    canvas.renderAll();
  });

  saveState();
  setupCanvasEvents();
  setupToolbar();
  setupKeyboard();
  setupPaste();
  setupExportImport();
  restoreFromLocalStorage();
  startAutoSave();
}

// --- State Management (Undo/Redo) ---
function saveState() {
  undoStack.push(canvas.toJSON());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  canvas.loadFromJSON(undoStack[undoStack.length - 1], () => canvas.renderAll());
}

function redo() {
  if (redoStack.length === 0) return;
  const state = redoStack.pop();
  undoStack.push(state);
  canvas.loadFromJSON(state, () => canvas.renderAll());
}

// --- Tool Switching ---
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  canvas.isDrawingMode = (tool === 'draw');
  if (tool === 'draw') {
    canvas.freeDrawingBrush.color = '#e0e0f0';
    canvas.freeDrawingBrush.width = 2;
  }

  canvas.selection = (tool === 'select');
  canvas.forEachObject(obj => {
    obj.selectable = (tool === 'select');
    obj.evented = (tool === 'select');
  });
}

// --- Canvas Drawing Events ---
function setupCanvasEvents() {
  canvas.on('mouse:down', (opt) => {
    if (currentTool === 'select' || currentTool === 'draw') return;
    const pointer = canvas.getScenePoint(opt.e);
    isDrawing = true;
    drawStart = { x: pointer.x, y: pointer.y };

    if (currentTool === 'rect') {
      tempShape = new fabric.Rect({
        left: pointer.x, top: pointer.y,
        width: 0, height: 0,
        fill: 'rgba(74, 158, 255, 0.1)',
        stroke: '#4a9eff', strokeWidth: 2,
        selectable: false, evented: false,
      });
      canvas.add(tempShape);
    } else if (currentTool === 'ellipse') {
      tempShape = new fabric.Ellipse({
        left: pointer.x, top: pointer.y,
        rx: 0, ry: 0,
        fill: 'rgba(74, 158, 255, 0.1)',
        stroke: '#4a9eff', strokeWidth: 2,
        selectable: false, evented: false,
      });
      canvas.add(tempShape);
    } else if (currentTool === 'arrow') {
      tempShape = new fabric.Line(
        [pointer.x, pointer.y, pointer.x, pointer.y],
        { stroke: '#e0e0f0', strokeWidth: 2, selectable: false, evented: false }
      );
      canvas.add(tempShape);
    } else if (currentTool === 'text') {
      const text = new fabric.IText('Text', {
        left: pointer.x, top: pointer.y,
        fontSize: 16, fill: '#e0e0f0',
        fontFamily: 'sans-serif',
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      setTool('select');
      saveState();
    }
  });

  canvas.on('mouse:move', (opt) => {
    if (!isDrawing || !tempShape || !drawStart) return;
    const pointer = canvas.getScenePoint(opt.e);

    if (currentTool === 'rect') {
      const left = Math.min(drawStart.x, pointer.x);
      const top = Math.min(drawStart.y, pointer.y);
      tempShape.set({
        left, top,
        width: Math.abs(pointer.x - drawStart.x),
        height: Math.abs(pointer.y - drawStart.y),
      });
    } else if (currentTool === 'ellipse') {
      const left = Math.min(drawStart.x, pointer.x);
      const top = Math.min(drawStart.y, pointer.y);
      tempShape.set({
        left, top,
        rx: Math.abs(pointer.x - drawStart.x) / 2,
        ry: Math.abs(pointer.y - drawStart.y) / 2,
      });
    } else if (currentTool === 'arrow') {
      tempShape.set({ x2: pointer.x, y2: pointer.y });
    }
    canvas.renderAll();
  });

  canvas.on('mouse:up', () => {
    if (!isDrawing) return;
    isDrawing = false;

    if (tempShape) {
      tempShape.set({ selectable: true, evented: true });

      // Add arrowhead for arrows
      if (currentTool === 'arrow') {
        const line = tempShape;
        const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
        const headLen = 12;
        const arrowHead = new fabric.Polygon([
          { x: 0, y: 0 },
          { x: -headLen, y: headLen / 2 },
          { x: -headLen, y: -headLen / 2 },
        ], {
          left: line.x2, top: line.y2,
          fill: '#e0e0f0',
          angle: (angle * 180) / Math.PI,
          originX: 'center', originY: 'center',
          selectable: false, evented: false,
        });
        const group = new fabric.Group([line, arrowHead], {
          selectable: true, evented: true,
        });
        canvas.remove(line);
        canvas.add(group);
      }

      tempShape = null;
      saveState();
    }

    drawStart = null;
  });

  // Track object modifications for undo
  canvas.on('object:modified', saveState);
  canvas.on('path:created', saveState);

  // Show/hide properties panel
  canvas.on('selection:created', updatePropertiesPanel);
  canvas.on('selection:updated', updatePropertiesPanel);
  canvas.on('selection:cleared', () => {
    document.getElementById('properties-panel').classList.add('hidden');
  });
}

// --- Properties Panel ---
function updatePropertiesPanel() {
  const obj = canvas.getActiveObject();
  if (!obj) return;

  const panel = document.getElementById('properties-panel');
  panel.classList.remove('hidden');

  const fill = obj.fill || '#4a9eff';
  const stroke = obj.stroke || '#4a9eff';
  document.getElementById('prop-fill').value =
    typeof fill === 'string' && fill.startsWith('#') ? fill : '#4a9eff';
  document.getElementById('prop-stroke').value =
    typeof stroke === 'string' && stroke.startsWith('#') ? stroke : '#4a9eff';
  document.getElementById('prop-stroke-width').value = obj.strokeWidth || 2;
  document.getElementById('prop-opacity').value = (obj.opacity || 1) * 100;

  const fontSizeRow = document.getElementById('prop-font-size').closest('.prop-row');
  if (obj.type === 'i-text' || obj.type === 'text') {
    fontSizeRow.style.display = 'block';
    document.getElementById('prop-font-size').value = obj.fontSize || 16;
  } else {
    fontSizeRow.style.display = 'none';
  }
}

function setupPropertiesListeners() {
  document.getElementById('prop-fill').addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('fill', e.target.value); canvas.renderAll(); saveState(); }
  });
  document.getElementById('prop-stroke').addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('stroke', e.target.value); canvas.renderAll(); saveState(); }
  });
  document.getElementById('prop-stroke-width').addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('strokeWidth', parseInt(e.target.value)); canvas.renderAll(); saveState(); }
  });
  document.getElementById('prop-font-size').addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('fontSize', parseInt(e.target.value)); canvas.renderAll(); saveState(); }
  });
  document.getElementById('prop-opacity').addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('opacity', parseInt(e.target.value) / 100); canvas.renderAll(); saveState(); }
  });

  document.getElementById('prop-delete').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) { canvas.remove(obj); saveState(); }
  });
  document.getElementById('prop-duplicate').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) {
      obj.clone().then(cloned => {
        cloned.set({ left: cloned.left + 20, top: cloned.top + 20 });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        saveState();
      });
    }
  });
  document.getElementById('prop-forward').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) { canvas.bringObjectForward(obj); saveState(); }
  });
  document.getElementById('prop-backward').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) { canvas.sendObjectBackwards(obj); saveState(); }
  });
}

// --- Toolbar Buttons ---
function setupToolbar() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear the entire canvas?')) {
      canvas.clear();
      canvas.backgroundColor = '#1a1a2e';
      canvas.renderAll();
      saveState();
      localStorage.removeItem('cavepaintings-canvas');
    }
  });
  document.getElementById('btn-grid').addEventListener('click', toggleGrid);

  // Image tool opens file picker
  document.querySelector('[data-tool="image"]').addEventListener('click', () => {
    document.getElementById('file-input-image').click();
  });

  document.getElementById('file-input-image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addImageToCanvas(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  setupPropertiesListeners();
}

// --- Keyboard Shortcuts ---
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't intercept when editing text
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.isEditing) return;

    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'r' || e.key === 'R') setTool('rect');
    if (e.key === 'e' || e.key === 'E') setTool('ellipse');
    if (e.key === 'a' || e.key === 'A') setTool('arrow');
    if (e.key === 'd' || e.key === 'D') setTool('draw');
    if (e.key === 't' || e.key === 'T') setTool('text');
    if (e.key === 'i' || e.key === 'I') setTool('image');
    if (e.key === 'g' || e.key === 'G') toggleGrid();

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (activeObj) { canvas.remove(activeObj); saveState(); }
    }
  });
}

// --- Paste Image ---
function setupPaste() {
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          addImageToCanvas(ev.target.result);
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
  });
}

function addImageToCanvas(dataUrl) {
  fabric.FabricImage.fromURL(dataUrl).then(img => {
    // Scale down if too large
    const maxDim = Math.min(canvas.width, canvas.height) * 0.6;
    if (img.width > maxDim || img.height > maxDim) {
      const scale = maxDim / Math.max(img.width, img.height);
      img.scale(scale);
    }
    img.set({
      left: canvas.width / 2 - (img.getScaledWidth() / 2),
      top: canvas.height / 2 - (img.getScaledHeight() / 2),
    });
    canvas.add(img);
    canvas.setActiveObject(img);
    setTool('select');
    saveState();
  });
}

// --- Grid ---
function toggleGrid() {
  gridVisible = !gridVisible;
  document.getElementById('btn-grid').classList.toggle('active', gridVisible);

  if (gridVisible) {
    canvas.set('backgroundImage', createGridPattern());
  } else {
    canvas.set('backgroundImage', null);
  }
  canvas.renderAll();
}

function createGridPattern() {
  const gridSize = 24;
  const dotSize = 1;
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = gridSize;
  patternCanvas.height = gridSize;
  const ctx = patternCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(160, 160, 184, 0.15)';
  ctx.beginPath();
  ctx.arc(gridSize / 2, gridSize / 2, dotSize, 0, Math.PI * 2);
  ctx.fill();

  return new fabric.Pattern({
    source: patternCanvas,
    repeat: 'repeat',
  });
}

// --- Export/Import ---
function setupExportImport() {
  document.getElementById('btn-export-png').addEventListener('click', () => {
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    downloadFile(dataUrl, 'cavepaintings.png');
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    const svg = canvas.toSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, 'cavepaintings.svg');
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const json = JSON.stringify(canvas.toJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, 'cavepaintings.json');
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('file-input-json').click();
  });

  document.getElementById('file-input-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = JSON.parse(ev.target.result);
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
        saveState();
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --- LocalStorage Persistence ---
function saveToLocalStorage() {
  try {
    const json = JSON.stringify(canvas.toJSON());
    localStorage.setItem('cavepaintings-canvas', json);
  } catch (e) {
    // localStorage might be full — silently ignore
  }
}

function restoreFromLocalStorage() {
  const saved = localStorage.getItem('cavepaintings-canvas');
  if (saved) {
    try {
      canvas.loadFromJSON(JSON.parse(saved), () => {
        canvas.renderAll();
        saveState();
      });
    } catch (e) {
      // Corrupted data — ignore
    }
  }
}

function startAutoSave() {
  setInterval(saveToLocalStorage, 30000);
  canvas.on('object:modified', saveToLocalStorage);
  canvas.on('object:added', saveToLocalStorage);
  canvas.on('object:removed', saveToLocalStorage);
  canvas.on('path:created', saveToLocalStorage);
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', initCanvas);
```

- [ ] **Step 2: Manually verify all drawing tools work**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node server.js --port 9731`

Test each tool:
- Select tool: click and drag objects
- Rectangle: click-drag creates rectangle
- Ellipse: click-drag creates ellipse
- Arrow: click-drag creates arrow with arrowhead
- Freehand: draw with mouse
- Text: click places editable text
- Image: file picker opens, selected image appears on canvas
- Ctrl+V: paste image from clipboard
- Undo/Redo: works as expected
- Grid toggle: dot grid appears/disappears
- Properties panel: appears when object selected, controls work
- Keyboard shortcuts: V, R, E, A, D, T, I, G, Ctrl+Z, Ctrl+Y, Delete

Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add app.js
git commit -m "feat: Fabric.js canvas with drawing tools, properties, undo/redo, export/import"
```

---

### Task 9: Canvas — Zoom/Pan & Snap-to-Grid

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add zoom with scroll wheel**

Add to `app.js` in `setupCanvasEvents()`:

```js
  // Zoom with scroll wheel
  canvas.on('mouse:wheel', (opt) => {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.min(Math.max(zoom, 0.1), 10);
    canvas.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
  });

  // Pan with middle mouse button or Alt+drag
  let isPanning = false;
  let panStart = null;

  canvas.on('mouse:down', (opt) => {
    if (opt.e.button === 1 || (opt.e.altKey && opt.e.button === 0)) {
      isPanning = true;
      panStart = { x: opt.e.clientX, y: opt.e.clientY };
      canvas.selection = false;
      opt.e.preventDefault();
    }
  });

  canvas.on('mouse:move', (opt) => {
    if (!isPanning || !panStart) return;
    const vpt = canvas.viewportTransform;
    vpt[4] += opt.e.clientX - panStart.x;
    vpt[5] += opt.e.clientY - panStart.y;
    panStart = { x: opt.e.clientX, y: opt.e.clientY };
    canvas.requestRenderAll();
  });

  canvas.on('mouse:up', (opt) => {
    if (isPanning) {
      isPanning = false;
      panStart = null;
      canvas.selection = (currentTool === 'select');
    }
  });
```

- [ ] **Step 2: Add snap-to-grid when grid is enabled**

Add to `app.js`:

```js
const GRID_SIZE = 24;

function setupSnapToGrid() {
  canvas.on('object:moving', (opt) => {
    if (!gridVisible) return;
    const obj = opt.target;
    obj.set({
      left: Math.round(obj.left / GRID_SIZE) * GRID_SIZE,
      top: Math.round(obj.top / GRID_SIZE) * GRID_SIZE,
    });
  });
}
```

Call `setupSnapToGrid()` from `initCanvas()`.

- [ ] **Step 3: Manually verify zoom/pan and snap-to-grid**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node server.js --port 9731`

Test:
- Scroll wheel zooms in/out centered on cursor
- Alt+drag pans the canvas
- Middle mouse button drag also pans
- With grid enabled, dragging objects snaps to grid positions
- With grid disabled, no snapping occurs

Kill with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add app.js
git commit -m "feat: add zoom/pan and snap-to-grid support"
```

---

### Task 10: Canvas — WebSocket Client & Submit

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Write WebSocket client code**

Add to the end of `app.js` (before the DOMContentLoaded listener):

```js
// --- WebSocket Connection ---
let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
    setConnectionStatus(true);
  });

  ws.addEventListener('close', () => {
    setConnectionStatus(false);
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    ws.close();
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'ack') {
      showSubmitFeedback();
    }
  });
}

function scheduleReconnect() {
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectWebSocket();
  }, reconnectDelay);
}

function setConnectionStatus(connected) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const btn = document.getElementById('btn-submit');

  dot.className = connected ? 'connected' : 'disconnected';
  text.textContent = connected ? 'Connected' : 'Disconnected';
  btn.disabled = !connected;
}

function submitToClaude() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const imageData = canvas.toDataURL({ format: 'png', multiplier: 2 });
  const diagramData = canvas.toJSON();
  const prompt = document.getElementById('prompt-input').value.trim();

  ws.send(JSON.stringify({
    type: 'submit',
    image: imageData,
    diagram: diagramData,
    prompt: prompt,
  }));
}

function showSubmitFeedback() {
  const btn = document.getElementById('btn-submit');
  const originalText = btn.textContent;
  btn.textContent = 'Sent!';
  btn.style.background = '#50c878';
  document.getElementById('prompt-input').value = '';
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 1500);
}
```

- [ ] **Step 2: Wire up submit button and WebSocket init**

In `initCanvas()`, add at the end:

```js
  document.getElementById('btn-submit').addEventListener('click', submitToClaude);
  connectWebSocket();
```

- [ ] **Step 3: Manually verify end-to-end submission**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node server.js --port 9731`

1. Draw something on the canvas
2. Type a message in the prompt input
3. Click "Submit to Claude"
4. Button should briefly show "Sent!" in green
5. Check `<tmpdir>/cavepaintings/submissions/` for PNG and JSON files

Kill with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add app.js
git commit -m "feat: WebSocket client with auto-reconnect and submit flow"
```

---

### Task 11: Skills — Start and Stop

**Files:**
- Create: `skills/cavepaintings.md`
- Create: `skills/cavepaintings-stop.md`

- [ ] **Step 1: Create the start skill**

Create `skills/cavepaintings.md`:

```markdown
---
name: cavepaintings
description: Open the Cavepaintings drawing canvas in your browser for diagramming, annotating images, and submitting visuals to Claude Code
---

Launch the Cavepaintings canvas server and open the browser.

## Steps

1. Check if a cavepaintings session is already running:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
if (fs.existsSync(stateFile)) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  try { process.kill(state.pid, 0); console.log('RUNNING:' + JSON.stringify(state)); }
  catch { console.log('STALE'); fs.unlinkSync(stateFile); }
} else { console.log('NOT_RUNNING'); }
"
```

2. If `RUNNING`, open the browser to the existing URL and tell the user:
   > "Cavepaintings is already open at {url}"

3. If `NOT_RUNNING` or `STALE`, start the server:

```bash
cd <cavepaintings-project-dir> && node server.js &
```

Run this with `run_in_background: true` so the server persists.

4. Wait briefly, then read the state file to get the URL:

```bash
cat $(node -e "const os=require('os');const path=require('path');console.log(path.join(os.tmpdir(),'cavepaintings','state.json'))")
```

5. Tell the user:
   > "Cavepaintings canvas open at {url}. Draw diagrams, paste images, and click 'Submit to Claude' to send them here."

6. After the user submits from the canvas, check the submissions directory for new files:

```bash
ls -t $(node -e "const os=require('os');const path=require('path');console.log(path.join(os.tmpdir(),'cavepaintings','submissions'))")
```

Read the newest JSON file for the prompt text, and read the newest PNG as an image attachment. Present them as user input.
```

- [ ] **Step 2: Create the stop skill**

Create `skills/cavepaintings-stop.md`:

```markdown
---
name: cavepaintings-stop
description: Stop the running Cavepaintings canvas server
---

Shut down the Cavepaintings server.

## Steps

1. Read the state file and kill the server:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
if (fs.existsSync(stateFile)) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  try { process.kill(state.pid, 'SIGTERM'); } catch {}
  console.log('Stopped cavepaintings server (PID ' + state.pid + ')');
} else {
  console.log('No cavepaintings session found');
}
"
```

2. Confirm to the user:
   > "Cavepaintings stopped."
```

- [ ] **Step 3: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add skills/cavepaintings.md skills/cavepaintings-stop.md
git commit -m "feat: add start and stop Claude Code skills"
```

---

### Task 12: Integration Test — End-to-End

**Files:**
- Create: `test/e2e.test.mjs`

- [ ] **Step 1: Write end-to-end test**

Create `test/e2e.test.mjs`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

describe('End-to-End', () => {
  let proc;
  const PORT = 19735;

  before(async () => {
    // Clean up
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    if (fs.existsSync(SUBMISSIONS_DIR)) fs.rmSync(SUBMISSIONS_DIR, { recursive: true });

    proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], { cwd: ROOT });
    await new Promise((resolve) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      setTimeout(resolve, 2000);
    });
  });

  after(() => {
    proc?.kill();
    if (fs.existsSync(SUBMISSIONS_DIR)) fs.rmSync(SUBMISSIONS_DIR, { recursive: true });
  });

  it('full flow: connect, submit, verify files and ack', async () => {
    // 1. State file should exist
    assert.ok(fs.existsSync(STATE_FILE), 'State file exists');
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    assert.strictEqual(state.port, PORT);

    // 2. HTTP serves index.html
    const http = await import('node:http');
    const html = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${PORT}/`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    assert.ok(html.includes('Cavepaintings'));

    // 3. WebSocket connect and submit
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve) => ws.on('open', resolve));

    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const diagram = { version: '6.0.0', objects: [{ type: 'rect' }] };

    const ack = await new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      ws.send(JSON.stringify({
        type: 'submit',
        image: `data:image/png;base64,${tinyPng}`,
        diagram,
        prompt: 'e2e test',
      }));
    });

    assert.strictEqual(ack.type, 'ack');

    // 4. Verify submission files
    const files = fs.readdirSync(SUBMISSIONS_DIR);
    assert.ok(files.some(f => f.endsWith('.png')), 'PNG file created');
    assert.ok(files.some(f => f.endsWith('.json')), 'JSON file created');

    const jsonFile = files.find(f => f.endsWith('.json'));
    const content = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, jsonFile), 'utf8'));
    assert.strictEqual(content.prompt, 'e2e test');

    ws.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/e2e.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add test/e2e.test.mjs
git commit -m "test: add end-to-end integration test"
```

---

### Task 13: Final Verification & Cleanup

- [ ] **Step 1: Run all tests**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node --test test/*.test.mjs`
Expected: All tests pass

- [ ] **Step 2: Manual smoke test**

Run: `cd /run/media/system/Dos/Projects/cavepaintings && node server.js`

Verify:
- Browser opens automatically
- All drawing tools work
- Image paste works (Ctrl+V)
- Properties panel works
- Undo/Redo works
- Grid toggle works
- Export PNG/SVG/JSON works
- Import JSON works
- Submit to Claude sends and shows "Sent!"
- Canvas persists across page refreshes (localStorage)
- Connection status shows Connected (green dot)

Kill with Ctrl+C. Verify state file is cleaned up.

- [ ] **Step 3: Final commit**

```bash
cd /run/media/system/Dos/Projects/cavepaintings
git add -A
git commit -m "chore: final cleanup and verification"
```
