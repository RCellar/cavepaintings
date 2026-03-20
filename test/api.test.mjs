import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('API Endpoints', () => {
  let proc;
  const PORT = 19741;

  before(async () => {
    if (fs.existsSync(SUBMISSIONS_DIR)) fs.rmSync(SUBMISSIONS_DIR, { recursive: true });

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
    if (fs.existsSync(SUBMISSIONS_DIR)) fs.rmSync(SUBMISSIONS_DIR, { recursive: true });
  });

  it('GET /api/submissions returns empty list when no submissions', async () => {
    const res = await httpRequest({ hostname: 'localhost', port: PORT, path: '/api/submissions', method: 'GET' });
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.deepStrictEqual(json.submissions, []);
  });

  it('GET /api/submissions?since=0 returns submissions after submitting', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve) => ws.on('open', resolve));
    const ackPromise = new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send(JSON.stringify({
      type: 'submit',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      diagram: { objects: [] },
      prompt: 'api test',
    }));
    await ackPromise;
    ws.close();

    await new Promise((r) => setTimeout(r, 200));

    const res = await httpRequest({ hostname: 'localhost', port: PORT, path: '/api/submissions?since=0', method: 'GET' });
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.ok(json.submissions.length >= 1);
    assert.strictEqual(json.submissions[0].prompt, 'api test');
  });

  it('POST /api/canvas returns 503 when no browser connected', async () => {
    const body = JSON.stringify({ diagram: { objects: [] }, mode: 'merge' });
    const res = await httpRequest({
      hostname: 'localhost', port: PORT, path: '/api/canvas', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body);
    assert.strictEqual(res.status, 503);
  });

  it('POST /api/canvas forwards to connected browser', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve) => ws.on('open', resolve));

    const msgPromise = new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    const body = JSON.stringify({
      diagram: { objects: [{ type: 'rect', left: 10, top: 10, width: 50, height: 50 }] },
      mode: 'merge',
    });
    const res = await httpRequest({
      hostname: 'localhost', port: PORT, path: '/api/canvas', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body);

    assert.strictEqual(res.status, 200);
    const resJson = JSON.parse(res.body);
    assert.ok(resJson.ok);

    const forwarded = await msgPromise;
    assert.strictEqual(forwarded.type, 'load');
    assert.strictEqual(forwarded.mode, 'merge');
    assert.ok(forwarded.diagram.objects.length >= 1);

    ws.close();
  });
});
