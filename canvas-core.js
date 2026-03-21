/* global fabric */

import { setupConnectorLifecycle, reconnectConnectors } from './connectors.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let canvas;
let currentTool = 'select';
let isLoadingState = false;
let canvasDirty = false;
let gridVisible = false;
let gridPattern = null;
let autoSaveTimer = null;
let brushColor = '#4a9eff';
let brushWidth = 3;
let currentTheme = 'dark';
let undoStack = [];
let redoStack = [];
let resizeRAF = null;

export const themes = {
  dark: {
    canvasBg: '#1a1a2e',
    gridDotColor: 'rgba(74,158,255,0.25)',
  },
  light: {
    canvasBg: '#f0f0f0',
    gridDotColor: 'rgba(0,0,0,0.15)',
  },
};

// ---------------------------------------------------------------------------
// Getters / Setters for shared state
// ---------------------------------------------------------------------------
export function getCanvas() { return canvas; }
export function getCurrentTool() { return currentTool; }
export function setCurrentTool(t) { currentTool = t; }
export function getIsLoadingState() { return isLoadingState; }
export function setIsLoadingState(v) { isLoadingState = v; }
export function getGridVisible() { return gridVisible; }
export function setGridVisible(v) { gridVisible = v; }
export function getGridPattern() { return gridPattern; }
export function getBrushColor() { return brushColor; }
export function setBrushColor(v) { brushColor = v; }
export function getBrushWidth() { return brushWidth; }
export function setBrushWidth(v) { brushWidth = v; }
export function getCurrentTheme() { return currentTheme; }
export function getUndoStack() { return undoStack; }
export function getRedoStack() { return redoStack; }

// ---------------------------------------------------------------------------
// Canvas initialisation
// ---------------------------------------------------------------------------
export function initCanvas() {
  const isTablet = window.innerWidth < 768;
  const availableWidth = isTablet ? window.innerWidth : window.innerWidth - 56;
  const availableHeight = isTablet ? window.innerHeight - 56 - 48 : window.innerHeight - 48;

  canvas = new fabric.Canvas('drawing-canvas', {
    width: availableWidth,
    height: availableHeight,
    backgroundColor: '#1a1a2e',
    selection: true,
    preserveObjectStacking: true,
  });

  window.__canvas = canvas;

  // Patch FabricObject.toObject so caveId/caveName are always included in
  // serialisation. Fabric 6.x's canvas.toJSON() does not forward its
  // propertiesToInclude argument to each object, so we inject the custom
  // properties at the prototype level instead.
  const _origToObject = fabric.FabricObject.prototype.toObject;
  const _caveProps = [
    'caveId', 'caveName',
    'isConnector', 'sourceId', 'sourceAnchor', 'targetId', 'targetAnchor',
    'showArrow', 'connectorStroke', 'connectorStrokeWidth', 'connectorDash',
  ];
  fabric.FabricObject.prototype.toObject = function (additionalProps) {
    const base = _origToObject.call(this, additionalProps);
    _caveProps.forEach((prop) => {
      if (this[prop] !== undefined) base[prop] = this[prop];
    });
    return base;
  };

  canvas.on('object:added', (e) => {
    if (!e.target.caveId) {
      e.target.caveId = crypto.randomUUID();
    }
  });

  // Wire connector lifecycle events
  setupConnectorLifecycle(canvas);
}

// ---------------------------------------------------------------------------
// Window resize
// ---------------------------------------------------------------------------
export function handleResize() {
  if (resizeRAF) return;
  resizeRAF = requestAnimationFrame(() => {
    resizeRAF = null;
    const isTablet = window.innerWidth < 768;
    const canvas = getCanvas();
    canvas.setDimensions({
      width: isTablet ? window.innerWidth : window.innerWidth - 56,
      height: isTablet ? window.innerHeight - 56 - 48 : window.innerHeight - 48,
    });
    canvas.requestRenderAll();
  });
}

