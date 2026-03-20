# Drag-and-Drop Image Attachment — Design Spec

**Date:** 2026-03-20
**Status:** Approved (Rev 2 — refined against codebase)

## Overview

Users can drag image files from their desktop or file manager onto the canvas. The image is placed at the drop position as a Fabric.js Image object, matching the behavior of the existing Ctrl+V paste and file picker workflows.

## Implementation

### New function: `setupDragDrop()`

Add `dragover` and `drop` event listeners to **`canvas.upperCanvasEl`** (Fabric.js's interactive canvas layer). This element is the correct drop target because:
- Its `offsetX`/`offsetY` are in canvas coordinate space
- `canvas.getScenePoint(e)` works correctly with events from this element (same as mouse events)
- It covers the full canvas area

Using `#canvas-container` would be wrong — `offsetX`/`offsetY` would be relative to the container div, not the Fabric canvas, producing incorrect coordinates when zoom/pan is active.

**`dragover` handler:** Calls `e.preventDefault()` to mark the element as a valid drop target. Without this, the browser ignores the drop.

**`drop` handler:**
1. Calls `e.preventDefault()` to suppress the browser's default behavior (opening the file in a new tab)
2. Reads the first file from `e.dataTransfer.files` that matches `image/*` MIME type; ignores non-image files silently
3. Converts it to a data URL via `FileReader.readAsDataURL()`
4. Converts the drop coordinates to canvas scene coordinates via `canvas.getScenePoint(e)` — this accounts for current zoom and pan state
5. Calls `addImageFromDataUrl(dataUrl, point.x, point.y)` with the drop position

Call `setupDragDrop()` from `initCanvas()` after `setupKeyboard()`.

### Modification to `addImageFromDataUrl()`

**Current signature (line 642):** `addImageFromDataUrl(dataUrl)`
**New signature:** `addImageFromDataUrl(dataUrl, left, top)`

When `left` and `top` are provided, use them. Otherwise default to `60, 60` (current behavior). The function already handles scaling (`scaleToWidth`), canvas add, selection, render, and `saveState()` — all of which remain unchanged.

```js
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
```

**Existing callers (unaffected — pass 1 argument):**
- File picker (line 628): `addImageFromDataUrl(e.target.result)` → `left`/`top` undefined → defaults to 60, 60
- Ctrl+V paste (line 716): `addImageFromDataUrl(ev.target.result)` → same

## Files Changed

- `app.js` — add `setupDragDrop()` (~15 lines), modify `addImageFromDataUrl()` signature (1 line)
- No HTML, CSS, or server changes

## Edge Cases

- **Non-image files:** Silently ignored — only files with `type.startsWith('image/')` are processed
- **Multiple files:** Only the first image file is used, matching the single-image pattern of paste and file picker
- **Browser default behavior:** Suppressed by `preventDefault` on both `dragover` and `drop` events
- **Zoom/pan state:** `canvas.getScenePoint(e)` accounts for current viewport transform, so the image lands where the cursor visually is
- **Large images:** Scaled down by existing `scaleToWidth` logic (max half the canvas width)
- **Invalid/corrupt image:** `FabricImage.fromURL` will reject the promise silently — no crash, image just doesn't appear

## Testing

One Playwright test: use `page.dispatchEvent` to simulate a `drop` event with a `DataTransfer` containing a small PNG file. Verify a Fabric.js Image object is added to the canvas.
