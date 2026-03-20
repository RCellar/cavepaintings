/* global fabric */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let canvas;
let currentTool = 'select';
let isDrawingShape = false;
let shapeOrigin = null;
let activeShape = null;
let undoStack = [];
let redoStack = [];
let gridVisible = false;
let gridPattern = null;
let autoSaveTimer = null;

// ---------------------------------------------------------------------------
// Canvas initialisation
// ---------------------------------------------------------------------------
function initCanvas() {
  const availableHeight = window.innerHeight - 48;
  const availableWidth = window.innerWidth - 56;

  canvas = new fabric.Canvas('drawing-canvas', {
    width: availableWidth,
    height: availableHeight,
    backgroundColor: '#1a1a2e',
    selection: true,
    preserveObjectStacking: true,
  });

  saveState();
  setupCanvasEvents();
  setupToolbar();
  setupProperties();
  setupKeyboard();
  setupAutoSave();
  restoreFromLocalStorage();
}

// ---------------------------------------------------------------------------
// Window resize
// ---------------------------------------------------------------------------
function handleResize() {
  const availableHeight = window.innerHeight - 48;
  const availableWidth = window.innerWidth - 56;
  canvas.setWidth(availableWidth);
  canvas.setHeight(availableHeight);
  canvas.renderAll();
}

// ---------------------------------------------------------------------------
// Tool switching
// ---------------------------------------------------------------------------
function setTool(tool) {
  currentTool = tool;

  canvas.isDrawingMode = tool === 'draw';

  if (tool === 'select') {
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
  } else {
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    canvas.discardActiveObject();
    canvas.renderAll();
  }

  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
}

// ---------------------------------------------------------------------------
// Arrow helpers
// ---------------------------------------------------------------------------
function createArrow(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const headLen = 14;

  const line = new fabric.Line([x1, y1, x2, y2], {
    stroke: '#4a9eff',
    strokeWidth: 2,
    selectable: false,
    evented: false,
  });

  const arrowHead = new fabric.Polygon(
    [
      { x: 0, y: 0 },
      { x: -headLen, y: headLen / 2 },
      { x: -headLen, y: -headLen / 2 },
    ],
    {
      left: x2,
      top: y2,
      fill: '#4a9eff',
      stroke: '#4a9eff',
      angle: (angle * 180) / Math.PI,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    }
  );

  return new fabric.Group([line, arrowHead], {
    selectable: true,
    evented: true,
  });
}

