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
