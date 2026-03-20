import {
  getCanvas,
  saveState,
  getBrushColor, setBrushColor,
  getBrushWidth, setBrushWidth,
} from './canvas-core.js';

// ---------------------------------------------------------------------------
// Properties Panel
// ---------------------------------------------------------------------------
export function updatePropertiesPanel() {
  const canvas = getCanvas();
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

export function setupProperties() {
  const canvas = getCanvas();

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
export function setupBrushPanel() {
  const canvas = getCanvas();
  const colorInput = document.getElementById('brush-color');
  const widthInput = document.getElementById('brush-width');

  if (colorInput) {
    colorInput.addEventListener('input', function () {
      setBrushColor(this.value);
      if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = getBrushColor();
    });
  }

  if (widthInput) {
    widthInput.addEventListener('input', function () {
      setBrushWidth(parseInt(this.value, 10));
      if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = getBrushWidth();
    });
  }
}