// ---------------------------------------------------------------------------
// Canvas event handlers (drawing only – zoom/pan added in commit 2)
// ---------------------------------------------------------------------------
function setupCanvasEvents() {
  canvas.on('mouse:down', function (opt) {
    const e = opt.e;
    const pointer = canvas.getScenePoint(e);

    if (currentTool === 'select' || currentTool === 'draw') return;

    if (currentTool === 'text') {
      const text = new fabric.IText('Text', {
        left: pointer.x,
        top: pointer.y,
        fill: '#e0e0f0',
        fontSize: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      saveState();
      return;
    }

    if (currentTool === 'image') {
      document.getElementById('file-input-image').click();
      return;
    }

    isDrawingShape = true;
    shapeOrigin = { x: pointer.x, y: pointer.y };

    if (currentTool === 'rect') {
      activeShape = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'rgba(74,158,255,0.2)',
        stroke: '#4a9eff',
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      canvas.add(activeShape);
    } else if (currentTool === 'ellipse') {
      activeShape = new fabric.Ellipse({
        left: pointer.x,
        top: pointer.y,
        rx: 0,
        ry: 0,
        fill: 'rgba(74,158,255,0.2)',
        stroke: '#4a9eff',
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      canvas.add(activeShape);
    } else if (currentTool === 'arrow') {
      activeShape = createArrow(pointer.x, pointer.y, pointer.x, pointer.y);
      canvas.add(activeShape);
    }
  });

  canvas.on('mouse:move', function (opt) {
    if (!isDrawingShape || !activeShape) return;
    const pointer = canvas.getScenePoint(opt.e);
    const ox = shapeOrigin.x;
    const oy = shapeOrigin.y;

    if (currentTool === 'rect') {
      const w = pointer.x - ox;
      const h = pointer.y - oy;
      activeShape.set({
        left: w < 0 ? pointer.x : ox,
        top: h < 0 ? pointer.y : oy,
        width: Math.abs(w),
        height: Math.abs(h),
      });
    } else if (currentTool === 'ellipse') {
      const rx = Math.abs(pointer.x - ox) / 2;
      const ry = Math.abs(pointer.y - oy) / 2;
      activeShape.set({
        left: Math.min(ox, pointer.x),
        top: Math.min(oy, pointer.y),
        rx,
        ry,
      });
    } else if (currentTool === 'arrow') {
      canvas.remove(activeShape);
      activeShape = createArrow(ox, oy, pointer.x, pointer.y);
      canvas.add(activeShape);
    }
    canvas.renderAll();
  });

  canvas.on('mouse:up', function () {
    if (!isDrawingShape || !activeShape) return;
    isDrawingShape = false;
    activeShape.set({ selectable: true, evented: true });
    canvas.setActiveObject(activeShape);
    activeShape = null;
    shapeOrigin = null;
    saveState();
  });

  // Selection events
  canvas.on('selection:created', updatePropertiesPanel);
  canvas.on('selection:updated', updatePropertiesPanel);
  canvas.on('selection:cleared', () => {
    document.getElementById('properties-panel').classList.add('hidden');
  });

  canvas.on('object:modified', saveState);
  canvas.on('path:created', saveState);
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------
function saveState() {
  const json = JSON.stringify(canvas.toJSON());
  undoStack.push(json);
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const previous = undoStack[undoStack.length - 1];
  canvas.loadFromJSON(JSON.parse(previous), () => canvas.renderAll());
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  canvas.loadFromJSON(JSON.parse(next), () => canvas.renderAll());
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------
function toggleGrid() {
  gridVisible = !gridVisible;
  document.getElementById('btn-grid').classList.toggle('active', gridVisible);

  if (gridVisible) {
    const gridSize = 24;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = gridSize;
    patternCanvas.height = gridSize;
    const ctx = patternCanvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, gridSize, gridSize);
    ctx.fillStyle = 'rgba(74,158,255,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
    ctx.fill();

    gridPattern = new fabric.Pattern({ source: patternCanvas, repeat: 'repeat' });
    canvas.backgroundColor = gridPattern;
  } else {
    canvas.backgroundColor = '#1a1a2e';
  }
  canvas.renderAll();
}

// ---------------------------------------------------------------------------
// Properties Panel
// ---------------------------------------------------------------------------
function updatePropertiesPanel() {
  const panel = document.getElementById('properties-panel');
  const obj = canvas.getActiveObject();
  if (!obj) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const fill = obj.fill && typeof obj.fill === 'string' ? obj.fill : '#4a9eff';
  const stroke = obj.stroke || '#4a9eff';

  document.getElementById('prop-fill').value = fill.startsWith('rgba') ? '#4a9eff' : fill;
  document.getElementById('prop-stroke').value = stroke.startsWith('rgba') ? '#4a9eff' : stroke;
  document.getElementById('prop-stroke-width').value = obj.strokeWidth || 2;
  document.getElementById('prop-font-size').value = obj.fontSize || 16;
  document.getElementById('prop-opacity').value = Math.round((obj.opacity || 1) * 100);
}

function setupProperties() {
  document.getElementById('prop-fill').addEventListener('input', function () {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('fill', this.value); canvas.renderAll(); }
  });

  document.getElementById('prop-stroke').addEventListener('input', function () {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('stroke', this.value); canvas.renderAll(); }
  });

  document.getElementById('prop-stroke-width').addEventListener('input', function () {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('strokeWidth', parseInt(this.value, 10)); canvas.renderAll(); }
  });

  document.getElementById('prop-font-size').addEventListener('input', function () {
    const obj = canvas.getActiveObject();
    if (obj && obj.type === 'i-text') { obj.set('fontSize', parseInt(this.value, 10)); canvas.renderAll(); }
  });

  document.getElementById('prop-opacity').addEventListener('input', function () {
    const obj = canvas.getActiveObject();
    if (obj) { obj.set('opacity', parseInt(this.value, 10) / 100); canvas.renderAll(); }
  });

  document.getElementById('prop-delete').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) { canvas.remove(obj); canvas.discardActiveObject(); canvas.renderAll(); saveState(); }
  });

  document.getElementById('prop-duplicate').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.clone().then(cloned => {
      cloned.set({ left: cloned.left + 20, top: cloned.top + 20 });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      saveState();
    });
  });

  document.getElementById('prop-forward').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) { canvas.bringObjectForward(obj); canvas.renderAll(); saveState(); }
  });

  document.getElementById('prop-backward').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj) { canvas.sendObjectBackwards(obj); canvas.renderAll(); saveState(); }
  });
}

