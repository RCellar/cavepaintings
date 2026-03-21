#!/usr/bin/env node
// Check cavepaintings session status or list submissions
// Usage: check-session.js [--submissions]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
const submissionsDir = path.join(os.tmpdir(), 'cavepaintings', 'submissions');

const mode = process.argv.includes('--submissions') ? 'submissions' : 'status';

if (mode === 'submissions') {
  if (!fs.existsSync(submissionsDir)) {
    console.log('NO_SUBMISSIONS');
    process.exit(0);
  }
  const files = fs.readdirSync(submissionsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.log('NO_SUBMISSIONS');
  } else {
    const newest = files[0];
    const jsonPath = path.join(submissionsDir, newest);
    const pngPath = jsonPath.replace(/\.json$/, '.png');
    console.log(JSON.stringify({
      status: 'FOUND',
      json: jsonPath,
      png: fs.existsSync(pngPath) ? pngPath : null,
      count: files.length,
    }));
  }
} else {
  if (!fs.existsSync(stateFile)) {
    console.log('NOT_RUNNING');
    process.exit(0);
  }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  let alive = false;
  if (process.platform === 'win32') {
    try {
      const out = execSync(`tasklist /FI "PID eq ${state.pid}" /NH`, { encoding: 'utf8', timeout: 5000 });
      alive = out.includes(String(state.pid));
    } catch { /* not alive */ }
  } else {
    try { process.kill(state.pid, 0); alive = true; } catch { /* not alive */ }
  }
  if (alive) {
    console.log('RUNNING:' + JSON.stringify(state));
  } else {
    fs.unlinkSync(stateFile);
    console.log('STALE');
  }
}
