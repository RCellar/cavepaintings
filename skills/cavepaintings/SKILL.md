---
name: cavepaintings
description: Use when the user wants to draw diagrams, annotate screenshots, sketch architecture, or send visual content to this conversation. Triggers on mentions of drawing, sketching, diagramming, whiteboard, visual canvas, or annotating images.
invocable_by:
  - user
---

# Cavepaintings -- Start Canvas

1. Start (or reuse) the server:

   ```bash
   <SKILL_DIR>/scripts/start-server.sh
   ```

   This checks for an existing session automatically. If one is running, it returns the existing connection info with `"status": "existing"`. Otherwise it starts a new server. Either way, save the `url` from the JSON response.

2. Tell the user:
   > "Cavepaintings canvas open at {url}. Draw diagrams, paste images, and click 'Submit to Claude' to send them here."

3. When the user says they submitted, check for new submissions:

   ```bash
   node <SKILL_DIR>/scripts/check-session.js --submissions
   ```

   Read the newest PNG as an image attachment and the JSON for the prompt text.

## Important

- The server auto-exits on SIGTERM/SIGINT and cleans up its state file
- Canvas state persists in the browser via localStorage across refreshes
- Each submission sends both a PNG screenshot and Fabric.js JSON for programmatic reasoning