export function setupViewport() {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      document.getElementById('app').style.height = window.visualViewport.height + 'px';
    });
  }
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------
export function saveState() {
  if (isLoadingState) return;
  try {
    const json = JSON.stringify(canvas.toJSON(['caveId', 'caveName']));
    undoStack.push(json);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    persistCanvas(json);
  } catch (err) {
    console.warn('Failed to save canvas state:', err);
  }
}

export function undo() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const previous = undoStack[undoStack.length - 1];
  isLoadingState = true;
  canvas.loadFromJSON(JSON.parse(previous)).then(() => {
    reconnectConnectors(canvas);
    canvas.renderAll();
    canvas.requestRenderAll();
    isLoadingState = false;
  });
}

export function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  isLoadingState = true;
  canvas.loadFromJSON(JSON.parse(next)).then(() => {
    reconnectConnectors(canvas);
    canvas.renderAll();
    canvas.requestRenderAll();
    isLoadingState = false;
  });
}

export function clearUndoStacks() {
  undoStack = [];
  redoStack = [];
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------
export function buildGridPattern(colors) {
  const gridSize = 24;
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = gridSize;
  patternCanvas.height = gridSize;
  const ctx = patternCanvas.getContext('2d');
  ctx.fillStyle = colors.canvasBg;
  ctx.fillRect(0, 0, gridSize, gridSize);
  ctx.fillStyle = colors.gridDotColor;
  ctx.beginPath();
  ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
  ctx.fill();

  gridPattern = new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
  canvas.backgroundColor = gridPattern;
}

export function toggleGrid() {
  gridVisible = !gridVisible;
  document.getElementById('btn-grid').classList.toggle('active', gridVisible);

  if (gridVisible) {
    buildGridPattern(themes[currentTheme]);
  } else {
    canvas.backgroundColor = themes[currentTheme].canvasBg;
  }
  canvas.renderAll();
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
export function setTheme(theme) {
  currentTheme = theme;
  document.body.dataset.theme = theme;
  const colors = themes[theme];

  if (gridVisible) {
    buildGridPattern(colors);
  } else {
    canvas.backgroundColor = colors.canvasBg;
  }
  canvas.renderAll();
  localStorage.setItem('cavepaintings-theme', theme);
}

export function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function restoreTheme() {
  const saved = localStorage.getItem('cavepaintings-theme');
  if (saved && themes[saved]) {
    setTheme(saved);
  } else {
    document.body.dataset.theme = 'dark';
  }
}

// ---------------------------------------------------------------------------
// Auto-save / restore
// ---------------------------------------------------------------------------
export function setupAutoSave() {
  canvas.on('object:modified', () => { canvasDirty = true; });
  canvas.on('object:added', () => { canvasDirty = true; });
  canvas.on('object:removed', () => { canvasDirty = true; });
  canvas.on('path:created', () => { canvasDirty = true; });

  autoSaveTimer = setInterval(() => {
    if (canvasDirty) persistCanvas();
  }, 30000);
}

export function persistCanvas(json) {
  try {
    if (!json) json = JSON.stringify(canvas.toJSON(['caveId', 'caveName']));
    localStorage.setItem('cavepaintings-canvas', json);
  } catch { /* quota exceeded — silently ignore */ }
  canvasDirty = false;
}

export function restoreFromLocalStorage() {
  const saved = localStorage.getItem('cavepaintings-canvas');
  if (!saved) return;
  try {
    isLoadingState = true;
    canvas.loadFromJSON(JSON.parse(saved)).then(() => {
      reconnectConnectors(canvas);
      canvas.renderAll();
      isLoadingState = false;
      // Reset undo stack to start from the restored state
      undoStack = [saved];
      redoStack = [];
    });
  } catch (err) {
    console.warn('Could not restore canvas from localStorage:', err);
    isLoadingState = false;
  }
}

// ---------------------------------------------------------------------------
// Zoom indicator
// ---------------------------------------------------------------------------
export function setupZoomIndicator() {
  const zoomEl = document.getElementById('zoom-level');
  if (!zoomEl) return;

  canvas.on('mouse:wheel', () => {
    zoomEl.textContent = Math.round(canvas.getZoom() * 100) + '%';
  });

  zoomEl.addEventListener('click', () => {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    zoomEl.textContent = '100%';
  });
}
