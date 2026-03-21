import { initCanvas, getCanvas, setupAutoSave, restoreFromLocalStorage, restoreTheme, handleResize, setupZoomIndicator, saveState, setupViewport } from './canvas-core.js';
import { setupCanvasEvents, setupToolbar, setupKeyboard } from './tools.js';
import { setupProperties, setupBrushPanel, togglePropertiesPanel, setupPropertiesHint } from './properties.js';
import { connectWebSocket, submitToClaude } from './websocket-client.js';
import { setupDragDrop, setupImagePaste, setupImageUrlInput } from './image-utils.js';
import { setupTouch } from './touch.js';
import { setupObjectList } from './object-list.js';

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
  setupImageUrlInput();
  setupPropertiesHint();
  document.getElementById('btn-properties')?.addEventListener('click', togglePropertiesPanel);
  restoreFromLocalStorage();
  restoreTheme();
  connectWebSocket();
  setupZoomIndicator();
  setupTouch();
  setupViewport();
  setupObjectList();
  updateTabTitle();
  document.getElementById('btn-submit').addEventListener('click', submitToClaude);
  document.getElementById('prompt-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitToClaude(); }
  });
  window.addEventListener('resize', handleResize);
});
