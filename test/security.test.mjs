import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

const SECURITY_PORT = 19750;

describe('Security Headers', () => {
  let proc;

  before(async () => {
    proc = spawn('node', ['server.js', '--port', String(SECURITY_PORT), '--no-open'], {
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

  it('includes Content-Security-Policy header', async () => {
    const res = await fetch(`http://localhost:${SECURITY_PORT}/`);
    assert.ok(res.headers['content-security-policy'], 'CSP header missing');
    const csp = res.headers['content-security-policy'];
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("img-src 'self' https: data: blob:"));
    assert.ok(csp.includes("connect-src 'self' https: ws://localhost:* wss://localhost:*"));
  });

  it('includes X-Content-Type-Options header', async () => {
    const res = await fetch(`http://localhost:${SECURITY_PORT}/`);
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  });

  it('includes X-Frame-Options header', async () => {
    const res = await fetch(`http://localhost:${SECURITY_PORT}/`);
    assert.strictEqual(res.headers['x-frame-options'], 'DENY');
  });

  it('includes Referrer-Policy header', async () => {
    const res = await fetch(`http://localhost:${SECURITY_PORT}/`);
    assert.strictEqual(res.headers['referrer-policy'], 'no-referrer');
  });

  it('includes security headers on API responses too', async () => {
    const res = await fetch(`http://localhost:${SECURITY_PORT}/api/info`);
    assert.ok(res.headers['content-security-policy']);
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  });
});

describe('Input Validation — POST /api/canvas', () => {
  let proc;
  const PORT = 19751;

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

  function post(body) {
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    return httpRequest({
      hostname: 'localhost', port: PORT, path: '/api/canvas', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(str) },
    }, str);
  }

  it('rejects missing diagram field', async () => {
    const res = await post({ mode: 'merge' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects non-object diagram', async () => {
    const res = await post({ diagram: 'not-object', mode: 'merge' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects diagram without objects array', async () => {
    const res = await post({ diagram: {}, mode: 'merge' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects invalid mode', async () => {
    const res = await post({ diagram: { objects: [] }, mode: 'invalid' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects objects without type field', async () => {
    const res = await post({ diagram: { objects: [{ left: 10 }] }, mode: 'merge' });
    assert.strictEqual(res.status, 400);
  });

  it('rejects unknown top-level keys', async () => {
    const res = await post({ diagram: { objects: [] }, mode: 'merge', extra: true });
    assert.strictEqual(res.status, 400);
  });

  it('rejects oversized payloads (Content-Length > 5MB)', async () => {
    const huge = JSON.stringify({ diagram: { objects: [] }, mode: 'merge', pad: 'x'.repeat(6 * 1024 * 1024) });
    const res = await httpRequest({
      hostname: 'localhost', port: PORT, path: '/api/canvas', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(huge) },
    }, huge);
    assert.strictEqual(res.status, 413);
  });

  it('accepts valid payload (returns 503 with no browser — expected)', async () => {
    const res = await post({ diagram: { objects: [{ type: 'rect' }] }, mode: 'merge' });
    assert.ok(res.status === 503 || res.status === 200, `Expected 503 or 200, got ${res.status}`);
  });
});

describe('WebSocket Origin Checking', () => {
  let proc;
  const PORT = 19752;

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

  it('accepts connections from http://localhost origin', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Origin: `http://localhost:${PORT}` } });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.close();
  });

  it('accepts connections from http://127.0.0.1 origin', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Origin: 'http://127.0.0.1:9999' } });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.close();
  });

  it('accepts connections with no Origin header (non-browser clients)', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: {} });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.close();
  });

  it('rejects connections from foreign origins', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Origin: 'http://evil.com' } });
    await new Promise((resolve, reject) => {
      ws.on('error', () => resolve('rejected'));
      ws.on('unexpected-response', () => resolve('rejected'));
      ws.on('open', () => reject(new Error('Should not have connected')));
    });
  });
});
