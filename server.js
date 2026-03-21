import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { exec } from 'node:child_process';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');
const STATE_DIR = path.join(os.tmpdir(), 'cavepaintings');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const noState = !!process.env.CAVEPAINTINGS_NO_STATE;
const projectDir = process.env.CAVEPAINTINGS_PROJECT_DIR || '';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https: ws://localhost:* wss://localhost:*",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function setSecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

const rateLimits = {
  'POST /api/canvas': { max: 30, windowMs: 60000 },
  'GET /api/submissions': { max: 60, windowMs: 60000 },
  'GET /api/info': { max: 60, windowMs: 60000 },
};

const rateLimitStore = new Map();

// Periodic cleanup of expired rate limit entries (every 2 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const filtered = timestamps.filter(t => now - t < 60000);
    if (filtered.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, filtered);
    }
  }
}, 120000).unref();

function checkRateLimit(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const endpoint = `${req.method} ${new URL(req.url, 'http://localhost').pathname}`;
  const limit = rateLimits[endpoint];
  if (!limit) return true;

  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  let timestamps = rateLimitStore.get(key) || [];
  timestamps = timestamps.filter(t => now - t < limit.windowMs);

  if (timestamps.length >= limit.max) {
    const oldestInWindow = timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + limit.windowMs - now) / 1000);
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) });
    res.end(JSON.stringify({ error: 'Too many requests', retryAfter }));
    return false;
  }

  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return true;
}

function parseArgs(args) {
  const opts = { port: 9731, open: true, maxSubmissions: 50, ownerPid: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) opts.port = parseInt(args[i + 1], 10);
    if (args[i] === '--no-open') opts.open = false;
    if (args[i] === '--max-submissions' && args[i + 1]) opts.maxSubmissions = parseInt(args[i + 1], 10);
    if (args[i] === '--owner-pid' && args[i + 1]) {
      const pid = parseInt(args[i + 1], 10);
      if (pid > 0) opts.ownerPid = pid;
    }
  }
  return opts;
}

