/* global fabric */
import { getCanvas, getCurrentTool } from './canvas-core.js';

let touchStartPos = null;

export function setupTouch() {
  const canvas = getCanvas();
  const el = canvas.upperCanvasEl;
  let lastTouchDistance = 0;
  let lastTouchCenter = null;
  let longPressTimer = null;
  let lastTapTime = 0;

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      lastTouchDistance = getTouchDistance(e.touches);
      lastTouchCenter = getTouchCenter(e.touches);
    } else if (e.touches.length === 1) {
      touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      // Suppress long-press context menu during polygon drawing
      if (getCurrentTool() === 'polygon') return;
      longPressTimer = setTimeout(() => {
        showContextMenu(e.touches[0].clientX, e.touches[0].clientY);
        longPressTimer = null;
      }, 500);
    }
  }, { passive: false });

  el.addEventListener('touchmove', (e) => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      const zoomDelta = dist / lastTouchDistance;
      let zoom = canvas.getZoom() * zoomDelta;
      zoom = Math.min(10, Math.max(0.1, zoom));
      canvas.zoomToPoint(new fabric.Point(center.x, center.y), zoom);
      if (lastTouchCenter) {
        const dx = center.x - lastTouchCenter.x;
        const dy = center.y - lastTouchCenter.y;
        canvas.relativePan(new fabric.Point(dx, dy));
      }
      lastTouchDistance = dist;
      lastTouchCenter = center;
    }
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    lastTouchDistance = 0;
    lastTouchCenter = null;
    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const now = Date.now();

      // Polygon tool: dispatch as canvas click for vertex placement
      if (getCurrentTool() === 'polygon' && touchStartPos) {
        const dx = touch.clientX - touchStartPos.x;
        const dy = touch.clientY - touchStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          const canvasEl = canvas.upperCanvasEl;
          canvasEl.dispatchEvent(new MouseEvent('mousedown', {
            clientX: touch.clientX, clientY: touch.clientY, bubbles: true,
          }));
          canvasEl.dispatchEvent(new MouseEvent('mouseup', {
            clientX: touch.clientX, clientY: touch.clientY, bubbles: true,
          }));
        }
        touchStartPos = null;
        return;
      }

      // Double-tap detection (existing)
      if (now - lastTapTime < 300) {
        handleDoubleTap(touch);
      }
      lastTapTime = now;
    }
    touchStartPos = null;
  });
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function handleDoubleTap(touch) {
  const canvas = getCanvas();
  const target = canvas.findTarget({ clientX: touch.clientX, clientY: touch.clientY });
  if (target && target.type === 'i-text') {
    canvas.setActiveObject(target);
    target.enterEditing();
  }
}

function showContextMenu(x, y) {
  const canvas = getCanvas();
  const target = canvas.findTarget({ clientX: x, clientY: y });
  if (!target) return;
  canvas.setActiveObject(target);
  canvas.renderAll();

  let menu = document.getElementById('context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.className = 'context-menu';
    document.body.appendChild(menu);
  }

  menu.innerHTML = `
    <button data-action="delete">Delete</button>
    <button data-action="duplicate">Duplicate</button>
    <button data-action="forward">Bring Forward</button>
    <button data-action="backward">Send Backward</button>
  `;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';

  menu.onclick = (e) => {
    const action = e.target.dataset?.action;
    if (action) document.getElementById(`prop-${action}`)?.click();
    menu.style.display = 'none';
  };

  const dismiss = () => { menu.style.display = 'none'; };
  document.addEventListener('touchstart', dismiss, { once: true });
  document.addEventListener('mousedown', dismiss, { once: true });
}
