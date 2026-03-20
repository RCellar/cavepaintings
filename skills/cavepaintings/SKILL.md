---
name: cavepaintings
description: Use when the user wants to draw diagrams, annotate screenshots, sketch architecture, or send visual content to this conversation. Triggers on mentions of drawing, sketching, diagramming, whiteboard, visual canvas, or annotating images.
invocable_by:
  - user
---

# Cavepaintings -- Start Canvas

1. Check for an existing session:

   ```bash
   node <SKILL_DIR>/scripts/check-session.js
   ```

   Output is one of: `RUNNING:{json}`, `STALE`, or `NOT_RUNNING`.

2. If `RUNNING`, tell the user the URL from the JSON output. Done.

3. If `NOT_RUNNING` or `STALE`, start the server:

   ```bash
   <SKILL_DIR>/scripts/start-server.sh
   ```

   Save the `url` from the JSON response. Tell the user to open it.

4. Tell the user:
   > "Cavepaintings canvas open at {url}. Draw diagrams, paste images, and click 'Submit to Claude' to send them here."

5. When the user says they submitted, check for new submissions:

   ```bash
   node <SKILL_DIR>/scripts/check-session.js --submissions
   ```

   Read the newest PNG as an image attachment and the JSON for the prompt text.

## Important

- The server auto-exits on SIGTERM/SIGINT and cleans up its state file
- Canvas state persists in the browser via localStorage across refreshes
- Each submission sends both a PNG screenshot and Fabric.js JSON for programmatic reasoning
