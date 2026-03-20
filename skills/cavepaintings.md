---
name: cavepaintings
description: Open the Cavepaintings drawing canvas in your browser for diagramming, annotating images, and submitting visuals to Claude Code
---

Launch the Cavepaintings canvas server and open the browser.

## Steps

1. Check if a cavepaintings session is already running:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
if (fs.existsSync(stateFile)) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  try { process.kill(state.pid, 0); console.log('RUNNING:' + JSON.stringify(state)); }
  catch { console.log('STALE'); fs.unlinkSync(stateFile); }
} else { console.log('NOT_RUNNING'); }
"
```

2. If `RUNNING`, open the browser to the existing URL and tell the user:
   > "Cavepaintings is already open at {url}"

3. If `NOT_RUNNING` or `STALE`, start the server:

```bash
cd <cavepaintings-project-dir> && node server.js &
```

Run this with `run_in_background: true` so the server persists.

4. Wait briefly, then read the state file to get the URL:

```bash
cat $(node -e "const os=require('os');const path=require('path');console.log(path.join(os.tmpdir(),'cavepaintings','state.json'))")
```

5. Tell the user:
   > "Cavepaintings canvas open at {url}. Draw diagrams, paste images, and click 'Submit to Claude' to send them here."

6. After the user submits from the canvas, check the submissions directory for new files:

```bash
ls -t $(node -e "const os=require('os');const path=require('path');console.log(path.join(os.tmpdir(),'cavepaintings','submissions'))")
```

Read the newest JSON file for the prompt text, and read the newest PNG as an image attachment. Present them as user input.
