#!/usr/bin/env node
// UserPromptSubmit hook: check for new cavepaintings submissions and notify Claude.
// Tracks last-seen submission timestamp to surface ALL new submissions (not just newest).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const submissionsDir = path.join(os.tmpdir(), 'cavepaintings', 'submissions');
const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
const lastSeenFile = path.join(os.tmpdir(), 'cavepaintings', '.last-seen-submission');

if (!fs.existsSync(stateFile) || !fs.existsSync(submissionsDir)) {
  process.exit(0);
}

const jsonFiles = fs.readdirSync(submissionsDir)
  .filter(f => f.endsWith('.json'))
  .sort();

if (jsonFiles.length === 0) {
  process.exit(0);
}

let lastSeenTimestamp = 0;
try {
  lastSeenTimestamp = parseInt(fs.readFileSync(lastSeenFile, 'utf8').trim(), 10) || 0;
} catch {
  // No last-seen file yet
}

function extractTimestamp(filename) {
  const match = filename.match(/submission-(\d+)\.json$/);
  return match ? parseInt(match[1], 10) : 0;
}

const newSubmissions = jsonFiles
  .filter(f => extractTimestamp(f) > lastSeenTimestamp)
  .sort((a, b) => extractTimestamp(a) - extractTimestamp(b));

if (newSubmissions.length === 0) {
  process.exit(0);
}

const newestTimestamp = extractTimestamp(newSubmissions[newSubmissions.length - 1]);
fs.writeFileSync(lastSeenFile, String(newestTimestamp));

const entries = [];
for (const file of newSubmissions) {
  const jsonPath = path.join(submissionsDir, file);
  const pngPath = jsonPath.replace(/\.json$/, '.png');
  const submission = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const prompt = submission.prompt ? `"${submission.prompt}"` : '(no message)';
  const pngExists = fs.existsSync(pngPath);

  let canvasInfo = '';
  if (submission.diagram && submission.diagram.objects) {
    const objects = submission.diagram.objects;
    const typeCounts = {};
    for (const obj of objects) {
      const t = obj.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const summary = Object.entries(typeCounts).map(([t, c]) => `${c} ${t}`).join(', ');
    canvasInfo = `, ${objects.length} objects (${summary})`;
  }

  let entry = `${prompt}`;
  if (pngExists) entry += ` — PNG: ${pngPath}`;
  entry += ` — JSON: ${jsonPath}`;
  if (canvasInfo) entry += canvasInfo;
  entries.push(entry);
}

const header = newSubmissions.length === 1
  ? '[Cavepaintings Submission]'
  : `[Cavepaintings: ${newSubmissions.length} new submissions]`;

const body = entries.length === 1
  ? `${header} ${entries[0]}`
  : `${header}\n${entries.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

const context = `${body}\n\nRead the PNG file(s) with the Read tool to see the visual content.`;

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: context,
  },
}));
