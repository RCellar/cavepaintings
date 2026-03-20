import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILL_SCRIPTS = path.join(ROOT, 'skills', 'cavepaintings', 'scripts');
const STATE_FILE = path.join(os.tmpdir(), 'cavepaintings', 'state.json');

function cleanState() {
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

describe('start-server.sh with built-in session check', () => {
  after(() => {
    // Kill any leftover test servers
    if (fs.existsSync(STATE_FILE)) {
      try {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        process.kill(state.pid, 'SIGTERM');
      } catch {}
    }
    cleanState();
  });

  it('starts a new server when none is running', async () => {
    cleanState();

    const output = execSync(`bash "${SKILL_SCRIPTS}/start-server.sh"`, {
      cwd: ROOT,
      timeout: 10000,
      encoding: 'utf8',
    });

    const json = JSON.parse(output.trim());
    assert.ok(json.port, 'should have a port');
    assert.ok(json.pid, 'should have a pid');
    assert.ok(json.url, 'should have a url');

    // Clean up
    process.kill(json.pid, 'SIGTERM');
  });

  it('returns existing session info when server is already running', async () => {
    cleanState();

    // Start a server first
    const first = execSync(`bash "${SKILL_SCRIPTS}/start-server.sh"`, {
      cwd: ROOT,
      timeout: 10000,
      encoding: 'utf8',
    });
    const firstJson = JSON.parse(first.trim());

    // Run start-server again — should detect existing session and return it
    const second = execSync(`bash "${SKILL_SCRIPTS}/start-server.sh"`, {
      cwd: ROOT,
      timeout: 10000,
      encoding: 'utf8',
    });
    const secondJson = JSON.parse(second.trim());

    assert.strictEqual(secondJson.port, firstJson.port, 'should return same port');
    assert.strictEqual(secondJson.pid, firstJson.pid, 'should return same pid');
    assert.strictEqual(secondJson.status, 'existing', 'should indicate existing session');

    // Clean up
    process.kill(firstJson.pid, 'SIGTERM');
  });

  it('starts fresh when stale state file exists', async () => {
    cleanState();

    // Write a fake state file with a dead PID
    const stateDir = path.dirname(STATE_FILE);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ port: 99999, pid: 999999, url: 'http://localhost:99999' }));

    const output = execSync(`bash "${SKILL_SCRIPTS}/start-server.sh"`, {
      cwd: ROOT,
      timeout: 10000,
      encoding: 'utf8',
    });
    const json = JSON.parse(output.trim());

    assert.ok(json.port, 'should have a port');
    assert.notStrictEqual(json.port, 99999, 'should not use the stale port');
    assert.ok(json.pid, 'should have a pid');

    // Clean up
    process.kill(json.pid, 'SIGTERM');
  });
});
