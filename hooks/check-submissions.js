#!/usr/bin/env node
// UserPromptSubmit hook: check for new cavepaintings submissions and notify Claude.
// Fires when the user sends any message, injecting canvas context before Claude responds.
// Tracks last-seen submission to avoid duplicate notifications.
//
// Previously used PostToolUse, but that only fires during active tool work —
// it can't notify an idle session. UserPromptSubmit fires on any user input,
// so the user just needs to type anything (e.g. "check") after submitting.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const submissionsDir = path.join(os.tmpdir(), 'cavepaintings', 'submissions');
const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
const lastSeenFile = path.join(os.tmpdir(), 'cavepaintings', '.last-seen-submission');

// Only run if cavepaintings server is active
if (!fs.existsSync(stateFile)) {
  process.exit(0);
}

if (!fs.existsSync(submissionsDir)) {
  process.exit(0);
}

const jsonFiles = fs.readdirSync(submissionsDir)
  .filter(f => f.endsWith('.json'))
  .sort()
  .reverse();

if (jsonFiles.length === 0) {
  process.exit(0);
}

const newest = jsonFiles[0];

// Check if we already notified about this submission
let lastSeen = '';
try {
  lastSeen = fs.readFileSync(lastSeenFile, 'utf8').trim();
} catch {
  // No last-seen file yet
}

if (newest === lastSeen) {
  process.exit(0);
}

// New submission found — mark as seen and notify
fs.writeFileSync(lastSeenFile, newest);

const jsonPath = path.join(submissionsDir, newest);
const pngPath = jsonPath.replace(/\.json$/, '.png');
const submission = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const prompt = submission.prompt
  ? `User message: "${submission.prompt}"`
  : 'No message included.';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: `[Cavepaintings Submission Received] A new canvas submission arrived. ${prompt} The PNG screenshot is at: ${pngPath} — read it with the Read tool to see the visual. The diagram JSON is at: ${jsonPath}`,
  },
}));
