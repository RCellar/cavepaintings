import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

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

  it('blocks path traversal attempts', async () => {
    const net = await import('node:net');
    const response = await new Promise((resolve) => {
      const client = net.connect(PORT, '127.0.0.1', () => {
        client.write('GET /../../../etc/passwd HTTP/1.1\r\nHost: localhost\r\n\r\n');
        let data = '';
        client.on('data', (chunk) => data += chunk.toString());
        client.on('end', () => resolve(data));
        setTimeout(() => { client.end(); resolve(data); }, 1000);
      });
    });
    assert.ok(!response.includes('200'), 'Should not return 200 for traversal');
    assert.ok(response.includes('403') || response.includes('400'), 'Should return 403 or 400');
  });

  it('serves files with query strings correctly', async () => {
    const res = await fetch(`http://localhost:${PORT}/style.css?v=123`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/css'));
  });

  it('returns 400 for malformed URLs', async () => {
    const net = await import('node:net');
    const response = await new Promise((resolve) => {
      const client = net.connect(PORT, '127.0.0.1', () => {
        client.write('GET /%ZZ HTTP/1.1\r\nHost: localhost\r\n\r\n');
        let data = '';
        client.on('data', (chunk) => data += chunk.toString());
        client.on('end', () => resolve(data));
        setTimeout(() => { client.end(); resolve(data); }, 1000);
      });
    });
    assert.ok(response.includes('400'), 'Should return 400 for malformed URL');
  });
});

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
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    const ackPromise = new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send(JSON.stringify({ type: 'submit', png: 'data:image/png;base64,abc', diagram: {} }));
    const ack = await ackPromise;
    assert.strictEqual(ack.type, 'ack');
    ws.close();
  });
});
