#!/usr/bin/env node
// Setup hook: runs on plugin load to ensure dependencies are installed.
// This prevents the first /cavepaintings invocation from hanging while
// npm install runs on the fly.

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

if (!existsSync(path.join(projectRoot, 'node_modules'))) {
  try {
    execSync('npm install --omit=dev', {
      cwd: projectRoot,
      stdio: 'ignore',
      timeout: 30000,
    });
  } catch {
    // If npm install fails here, start-server.sh will retry with visible errors
  }
}