function serveStatic(req, res) {
  let parsed;
  try {
    parsed = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // Reject invalid percent-encoding sequences
  try {
    decodeURIComponent(parsed.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // Block path traversal — reject raw URLs containing '..' segments
  if (req.url.split('?')[0].split('/').some((seg) => seg === '..' || seg === '.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const pathname = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const resolved = path.resolve(__dirname, '.' + pathname);

  // Block path traversal — resolved path must be inside __dirname
  if (!resolved.startsWith(__dirname + path.sep) && resolved !== __dirname) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(resolved);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function handleApi(req, res) {
  const parsed = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && parsed.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ projectDir }));
    return;
  }

  if (req.method === 'GET' && parsed.pathname === '/api/submissions') {
    const since = parseInt(parsed.searchParams.get('since') || '0', 10);
    let submissions = [];

    if (fs.existsSync(SUBMISSIONS_DIR)) {
      const jsonFiles = fs.readdirSync(SUBMISSIONS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort();

      for (const file of jsonFiles) {
        const match = file.match(/submission-(\d+)\.json$/);
        if (!match) continue;
        const ts = parseInt(match[1], 10);
        if (ts <= since) continue;

        const jsonPath = path.join(SUBMISSIONS_DIR, file);
        const pngPath = jsonPath.replace(/\.json$/, '.png');
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        submissions.push({
          id: `submission-${ts}`,
          timestamp: ts,
          prompt: data.prompt || '',
          png: fs.existsSync(pngPath) ? pngPath : null,
          json: jsonPath,
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ submissions }));
    return;
  }

  if (req.method === 'POST' && parsed.pathname === '/api/canvas') {
    // Enforce 5 MB body size limit
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 5 * 1024 * 1024) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload too large (max 5 MB)' }));
      return;
    }

    let body = '';
    let bodySize = 0;
    let oversized = false;
    req.on('data', (chunk) => {
      if (oversized) return;
      bodySize += chunk.length;
      if (bodySize > 5 * 1024 * 1024) {
        oversized = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large (max 5 MB)' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (oversized) return;

      let msg;
      try {
        msg = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Schema validation
      const validKeys = new Set(['diagram', 'mode']);
      const unknownKeys = Object.keys(msg).filter(k => !validKeys.has(k));
      if (unknownKeys.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown keys: ${unknownKeys.join(', ')}` }));
        return;
      }
      if (!msg.diagram || typeof msg.diagram !== 'object' || Array.isArray(msg.diagram)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'diagram must be an object' }));
        return;
      }
      if (!Array.isArray(msg.diagram.objects)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'diagram.objects must be an array' }));
        return;
      }
      if (msg.mode !== 'merge' && msg.mode !== 'replace') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mode must be "merge" or "replace"' }));
        return;
      }
      for (let i = 0; i < msg.diagram.objects.length; i++) {
        if (!msg.diagram.objects[i] || typeof msg.diagram.objects[i].type !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `objects[${i}] must have a string "type" field` }));
          return;
        }
      }

      if (!activeSocket || activeSocket.readyState !== 1) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No browser client connected' }));
        return;
      }

      try {
        activeSocket.send(JSON.stringify({
          type: 'load',
          diagram: msg.diagram,
          mode: msg.mode,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to forward to client' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const opts = parseArgs(process.argv.slice(2));
const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  if (req.url?.startsWith('/api/') && !checkRateLimit(req, res)) return;
  if (req.url?.startsWith('/api/')) {
    return handleApi(req, res);
  }
  serveStatic(req, res);
});

function openBrowser(url) {
  let cmd;
  if (process.platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (process.platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) console.error(`Failed to open browser: ${err.message}`);
  });
}

function shutdown() {
  if (!noState && fs.existsSync(STATE_FILE)) {
    try { fs.rmSync(STATE_FILE); } catch (e) { /* ignore */ }
  }
  try { fs.rmSync(SUBMISSIONS_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  if (wss) wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function handleSubmission(msg) {
  await fs.promises.mkdir(SUBMISSIONS_DIR, { recursive: true, mode: 0o700 });
  const timestamp = Date.now();
  const baseName = `submission-${timestamp}`;

  if (msg.image) {
    const base64Data = msg.image.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(path.join(SUBMISSIONS_DIR, `${baseName}.png`), Buffer.from(base64Data, 'base64'), { mode: 0o600 });
  }

  await fs.promises.writeFile(path.join(SUBMISSIONS_DIR, `${baseName}.json`), JSON.stringify({
    prompt: msg.prompt || '',
    diagram: msg.diagram || {},
    timestamp,
  }, null, 2), { mode: 0o600 });
  cleanupSubmissions(opts.maxSubmissions);
}

function cleanupSubmissions(maxSubmissions) {
  if (!fs.existsSync(SUBMISSIONS_DIR)) return;
  const jsonFiles = fs.readdirSync(SUBMISSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  const excess = jsonFiles.length - maxSubmissions;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) {
    const jsonPath = path.join(SUBMISSIONS_DIR, jsonFiles[i]);
    const pngPath = jsonPath.replace(/\.json$/, '.png');
    try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }
    try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
  }
}

function verifyOrigin(origin) {
  if (!origin) return true; // non-browser clients
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

let wss;
let activeSocket = null;

function tryListen(port, maxRetries = 10) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (err) => {
      if (settled) return;
      if (err.code === 'EADDRINUSE' && maxRetries > 0) {
        settled = true;
        console.log(`Port ${port} in use, trying ${port + 1}...`);
        server.close(() => {
          tryListen(port + 1, maxRetries - 1).then(resolve, reject);
        });
      } else {
        settled = true;
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(port, () => {
      if (settled) return; // stale callback from a closed listen attempt
      settled = true;
      server.removeListener('error', onError);
      resolve(port);
    });
  });
}

tryListen(opts.port)
  .then((port) => {
    opts.port = port;
    const url = `http://localhost:${port}`;
    console.log(`listening on ${url}`);

    wss = new WebSocketServer({
      server,
      maxPayload: 50 * 1024 * 1024,
      verifyClient: (info, cb) => {
        if (verifyOrigin(info.origin)) {
          cb(true);
        } else {
          cb(false, 403, 'Forbidden: invalid origin');
        }
      },
    });
    wss.on('connection', (socket) => {
      // Notify displaced tab
      if (activeSocket && activeSocket.readyState === 1) {
        try {
          activeSocket.send(JSON.stringify({ type: 'displaced', message: 'Another tab has connected' }));
        } catch { /* ignore */ }
      }
      activeSocket = socket;
      let wsMessageTimestamps = [];
      socket.on('close', () => {
        if (activeSocket === socket) activeSocket = null;
      });
      socket.on('message', async (raw) => {
        const now = Date.now();
        wsMessageTimestamps = wsMessageTimestamps.filter(t => now - t < 60000);
        if (wsMessageTimestamps.length >= 100) {
          socket.close(1008, 'Rate limit exceeded');
          return;
        }
        wsMessageTimestamps.push(now);
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'submit') {
            await handleSubmission(msg);
            socket.send(JSON.stringify({ type: 'ack', timestamp: Date.now() }));
          }
        } catch (e) {
          // ignore malformed messages or write errors
        }
      });
    });

    if (!noState) {
      fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
      try {
        const stat = fs.statSync(STATE_DIR);
        if ((stat.mode & 0o777) !== 0o700) {
          fs.chmodSync(STATE_DIR, 0o700);
        }
      } catch { /* ignore */ }
      fs.writeFileSync(STATE_FILE, JSON.stringify({ port, pid: process.pid, url, projectDir }, null, 2), { mode: 0o600 });
    }
    cleanupSubmissions(opts.maxSubmissions);

    // Watch owner process — shut down if it exits
    // Skipped on Windows: process.kill(pid, 0) is unreliable on win32
    if (opts.ownerPid && process.platform !== 'win32') {
      setInterval(() => {
        try {
          process.kill(opts.ownerPid, 0);
        } catch (err) {
          if (err.code === 'ESRCH') {
            console.log(`Owner process ${opts.ownerPid} exited, shutting down`);
            shutdown();
          }
          // EPERM = process exists but different user — treat as alive
        }
      }, 15000).unref();
    }

    if (opts.open) openBrowser(url);
  })
  .catch((err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });

export { server, wss, opts, activeSocket };
