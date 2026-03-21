/* global fabric */

import {
  getCanvas, getCurrentTool, setCurrentTool,
  getGridVisible, getGridPattern, getCurrentTheme, themes,
  getBrushColor, getBrushWidth,
  saveState, undo, redo, toggleGrid, toggleTheme, clearUndoStacks,
} from './canvas-core.js';
import { updatePropertiesPanel } from './properties.js';
import { addImageFromDataUrl } from './image-utils.js';
import { showToast } from './toast.js';
import {
  activateConnectorTool, deactivateConnectorTool,
  connectorMouseDown, connectorMouseMove, connectorCancel,
  clearConnectorIndex,
  reconnectConnectors,
} from './connectors.js';

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let isDrawingShape = false;
let shapeOrigin = null;
let activeShape = null;
let clipboardObject = null;
let polygonPoints = [];
let polygonPreviewLines = [];

// ---------------------------------------------------------------------------
// Tool switching
// ---------------------------------------------------------------------------
export function setTool(tool) {
  const canvas = getCanvas();
  const prevTool = getCurrentTool();
  setCurrentTool(tool);

  // Deactivate connector tool overlay when switching away
  if (prevTool === 'connector' && tool !== 'connector') {
    deactivateConnectorTool();
  }

  canvas.isDrawingMode = tool === 'draw';

  if (tool === 'select') {
    canvas.selection = true;
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
  } else if (tool === 'connector') {
    canvas.selection = false;
    canvas.discardActiveObject();
    activateConnectorTool();
    canvas.renderAll();
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
    canvas.freeDrawingBrush.color = getBrushColor();
    canvas.freeDrawingBrush.width = getBrushWidth();
  }

  // Show/hide brush panel
  const brushPanel = document.getElementById('brush-panel');
  if (brushPanel) {
    brushPanel.classList.toggle('hidden', tool !== 'draw');
  }

  // Show/hide image URL panel
  const imageUrlPanel = document.getElementById('image-url-panel');
  if (imageUrlPanel) {
    imageUrlPanel.classList.toggle('hidden', tool !== 'image');
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
// Polygon helpers
// ---------------------------------------------------------------------------
function updatePolygonPreview() {
  const canvas = getCanvas();
  polygonPreviewLines.forEach(l => canvas.remove(l));
  polygonPreviewLines = [];

  for (let i = 0; i < polygonPoints.length - 1; i++) {
    const line = new fabric.Line(
      [polygonPoints[i].x, polygonPoints[i].y, polygonPoints[i + 1].x, polygonPoints[i + 1].y],
      { stroke: '#4a9eff', strokeWidth: 2, strokeDashArray: [5, 5], selectable: false, evented: false }
    );
    polygonPreviewLines.push(line);
    canvas.add(line);
  }

  if (polygonPoints.length >= 2) {
    const last = polygonPoints[polygonPoints.length - 1];
    const first = polygonPoints[0];
    const closeLine = new fabric.Line(
      [last.x, last.y, first.x, first.y],
      { stroke: '#4a9eff', strokeWidth: 1, strokeDashArray: [3, 3], selectable: false, evented: false }
    );
    polygonPreviewLines.push(closeLine);
    canvas.add(closeLine);
  }
  canvas.renderAll();
}

function finalizePolygon() {
  const canvas = getCanvas();
  polygonPreviewLines.forEach(l => canvas.remove(l));
  polygonPreviewLines = [];

  if (polygonPoints.length < 3) {
    showToast('Polygon needs at least 3 vertices');
    polygonPoints = [];
    return;
  }

  const polygon = new fabric.Polygon(polygonPoints, {
    fill: 'rgba(74,158,255,0.2)',
    stroke: '#4a9eff',
    strokeWidth: 2,
    selectable: true,
    evented: true,
  });
  canvas.add(polygon);
  canvas.setActiveObject(polygon);
  polygonPoints = [];
  saveState();
}

export function cancelPolygon() {
  const canvas = getCanvas();
  polygonPreviewLines.forEach(l => canvas.remove(l));
  polygonPreviewLines = [];
  polygonPoints = [];
  canvas.renderAll();
}


// ---------------------------------------------------------------------------
// Canvas event handlers
// ---------------------------------------------------------------------------
export function setupCanvasEvents() {
  const canvas = getCanvas();
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  canvas.on('mouse:down', function (opt) {
    const currentTool = getCurrentTool();
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

    if (currentTool === 'connector') {
      connectorMouseDown(pointer);
      return;
    }

    if (currentTool === 'polygon') {
      // Check close conditions
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0];
        const dist = Math.sqrt((pointer.x - first.x) ** 2 + (pointer.y - first.y) ** 2);
        if (dist < 10) {
          finalizePolygon();
          return;
        }
      }
      // Check double-click to close
      if (opt.e.detail === 2 && polygonPoints.length >= 3) {
        finalizePolygon();
        return;
      }

      polygonPoints.push({ x: pointer.x, y: pointer.y });
      updatePolygonPreview();
      return;
    }

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
    } else if (currentTool === 'line') {
      activeShape = new fabric.Line(
        [pointer.x, pointer.y, pointer.x, pointer.y],
        { stroke: '#4a9eff', strokeWidth: 2, selectable: false, evented: false }
      );
      canvas.add(activeShape);
    }
  });

  canvas.on('mouse:move', function (opt) {
    const currentTool = getCurrentTool();
    const e = opt.e;

    // Panning
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      panStart = { x: e.clientX, y: e.clientY };
      canvas.relativePan(new fabric.Point(dx, dy));
      return;
    }

    if (currentTool === 'connector') {
      const ptr = canvas.getScenePoint(opt.e);
      connectorMouseMove(ptr);
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
    } else if (currentTool === 'line') {
      activeShape.set({ x2: pointer.x, y2: pointer.y });
    }
    canvas.requestRenderAll();
  });

  canvas.on('mouse:up', function (opt) {
    const currentTool = getCurrentTool();
    const e = opt.e;

    if (isPanning) {
      isPanning = false;
      canvas.defaultCursor = currentTool === 'select' ? 'default' : 'crosshair';
      return;
    }

    if (!isDrawingShape || !activeShape) return;
    isDrawingShape = false;

    // Finalize line: simpler than arrow, no arrowhead conversion needed
    // Must be BEFORE the arrow block — both use Line objects
    if (currentTool === 'line') {
      const line = activeShape;
      if (line.x1 === line.x2 && line.y1 === line.y2) {
        canvas.remove(line);
        activeShape = null;
        shapeOrigin = null;
        return;
      }
      line.set({ selectable: true, evented: true });
      canvas.setActiveObject(line);
      activeShape = null;
      shapeOrigin = null;
      saveState();
      return;
    }

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
    if (!getGridVisible()) return;
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
  canvas.on('selection:cleared', updatePropertiesPanel);

  canvas.on('object:modified', saveState);
  canvas.on('path:created', saveState);
}

// ---------------------------------------------------------------------------
// Toolbar wiring
// ---------------------------------------------------------------------------
export function setupToolbar() {
  const canvas = getCanvas();

  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-grid').addEventListener('click', toggleGrid);

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear the canvas? This cannot be undone.')) {
      canvas.clear();
      clearConnectorIndex();
      canvas.backgroundColor = getGridVisible() ? getGridPattern() : themes[getCurrentTheme()].canvasBg;
      canvas.renderAll();
      clearUndoStacks();
      saveState();
      localStorage.removeItem('cavepaintings-canvas');
    }
  });

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  function exportFilename(ext) {
    const now = new Date();
    const ts = now.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d+Z$/, '');
    const dir = document.title.includes('—') ? document.title.split('—')[1].trim() : 'cavepaintings';
    return `${dir}-${ts}.${ext}`;
  }

  document.getElementById('btn-export-png').addEventListener('click', () => {
    downloadFile(canvas.toDataURL({ format: 'png', multiplier: 2 }), exportFilename('png'));
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    const blob = new Blob([canvas.toSVG()], { type: 'image/svg+xml' });
    downloadFile(URL.createObjectURL(blob), exportFilename('svg'), true);
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(canvas.toJSON(), null, 2)], { type: 'application/json' });
    downloadFile(URL.createObjectURL(blob), exportFilename('json'), true);
  });

  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('file-input-json').click();
  });

  document.getElementById('file-input-json').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      canvas.loadFromJSON(JSON.parse(e.target.result)).then(() => { reconnectConnectors(canvas); canvas.renderAll(); saveState(); });
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

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------
export function downloadFile(url, filename, revoke = false) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
export function setupKeyboard() {
  const canvas = getCanvas();

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

    const toolMap = { v: 'select', r: 'rect', e: 'ellipse', a: 'arrow', l: 'line', p: 'polygon', d: 'draw', t: 'text', i: 'image', c: 'connector' };
    if (key === 'q') { document.getElementById('btn-properties')?.click(); return; }
    if (key === 'o') { document.getElementById('btn-object-list')?.click(); return; }
    if (key === 'g') { toggleGrid(); return; }
    if (key === 'escape') { cancelPolygon(); connectorCancel(); return; }
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
}
