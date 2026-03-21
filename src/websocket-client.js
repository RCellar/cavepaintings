/* global fabric */

import {
  getCanvas,
  setIsLoadingState,
  saveState,
} from './canvas-core.js';
import { reconnectConnectors } from './connectors.js';

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let ws = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let pendingSubmitTimer = null;

// ---------------------------------------------------------------------------
// WebSocket – connect with exponential back-off
// ---------------------------------------------------------------------------
export function connectWebSocket() {
  const canvas = getCanvas();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}`;

  try {
    ws = new WebSocket(url);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    wsReconnectDelay = 1000;
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
    setConnectionStatus(true);
  });

  ws.addEventListener('close', () => {
    setConnectionStatus(false);
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    setConnectionStatus(false);
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ack') {
        if (pendingSubmitTimer) {
          clearTimeout(pendingSubmitTimer);
          pendingSubmitTimer = null;
        }
        showSubmitFeedback();
      }
      if (msg.type === 'load') {
        if (msg.mode === 'replace') {
          setIsLoadingState(true);
          canvas.loadFromJSON(msg.diagram).then(() => {
            reconnectConnectors(canvas);
            canvas.renderAll();
            canvas.requestRenderAll();
            setIsLoadingState(false);
            saveState();
          });
        } else {
          const objects = msg.diagram?.objects || [];
          if (objects.length > 0) {
            fabric.util.enlivenObjects(objects).then(enlivened => {
              enlivened.forEach(obj => canvas.add(obj));
              canvas.renderAll();
              saveState();
            });
          }
        }
      }
    } catch (_) {}
  });
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWebSocket();
  }, wsReconnectDelay);
  wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
}

function setConnectionStatus(connected) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const btn = document.getElementById('btn-submit');

  if (connected) {
    dot.className = 'connected';
    text.textContent = 'Connected';
    btn.disabled = false;
  } else {
    dot.className = 'disconnected';
    text.textContent = 'Disconnected';
    btn.disabled = true;
  }
}

// ---------------------------------------------------------------------------
// Submit to Claude
// ---------------------------------------------------------------------------
export function submitToClaude() {
  const canvas = getCanvas();
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const promptInput = document.getElementById('prompt-input');
  const btn = document.getElementById('btn-submit');

  let payload;
  try {
    payload = {
      type: 'submit',
      image: canvas.toDataURL({ format: 'png', multiplier: 2 }),
      diagram: canvas.toJSON(),
      prompt: promptInput.value,
    };
  } catch (err) {
    console.error('Failed to serialize canvas:', err);
    return;
  }

  // Show sending state
  btn.disabled = true;
  btn.textContent = 'Sending...';

  ws.send(JSON.stringify(payload));

  // Timeout: if no ack in 10s, show failure
  pendingSubmitTimer = setTimeout(() => {
    pendingSubmitTimer = null;
    btn.textContent = 'Send failed';
    btn.style.background = '#e94560';
    setTimeout(() => {
      btn.textContent = 'Submit to Claude';
      btn.style.background = '';
      btn.disabled = false;
    }, 2000);
  }, 10000);
}

function showSubmitFeedback() {
  const btn = document.getElementById('btn-submit');
  const promptInput = document.getElementById('prompt-input');
  btn.style.background = '#50c878';
  btn.textContent = 'Sent!';
  promptInput.value = '';
  setTimeout(() => {
    btn.style.background = '';
    btn.textContent = 'Submit to Claude';
    btn.disabled = false;
  }, 1500);
}
