import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(os.tmpdir(), 'cavepaintings', 'state.json');

describe('Server Lifecycle', () => {
  it('creates state.json on start and removes it on SIGTERM', async () => {
    // Clean up any leftover state file
    if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE);

    const proc = spawn('node', ['server.js', '--port', '19734', '--no-open'], {
      cwd: ROOT,
      // Do NOT set CAVEPAINTINGS_NO_STATE so state file is written
    });

    // Wait for the server to start listening
    await new Promise((resolve, reject) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      proc.on('error', reject);
      setTimeout(resolve, 2000);
    });

    // Give state file a moment to be written
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(fs.existsSync(STATE_FILE), 'state.json should exist after server starts');

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    assert.ok(state.port, 'state should have port');
    assert.ok(state.pid, 'state should have pid');
    assert.ok(state.url, 'state should have url');

    // Send SIGTERM and wait for process to exit
    proc.kill('SIGTERM');
    await new Promise((resolve) => {
      proc.on('exit', resolve);
      setTimeout(resolve, 3000);
    });

    assert.ok(!fs.existsSync(STATE_FILE), 'state.json should be removed after SIGTERM');
  });

  it('cleans up submissions directory on SIGTERM', async () => {
    const SUBMISSIONS_DIR = path.join(os.tmpdir(), 'cavepaintings', 'submissions');
    if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE);
    if (fs.existsSync(SUBMISSIONS_DIR)) fs.rmSync(SUBMISSIONS_DIR, { recursive: true });

    const PORT = 19736;
    const proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], { cwd: ROOT });

    await new Promise((resolve) => {
      proc.stdout.on('data', (data) => {
        if (data.toString().includes('listening')) resolve();
      });
      setTimeout(resolve, 2000);
    });

    // Create a fake submission file
    fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SUBMISSIONS_DIR, 'test.json'), '{}');

    // Kill server
    proc.kill('SIGTERM');
    await new Promise((resolve) => {
      proc.on('exit', resolve);
      setTimeout(resolve, 3000);
    });

    assert.ok(!fs.existsSync(SUBMISSIONS_DIR), 'submissions dir should be cleaned up on shutdown');
  });
});
