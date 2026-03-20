---
name: cavepaintings
description: Use when the user wants to draw diagrams, annotate screenshots, sketch architecture, or send visual content to this conversation. Also use when the user asks you to draw, sketch, or place objects on a canvas. Triggers on mentions of drawing, sketching, diagramming, whiteboard, visual canvas, or annotating images.
invocable_by:
  - user
---

# Cavepaintings -- Start Canvas

1. Start (or reuse) the server:

   ```bash
   <SKILL_DIR>/scripts/start-server.sh
   ```

   This checks for an existing session automatically. If one is running, it returns the existing connection info with `"status": "existing"`. Otherwise it starts a new server. Either way, save the `url` and `port` from the JSON response.

2. Tell the user:
   > "Cavepaintings canvas open at {url}. Draw diagrams, paste images, and click 'Submit to Claude' (or Ctrl+Enter) to send them here."

3. **Receiving submissions:** The `UserPromptSubmit` hook automatically detects new submissions when the user sends any message. It surfaces all unseen submissions with prompt text, object summaries, and PNG/JSON file paths. You can also check manually:

   ```bash
   node <SKILL_DIR>/scripts/check-session.js --submissions
   ```

   Read the PNG with the Read tool to see the visual content.

4. **Pushing objects to the canvas:** POST Fabric.js objects to `http://localhost:{port}/api/canvas` with `{"diagram":{"objects":[...]},"mode":"merge"}`. Objects appear on the canvas in real time. Use `"merge"` to add or `"replace"` to clear and load.

5. **Polling submissions via API:** GET `http://localhost:{port}/api/submissions?since=0` returns all submissions newer than the given timestamp.

## Important

- The server auto-exits on SIGTERM/SIGINT and cleans up its state file and submissions
- Canvas state persists in the browser via localStorage across refreshes
- Each submission sends a 2x HiDPI PNG screenshot + Fabric.js JSON for programmatic reasoning
- The canvas push API (`POST /api/canvas`) only works while a browser tab is connected
