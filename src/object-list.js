import { getCanvas, saveState } from './canvas-core.js';

/* global fabric */

const TYPE_ICONS = {
  rect: '▭', ellipse: '○', 'i-text': 'T', line: '╱', polygon: '⬠',
  group: '⊞', path: '〰', image: '🖼', polyline: '⟶',
};

let visible = false;

export function setupObjectList() {
  const canvas = getCanvas();
  const panel = document.getElementById('object-list-panel');
  const list = document.getElementById('object-list');
  const btn = document.getElementById('btn-object-list');

  btn.addEventListener('click', toggle);

  canvas.on('object:added', () => { if (visible) refresh(); });
  canvas.on('object:removed', () => { if (visible) refresh(); });
  canvas.on('selection:created', () => { if (visible) highlightSelected(); });
  canvas.on('selection:updated', () => { if (visible) highlightSelected(); });
  canvas.on('selection:cleared', () => { if (visible) highlightSelected(); });

  // Keyboard navigation
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('.object-list-item')];
    const focused = document.activeElement?.closest('.object-list-item') || list.querySelector('.object-list-item.selected');
    const idx = items.indexOf(focused);
    if (idx < 0) return;

    if (e.altKey && e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      const obj = findObjByCaveId(focused.dataset.caveId);
      if (obj) { canvas.bringObjectForward(obj); canvas.renderAll(); refresh(); }
    } else if (e.altKey && e.key === 'ArrowDown' && idx < items.length - 1) {
      e.preventDefault();
      const obj = findObjByCaveId(focused.dataset.caveId);
      if (obj) { canvas.sendObjectBackwards(obj); canvas.renderAll(); refresh(); }
    } else if (e.key === 'ArrowDown' && idx < items.length - 1) {
      e.preventDefault();
      items[idx + 1].click();
      items[idx + 1].focus();
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      items[idx - 1].click();
      items[idx - 1].focus();
    } else if (e.key === 'Delete') {
      focused?.querySelector('.object-delete')?.click();
    }
  });

  function toggle() {
    visible = !visible;
    panel.classList.toggle('hidden', !visible);
    btn.classList.toggle('active', visible);
    if (visible) refresh();
  }

  function refresh() {
    const objects = canvas.getObjects();
    list.innerHTML = '';
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const item = document.createElement('div');
      item.className = 'object-list-item';
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.dataset.caveId = obj.caveId || '';

      const icon = document.createElement('span');
      icon.className = 'object-icon';
      const type = obj.isConnector ? 'connector' : obj.type;
      icon.textContent = TYPE_ICONS[type] || '?';

      const label = document.createElement('span');
      label.className = 'object-label';
      if (obj.isConnector) {
        const srcName = findName(obj.sourceId) || 'Object';
        const tgtName = findName(obj.targetId) || 'Object';
        label.textContent = `Connector: ${srcName} → ${tgtName}`;
      } else {
        label.textContent = obj.caveName || capitalize(obj.type);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'object-delete';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        canvas.remove(obj);
        canvas.discardActiveObject();
        canvas.renderAll();
        saveState();
      });

      item.appendChild(icon);
      item.appendChild(label);
      item.appendChild(deleteBtn);

      // Click to select (with Ctrl+Click multi-select)
      item.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          const active = canvas.getActiveObject();
          if (active && active.type === 'activeselection') {
            if (active.contains(obj)) { active.removeWithUpdate(obj); }
            else { active.addWithUpdate(obj); }
            canvas.requestRenderAll();
          } else if (active && active !== obj) {
            const sel = new fabric.ActiveSelection([active, obj], { canvas });
            canvas.setActiveObject(sel);
            canvas.requestRenderAll();
          } else {
            canvas.setActiveObject(obj);
            canvas.renderAll();
          }
          highlightSelected();
          return;
        }
        canvas.setActiveObject(obj);
        canvas.renderAll();
        // Pan to center if off-screen
        const objCenter = obj.getCenterPoint();
        const vpt = canvas.viewportTransform;
        const zoom = canvas.getZoom();
        const cx = objCenter.x * zoom + vpt[4];
        const cy = objCenter.y * zoom + vpt[5];
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        if (cx < 0 || cx > w || cy < 0 || cy > h) {
          canvas.setViewportTransform([zoom, 0, 0, zoom, w / 2 - objCenter.x * zoom, h / 2 - objCenter.y * zoom]);
        }
        highlightSelected();
      });

      // Double-click to rename
      label.addEventListener('dblclick', () => {
        if (obj.isConnector) return;
        const input = document.createElement('input');
        input.value = obj.caveName || '';
        input.placeholder = capitalize(obj.type);
        input.className = 'object-rename-input';
        label.replaceWith(input);
        input.focus();
        input.addEventListener('blur', () => {
          obj.caveName = input.value || undefined;
          refresh();
        });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') input.blur();
          if (ev.key === 'Escape') { input.blur(); }
        });
      });

      // Drag to reorder
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', obj.caveId);
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); });
      item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => { item.classList.remove('drag-over'); });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        const draggedObj = findObjByCaveId(draggedId);
        if (!draggedObj || draggedObj === obj) return;
        const targetIdx = canvas.getObjects().indexOf(obj);
        canvas.moveTo(draggedObj, targetIdx);
        canvas.renderAll();
        refresh();
        saveState();
      });

      list.appendChild(item);
    }
    highlightSelected();
  }

  function highlightSelected() {
    const active = canvas.getActiveObject();
    list.querySelectorAll('.object-list-item').forEach(item => {
      item.classList.toggle('selected', active && item.dataset.caveId === active.caveId);
    });
  }

  function findObjByCaveId(caveId) {
    return canvas.getObjects().find(o => o.caveId === caveId);
  }

  function findName(caveId) {
    const obj = findObjByCaveId(caveId);
    if (!obj) return null;
    return obj.caveName || capitalize(obj.type);
  }

  return { toggle, refresh };
}

function capitalize(s) {
  if (!s) return '';
  if (s === 'i-text') return 'Text';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
