import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

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

function handleSubmission(msg) {
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(SUBMISSIONS_DIR, timestamp);

  // Write PNG
  const pngData = (msg.png || '').replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(`${base}.png`, Buffer.from(pngData, 'base64'));

  // Write JSON
  fs.writeFileSync(`${base}.json`, JSON.stringify({
    prompt: msg.prompt || '',
    diagram: msg.diagram || {},
    timestamp: new Date().toISOString(),
  }, null, 2));
}

let wss;

listen(opts.port);

wss = new WebSocketServer({ server });
wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'submit') {
        handleSubmission(msg);
        socket.send(JSON.stringify({ type: 'ack' }));
      }
    } catch (e) {
      // ignore malformed messages
    }
  });
});

export { server, wss, opts };
