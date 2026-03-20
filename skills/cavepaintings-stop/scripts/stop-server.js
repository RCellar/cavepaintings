#!/usr/bin/env node
// Stop the running Cavepaintings server

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');

if (!fs.existsSync(stateFile)) {
  console.log('No cavepaintings session found');
  process.exit(0);
}

const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
try {
  process.kill(state.pid, 0); // check alive
  process.kill(state.pid, 'SIGTERM');
  console.log(`Stopped cavepaintings server (PID ${state.pid})`);
} catch {
  console.log(`Server (PID ${state.pid}) was not running, cleaning up stale state`);
}

// Clean up state file in case server didn't remove it
try { fs.unlinkSync(stateFile); } catch {}
