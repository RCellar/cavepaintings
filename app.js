import { initCanvas, getCanvas, setupAutoSave, restoreFromLocalStorage, restoreTheme, handleResize, setupZoomIndicator, saveState, setupViewport } from './canvas-core.js';
import { setupCanvasEvents, setupToolbar, setupKeyboard } from './tools.js';
import { setupProperties, setupBrushPanel } from './properties.js';
import { connectWebSocket, submitToClaude } from './websocket-client.js';
import { setupDragDrop, setupImagePaste } from './image-utils.js';
import { setupTouch } from './touch.js';

function updateTabTitle() {
  fetch('/api/info')
    .then(r => r.json())
    .then(info => { if (info.projectDir) document.title = `Cavepaintings — ${info.projectDir}`; })
    .catch(() => {});
}

document.addEventListener('DOMContentLoaded', function () {
  initCanvas();
  window.canvas = getCanvas();
  saveState();
  setupCanvasEvents();
  setupToolbar();
  setupProperties();
  setupBrushPanel();
  setupKeyboard();
  setupAutoSave();
  setupDragDrop();
  setupImagePaste();
  restoreFromLocalStorage();
  restoreTheme();
  connectWebSocket();
  setupZoomIndicator();
  setupTouch();
  setupViewport();
  updateTabTitle();
  document.getElementById('btn-submit').addEventListener('click', submitToClaude);
  document.getElementById('prompt-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitToClaude(); }
  });
  window.addEventListener('resize', handleResize);
});
