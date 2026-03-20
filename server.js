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

const opts = parseArgs(process.argv.slice(2));
const server = http.createServer(serveStatic);

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
  if (wss) wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function handleSubmission(msg) {
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
  const timestamp = Date.now();
  const baseName = `submission-${timestamp}`;

  // Write PNG
  if (msg.image) {
    const base64Data = msg.image.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(SUBMISSIONS_DIR, `${baseName}.png`), Buffer.from(base64Data, 'base64'));
  }

  // Write JSON (diagram + prompt)
  fs.writeFileSync(path.join(SUBMISSIONS_DIR, `${baseName}.json`), JSON.stringify({
    prompt: msg.prompt || '',
    diagram: msg.diagram || {},
    timestamp,
  }, null, 2));
}

let wss;

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

    wss = new WebSocketServer({ server });
    wss.on('connection', (socket) => {
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'submit') {
            handleSubmission(msg);
            socket.send(JSON.stringify({ type: 'ack', timestamp: Date.now() }));
          }
        } catch (e) {
          // ignore malformed messages
        }
      });
    });

    if (!noState) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify({ port, pid: process.pid, url }, null, 2));
    }
    if (opts.open) openBrowser(url);
  })
  .catch((err) => {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });

export { server, wss, opts };
