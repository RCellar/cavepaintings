/* global fabric */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let canvas;
let currentTool = 'select';
// WebSocket state
let ws = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let isDrawingShape = false;
let shapeOrigin = null;
let activeShape = null;
let undoStack = [];
let redoStack = [];
let isLoadingState = false;
let canvasDirty = false;
let gridVisible = false;
let gridPattern = null;
let autoSaveTimer = null;
let brushColor = '#4a9eff';
let brushWidth = 3;
let clipboardObject = null;
let currentTheme = 'dark';
let pendingSubmitTimer = null;

const themes = {
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
  setupBrushPanel();
  setupKeyboard();
  setupAutoSave();
  setupDragDrop();
  restoreFromLocalStorage();
  restoreTheme();
  connectWebSocket();
  setupZoomIndicator();
}

// ---------------------------------------------------------------------------
// Window resize
// ---------------------------------------------------------------------------
let resizeRAF = null;
function handleResize() {
  if (resizeRAF) return;
  resizeRAF = requestAnimationFrame(() => {
    resizeRAF = null;
    canvas.setDimensions({
      width: window.innerWidth - 56,
      height: window.innerHeight - 48,
    });
    canvas.requestRenderAll();
  });
}

// ---------------------------------------------------------------------------
// Tool switching
// ---------------------------------------------------------------------------
function setTool(tool) {
  currentTool = tool;

  canvas.isDrawingMode = tool === 'draw';

  if (tool === 'select') {
    canvas.selection = true;
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
  } else {
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    canvas.discardActiveObject();
    canvas.renderAll();
  }

  if (tool === 'draw') {
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    }
    canvas.freeDrawingBrush.color = brushColor;
    canvas.freeDrawingBrush.width = brushWidth;
  }

  // Show/hide brush panel
  const brushPanel = document.getElementById('brush-panel');
  if (brushPanel) {
    brushPanel.classList.toggle('hidden', tool !== 'draw');
  }

  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
    btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool));
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
// Canvas event handlers
// ---------------------------------------------------------------------------
function setupCanvasEvents() {
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  canvas.on('mouse:down', function (opt) {
    const e = opt.e;
    const pointer = canvas.getScenePoint(e);

    // Middle mouse button or Alt+left-drag = pan
    if (e.button === 1 || (e.altKey && e.button === 0)) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      canvas.defaultCursor = 'grabbing';
      e.preventDefault();
      return;
    }

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
      activeShape = new fabric.Line(
        [pointer.x, pointer.y, pointer.x, pointer.y],
        { stroke: '#4a9eff', strokeWidth: 2, selectable: false, evented: false }
      );
      canvas.add(activeShape);
    }
  });

  canvas.on('mouse:move', function (opt) {
    const e = opt.e;

    // Panning
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      panStart = { x: e.clientX, y: e.clientY };
      canvas.relativePan(new fabric.Point(dx, dy));
      return;
    }

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
      activeShape.set({ x2: pointer.x, y2: pointer.y });
    }
    canvas.requestRenderAll();
  });

  canvas.on('mouse:up', function (opt) {
    const e = opt.e;

    if (isPanning) {
      isPanning = false;
      canvas.defaultCursor = currentTool === 'select' ? 'default' : 'crosshair';
      return;
    }

    if (!isDrawingShape || !activeShape) return;
    isDrawingShape = false;

    // Finalize arrow: replace temp line with grouped arrow+arrowhead
    // Must be BEFORE the zero-size check — Line has no .width/.height
    if (currentTool === 'arrow') {
      const line = activeShape;
      // Discard zero-length arrows (click without drag)
      if (line.x1 === line.x2 && line.y1 === line.y2) {
        canvas.remove(line);
        activeShape = null;
        shapeOrigin = null;
        return;
      }
      const arrow = createArrow(line.x1, line.y1, line.x2, line.y2);
      canvas.remove(line);
      canvas.add(arrow);
      canvas.setActiveObject(arrow);
      activeShape = null;
      shapeOrigin = null;
      saveState();
      return;
    }

    // Discard zero-size shapes (click without drag)
    const w = activeShape.width ?? activeShape.rx ?? 0;
    const h = activeShape.height ?? activeShape.ry ?? 0;
    if (w === 0 && h === 0) {
      canvas.remove(activeShape);
      activeShape = null;
      shapeOrigin = null;
      return;
    }

    activeShape.set({ selectable: true, evented: true });
    canvas.setActiveObject(activeShape);
    activeShape = null;
    shapeOrigin = null;
    saveState();
  });

  // Scroll wheel zoom (0.1x – 10x, zoom to cursor point)
  canvas.on('mouse:wheel', function (opt) {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** e.deltaY;
    zoom = Math.min(10, Math.max(0.1, zoom));
    canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
  });

  // Snap to grid on move
  canvas.on('object:moving', function (opt) {
    if (!gridVisible) return;
    const obj = opt.target;
    const gridSize = 24;
    obj.set({
      left: Math.round(obj.left / gridSize) * gridSize,
      top: Math.round(obj.top / gridSize) * gridSize,
    });
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
  if (isLoadingState) return;
  try {
    const json = JSON.stringify(canvas.toJSON());
    undoStack.push(json);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    persistCanvas(json);
  } catch (err) {
    console.warn('Failed to save canvas state:', err);
  }
}

function undo() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const previous = undoStack[undoStack.length - 1];
  isLoadingState = true;
  canvas.loadFromJSON(JSON.parse(previous)).then(() => {
    canvas.renderAll();
    canvas.requestRenderAll();
    isLoadingState = false;
  });
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  isLoadingState = true;
  canvas.loadFromJSON(JSON.parse(next)).then(() => {
    canvas.renderAll();
    canvas.requestRenderAll();
    isLoadingState = false;
  });
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------
function buildGridPattern(colors) {
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

function toggleGrid() {
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
// Brush customization
// ---------------------------------------------------------------------------
function setupBrushPanel() {
  const colorInput = document.getElementById('brush-color');
  const widthInput = document.getElementById('brush-width');

  if (colorInput) {
    colorInput.addEventListener('input', function () {
      brushColor = this.value;
      if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = brushColor;
    });
  }

  if (widthInput) {
    widthInput.addEventListener('input', function () {
      brushWidth = parseInt(this.value, 10);
      if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = brushWidth;
    });
  }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function setTheme(theme) {
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

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function restoreTheme() {
  const saved = localStorage.getItem('cavepaintings-theme');
  if (saved && themes[saved]) {
    setTheme(saved);
  } else {
    document.body.dataset.theme = 'dark';
  }
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
      canvas.backgroundColor = gridVisible ? gridPattern : themes[currentTheme].canvasBg;
      canvas.renderAll();
      undoStack = [];
      redoStack = [];
      saveState();
      localStorage.removeItem('cavepaintings-canvas');
    }
  });

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  document.getElementById('btn-export-png').addEventListener('click', () => {
    downloadFile(canvas.toDataURL({ format: 'png', multiplier: 2 }), 'cavepaintings.png');
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    const blob = new Blob([canvas.toSVG()], { type: 'image/svg+xml' });
    downloadFile(URL.createObjectURL(blob), 'cavepaintings.svg', true);
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(canvas.toJSON(), null, 2)], { type: 'application/json' });
    downloadFile(URL.createObjectURL(blob), 'cavepaintings.json', true);
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

function downloadFile(url, filename, revoke = false) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 100);
}

function addImageFromDataUrl(dataUrl, left, top) {
  fabric.FabricImage.fromURL(dataUrl).then(img => {
    img.scaleToWidth(Math.min(img.width, canvas.getWidth() / 2));
    img.set({ left: left ?? 60, top: top ?? 60 });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    saveState();
  });
}

// ---------------------------------------------------------------------------
// Drag and drop images
// ---------------------------------------------------------------------------
function setupDragDrop() {
  const target = canvas.upperCanvasEl;

  target.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  target.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const point = canvas.getScenePoint(e);
        const reader = new FileReader();
        reader.onload = (ev) => addImageFromDataUrl(ev.target.result, point.x, point.y);
        reader.readAsDataURL(file);
        break;
      }
    }
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
      if (key === 'c') {
        const obj = canvas.getActiveObject();
        if (obj) {
          e.preventDefault();
          obj.clone().then(cloned => { clipboardObject = cloned; });
        }
        return;
      }
      if (key === 'v') {
        if (clipboardObject) {
          e.preventDefault();
          clipboardObject.clone().then(cloned => {
            cloned.set({ left: cloned.left + 20, top: cloned.top + 20 });
            canvas.add(cloned);
            canvas.setActiveObject(cloned);
            canvas.requestRenderAll();
            saveState();
          });
        }
        return;
      }
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
  canvas.on('object:modified', () => { canvasDirty = true; });
  canvas.on('object:added', () => { canvasDirty = true; });
  canvas.on('object:removed', () => { canvasDirty = true; });
  canvas.on('path:created', () => { canvasDirty = true; });

  autoSaveTimer = setInterval(() => {
    if (canvasDirty) persistCanvas();
  }, 30000);
}

function persistCanvas(json) {
  try {
    if (!json) json = JSON.stringify(canvas.toJSON());
    localStorage.setItem('cavepaintings-canvas', json);
  } catch { /* quota exceeded — silently ignore */ }
  canvasDirty = false;
}

function restoreFromLocalStorage() {
  const saved = localStorage.getItem('cavepaintings-canvas');
  if (!saved) return;
  try {
    isLoadingState = true;
    canvas.loadFromJSON(JSON.parse(saved)).then(() => {
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
// WebSocket – connect with exponential back-off
// ---------------------------------------------------------------------------
function connectWebSocket() {
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
          isLoadingState = true;
          canvas.loadFromJSON(msg.diagram).then(() => {
            canvas.renderAll();
            canvas.requestRenderAll();
            isLoadingState = false;
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
function submitToClaude() {
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

// ---------------------------------------------------------------------------
// Zoom indicator
// ---------------------------------------------------------------------------
function setupZoomIndicator() {
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  initCanvas();
  document.getElementById('btn-submit').addEventListener('click', submitToClaude);
  document.getElementById('prompt-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submitToClaude();
    }
  });
  window.addEventListener('resize', handleResize);
});