// ---------------------------------------------------------------------------
// Toolbar wiring
// ---------------------------------------------------------------------------
function setupToolbar() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-grid').addEventListener('click', toggleGrid);

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear the canvas? This cannot be undone.')) {
      canvas.clear();
      canvas.backgroundColor = gridVisible ? gridPattern : '#1a1a2e';
      canvas.renderAll();
      undoStack = [];
      redoStack = [];
      saveState();
      localStorage.removeItem('cavepaintings-canvas');
    }
  });

  document.getElementById('btn-export-png').addEventListener('click', () => {
    downloadFile(canvas.toDataURL({ format: 'png', multiplier: 1 }), 'cavepaintings.png');
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    const blob = new Blob([canvas.toSVG()], { type: 'image/svg+xml' });
    downloadFile(URL.createObjectURL(blob), 'cavepaintings.svg');
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(canvas.toJSON(), null, 2)], { type: 'application/json' });
    downloadFile(URL.createObjectURL(blob), 'cavepaintings.json');
  });

  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('file-input-json').click();
  });

  document.getElementById('file-input-json').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      canvas.loadFromJSON(JSON.parse(e.target.result), () => { canvas.renderAll(); saveState(); });
    };
    reader.readAsText(file);
    this.value = '';
  });

  document.getElementById('file-input-image').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => addImageFromDataUrl(e.target.result);
    reader.readAsDataURL(file);
    this.value = '';
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function addImageFromDataUrl(dataUrl) {
  fabric.FabricImage.fromURL(dataUrl).then(img => {
    img.scaleToWidth(Math.min(img.width, canvas.getWidth() / 2));
    img.set({ left: 60, top: 60 });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    saveState();
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
function setupKeyboard() {
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.type === 'i-text' && activeObj.isEditing) return;

    const key = e.key.toLowerCase();

    if (e.ctrlKey || e.metaKey) {
      if (key === 'z') { e.preventDefault(); undo(); return; }
      if (key === 'y') { e.preventDefault(); redo(); return; }
    }

    const toolMap = { v: 'select', r: 'rect', e: 'ellipse', a: 'arrow', d: 'draw', t: 'text', i: 'image' };
    if (key === 'g') { toggleGrid(); return; }
    if (toolMap[key]) { setTool(toolMap[key]); return; }

    if (key === 'delete' || key === 'backspace') {
      const obj = canvas.getActiveObject();
      if (obj) {
        if (obj.type === 'activeselection') {
          obj.getObjects().forEach(o => canvas.remove(o));
          canvas.discardActiveObject();
        } else {
          canvas.remove(obj);
        }
        canvas.renderAll();
        saveState();
      }
    }
  });

  document.addEventListener('paste', function (e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = ev => addImageFromDataUrl(ev.target.result);
        reader.readAsDataURL(file);
        e.preventDefault();
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Auto-save / restore
// ---------------------------------------------------------------------------
function setupAutoSave() {
  autoSaveTimer = setInterval(() => persistCanvas(), 30000);
  canvas.on('object:modified', persistCanvas);
  canvas.on('object:added', persistCanvas);
  canvas.on('object:removed', persistCanvas);
  canvas.on('path:created', persistCanvas);
}

function persistCanvas() {
  localStorage.setItem('cavepaintings-canvas', JSON.stringify(canvas.toJSON()));
}

function restoreFromLocalStorage() {
  const saved = localStorage.getItem('cavepaintings-canvas');
  if (!saved) return;
  try {
    canvas.loadFromJSON(JSON.parse(saved), () => canvas.renderAll());
  } catch (err) {
    console.warn('Could not restore canvas from localStorage:', err);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  initCanvas();
  window.addEventListener('resize', handleResize);
});
