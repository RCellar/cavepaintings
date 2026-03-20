---
name: cavepaintings-stop
description: Stop the running Cavepaintings canvas server
---

Shut down the Cavepaintings server.

## Steps

1. Read the state file and kill the server:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');
const stateFile = path.join(os.tmpdir(), 'cavepaintings', 'state.json');
if (fs.existsSync(stateFile)) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  try { process.kill(state.pid, 'SIGTERM'); } catch {}
  console.log('Stopped cavepaintings server (PID ' + state.pid + ')');
} else {
  console.log('No cavepaintings session found');
}
"
```

2. Confirm to the user:
   > "Cavepaintings stopped."
