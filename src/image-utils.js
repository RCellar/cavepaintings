/* global fabric */

import { getCanvas, saveState } from './canvas-core.js';
import { showToast, hideToast } from './toast.js';

const IMAGE_URL_REGEX = /^https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|svg)(\?\S*)?$/i;

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
// Paste handler for images and image URLs
// ---------------------------------------------------------------------------
export function setupImagePaste() {
  document.addEventListener('paste', function (e) {
    // Check for image files first (existing behavior)
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = ev => addImageFromDataUrl(ev.target.result);
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }

    // Check for image URL text (only when not in input/textarea)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const text = e.clipboardData?.getData('text');
    if (text && IMAGE_URL_REGEX.test(text.trim())) {
      e.preventDefault();
      loadImageFromUrl(text.trim());
    }
  });
}

// ---------------------------------------------------------------------------
// Image URL input handler
// ---------------------------------------------------------------------------
export function setupImageUrlInput() {
  const urlInput = document.getElementById('image-url-input');
  if (!urlInput) return;
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = urlInput.value.trim();
      if (url) {
        loadImageFromUrl(url);
        urlInput.value = '';
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Load image from URL
// ---------------------------------------------------------------------------
function loadImageFromUrl(url) {
  const canvas = getCanvas();
  showToast('Loading image...');
  fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    .then(img => {
      img.scaleToWidth(Math.min(img.width, canvas.getWidth() / 2));
      img.set({ left: 60, top: 60 });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      saveState();
      hideToast();
    })
    .catch(() => {
      showToast("Couldn't load image from URL", 3000);
    });
}

