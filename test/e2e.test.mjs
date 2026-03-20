import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

describe('End-to-End', () => {
  let proc;
  const PORT = 19735;

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

  it('full flow: connect, submit, verify files and ack', async () => {
    // 1. HTTP serves index.html
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
