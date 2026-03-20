/* global fabric */

import { getCanvas, saveState } from './canvas-core.js';

// ---------------------------------------------------------------------------
// Add image from data URL
// ---------------------------------------------------------------------------
export function addImageFromDataUrl(dataUrl, left, top) {
  const canvas = getCanvas();
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
export function setupDragDrop() {
  const canvas = getCanvas();
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
// Paste handler for images
// ---------------------------------------------------------------------------
export function setupImagePaste() {
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
