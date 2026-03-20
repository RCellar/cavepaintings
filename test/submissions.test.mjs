import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('Submission Storage', () => {
  let proc;
  const PORT = 19733;

  before(async () => {
    // Clean up any leftover submissions
    if (fs.existsSync(SUBMISSIONS_DIR)) {
      fs.rmSync(SUBMISSIONS_DIR, { recursive: true, force: true });
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
      fs.rmSync(SUBMISSIONS_DIR, { recursive: true, force: true });
    }
  });

  it('writes PNG and JSON files on submit', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const ackPromise = new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    ws.send(JSON.stringify({
      type: 'submit',
      image: `data:image/png;base64,${TINY_PNG}`,
      diagram: { shapes: [] },
      prompt: 'test prompt',
    }));

    const ack = await ackPromise;
    assert.strictEqual(ack.type, 'ack');
    ws.close();

    // Give file writes a moment to complete
    await new Promise((r) => setTimeout(r, 200));

    assert.ok(fs.existsSync(SUBMISSIONS_DIR), 'submissions dir should exist');

    const files = fs.readdirSync(SUBMISSIONS_DIR);
    const pngFiles = files.filter((f) => f.endsWith('.png'));
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    assert.ok(pngFiles.length >= 1, 'should have at least one PNG file');
    assert.ok(jsonFiles.length >= 1, 'should have at least one JSON file');

    // Find our json file — it should have prompt 'test prompt'
    let ourJson = null;
    for (const f of jsonFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, f), 'utf8'));
      if (data.prompt === 'test prompt') { ourJson = data; break; }
    }
    assert.ok(ourJson, 'should find our submission JSON');
    assert.deepStrictEqual(ourJson.diagram, { shapes: [] });
    assert.ok(ourJson.timestamp, 'should have a timestamp');
  });

  it('sends ack only after files are written to disk', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const ackPromise = new Promise((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    ws.send(JSON.stringify({
      type: 'submit',
      image: `data:image/png;base64,${TINY_PNG}`,
      diagram: { shapes: ['test'] },
      prompt: 'ack-timing test',
    }));

    const ack = await ackPromise;
    assert.strictEqual(ack.type, 'ack');

    const files = fs.readdirSync(SUBMISSIONS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    let found = false;
    for (const f of jsonFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, f), 'utf8'));
      if (data.prompt === 'ack-timing test') { found = true; break; }
    }
    assert.ok(found, 'submission JSON should exist at the time ack is received');

    ws.close();
  });
});
