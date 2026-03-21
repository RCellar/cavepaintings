// @ts-check
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 19740;

let proc;

test.beforeAll(async () => {
  proc = spawn('node', ['server.js', '--port', String(PORT), '--no-open'], {
    cwd: ROOT,
    env: { ...process.env, CAVEPAINTINGS_NO_STATE: '1' },
  });
  await new Promise((resolve) => {
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('listening')) resolve();
    });
    setTimeout(resolve, 3000);
  });
});

test.afterAll(() => {
  proc?.kill();
});

// ---------------------------------------------------------------------------
// Bug 1: Freehand drawing tool
// ---------------------------------------------------------------------------

test.describe('Freehand drawing tool', () => {
  test('brush is configured with visible color when draw tool is selected', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Select the draw tool
    await page.click('[data-tool="draw"]');

    // Verify canvas is in drawing mode with a configured brush
    const brushConfig = await page.evaluate(() => {
      const c = document.querySelector('.canvas-container canvas');
      // Access the Fabric canvas instance
      const fabricCanvas = fabric.Canvas.activeInstance || canvas;
      return {
        isDrawingMode: fabricCanvas.isDrawingMode,
        brushColor: fabricCanvas.freeDrawingBrush?.color,
        brushWidth: fabricCanvas.freeDrawingBrush?.width,
      };
    });

    expect(brushConfig.isDrawingMode).toBe(true);
    expect(brushConfig.brushColor).toBeTruthy();
    // Brush color should not be black (invisible on dark canvas)
    expect(brushConfig.brushColor).not.toBe('#000000');
    expect(brushConfig.brushColor).not.toBe('black');
    expect(brushConfig.brushWidth).toBeGreaterThan(0);
  });

  test('freehand drawing creates a path on the canvas', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Select the draw tool
    await page.click('[data-tool="draw"]');

    // Get canvas element bounds
    const canvasEl = page.locator('#drawing-canvas');
    const box = await canvasEl.boundingBox();

    // Draw a stroke across the canvas
    const startX = box.x + 100;
    const startY = box.y + 100;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 50, { steps: 10 });
    await page.mouse.move(startX + 200, startY, { steps: 10 });
    await page.mouse.up();

    // Wait for path:created event
    await page.waitForTimeout(200);

    // Check that a path object was added to the canvas
    const objectCount = await page.evaluate(() => {
      return canvas.getObjects().length;
    });
    expect(objectCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Brush customization panel
// ---------------------------------------------------------------------------

test.describe('Brush customization', () => {
  test('brush options panel is visible when draw tool is active', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Brush panel should be hidden initially (select tool active)
    const panelBefore = page.locator('#brush-panel');
    await expect(panelBefore).toBeHidden();

    // Select draw tool
    await page.click('[data-tool="draw"]');

    // Brush panel should now be visible
    await expect(panelBefore).toBeVisible();
  });

  test('brush panel hides when switching away from draw tool', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('[data-tool="draw"]');
    await expect(page.locator('#brush-panel')).toBeVisible();

    await page.click('[data-tool="select"]');
    await expect(page.locator('#brush-panel')).toBeHidden();
  });

  test('changing brush color updates the freeDrawingBrush', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('[data-tool="draw"]');

    // Change brush color via the input
    await page.fill('#brush-color', '#ff0000');
    await page.locator('#brush-color').dispatchEvent('input');

    const brushColor = await page.evaluate(() => canvas.freeDrawingBrush.color);
    expect(brushColor).toBe('#ff0000');
  });

  test('changing brush width updates the freeDrawingBrush', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('[data-tool="draw"]');

    // Set brush width to 10
    await page.fill('#brush-width', '10');
    await page.locator('#brush-width').dispatchEvent('input');

    const brushWidth = await page.evaluate(() => canvas.freeDrawingBrush.width);
    expect(brushWidth).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: Drawing tools should not select existing objects
// ---------------------------------------------------------------------------

test.describe('Drawing tools do not select existing objects', () => {
  test('rect tool ignores objects under cursor', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Add a rectangle to the canvas via JS
    await page.evaluate(() => {
      const rect = new fabric.Rect({
        left: 100, top: 100, width: 200, height: 200,
        fill: 'rgba(74,158,255,0.2)', stroke: '#4a9eff', strokeWidth: 2,
      });
      canvas.add(rect);
      canvas.discardActiveObject();
      canvas.renderAll();
    });

    // Switch to rect tool
    await page.click('[data-tool="rect"]');

    // Click and drag on top of the existing rectangle
    const canvasEl = page.locator('#drawing-canvas');
    const box = await canvasEl.boundingBox();
    const startX = box.x + 150;
    const startY = box.y + 150;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 80, { steps: 5 });
    await page.mouse.up();

    // Should have 2 rectangles, not 1 selected one
    const result = await page.evaluate(() => ({
      objectCount: canvas.getObjects().length,
      // During drawing, the original object should not have become active
      activeWasDuringDraw: canvas._activeObject?.width === 200,
    }));

    expect(result.objectCount).toBe(2);
  });

  test('ellipse tool ignores objects under cursor', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.evaluate(() => {
      const rect = new fabric.Rect({
        left: 100, top: 100, width: 200, height: 200,
        fill: 'rgba(74,158,255,0.2)', stroke: '#4a9eff', strokeWidth: 2,
      });
      canvas.add(rect);
      canvas.discardActiveObject();
      canvas.renderAll();
    });

    await page.click('[data-tool="ellipse"]');

    const canvasEl = page.locator('#drawing-canvas');
    const box = await canvasEl.boundingBox();
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 250, { steps: 5 });
    await page.mouse.up();

    const objectCount = await page.evaluate(() => canvas.getObjects().length);
    expect(objectCount).toBe(2);
  });

  test('skipTargetFind is true for non-select tools', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Select tool — skipTargetFind should be false
    await page.click('[data-tool="select"]');
    const selectSkip = await page.evaluate(() => canvas.skipTargetFind);
    expect(selectSkip).toBe(false);

    // Rect tool — skipTargetFind should be true
    await page.click('[data-tool="rect"]');
    const rectSkip = await page.evaluate(() => canvas.skipTargetFind);
    expect(rectSkip).toBe(true);

    // Draw tool — skipTargetFind should be true
    await page.click('[data-tool="draw"]');
    const drawSkip = await page.evaluate(() => canvas.skipTargetFind);
    expect(drawSkip).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature: Light/Dark theme
// ---------------------------------------------------------------------------

test.describe('Theme toggle', () => {
  test('theme toggle button exists in toolbar', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await expect(page.locator('#btn-theme')).toBeVisible();
  });

  test('default theme is dark', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    const theme = await page.evaluate(() => document.body.dataset.theme);
    expect(theme || 'dark').toBe('dark');
  });

  test('clicking theme toggle switches to light theme', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('#btn-theme');

    const result = await page.evaluate(() => ({
      theme: document.body.dataset.theme,
      canvasBg: canvas.backgroundColor,
    }));

    expect(result.theme).toBe('light');
    // Canvas background should be a light color
    expect(result.canvasBg).not.toBe('#1a1a2e');
  });

  test('clicking theme toggle again switches back to dark', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('#btn-theme');
    await page.click('#btn-theme');

    const result = await page.evaluate(() => ({
      theme: document.body.dataset.theme,
      canvasBg: canvas.backgroundColor,
    }));

    expect(result.theme).toBe('dark');
    expect(result.canvasBg).toBe('#1a1a2e');
  });

  test('theme persists across page reload', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('#btn-theme');
    const themeAfterToggle = await page.evaluate(() => document.body.dataset.theme);
    expect(themeAfterToggle).toBe('light');

    await page.reload();
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    const themeAfterReload = await page.evaluate(() => document.body.dataset.theme);
    expect(themeAfterReload).toBe('light');
  });

  test('UI elements update with theme', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Switch to light theme
    await page.click('#btn-theme');

    // Check that toolbar and bottom bar have light styling
    const toolbarBg = await page.locator('#toolbar').evaluate(
      el => getComputedStyle(el).backgroundColor
    );
    const bottomBarBg = await page.locator('#bottom-bar').evaluate(
      el => getComputedStyle(el).backgroundColor
    );

    // Should not be the dark theme colors
    expect(toolbarBg).not.toBe('rgb(22, 33, 62)'); // #16213e
    expect(bottomBarBg).not.toBe('rgb(22, 33, 62)');
  });
});

// ---------------------------------------------------------------------------
// Optimization: start-server handles check-session internally
// ---------------------------------------------------------------------------

test.describe('Start server with session check', () => {
  // This tests the combined start-server.sh behavior — covered in
  // test/start-server.test.mjs since it's a shell script test, not browser.
});

// ---------------------------------------------------------------------------
// Object copy/paste
// ---------------------------------------------------------------------------

test.describe('Object copy/paste', () => {
  test('Ctrl+C and Ctrl+V duplicates a canvas object', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.evaluate(() => {
      const rect = new fabric.Rect({
        left: 100, top: 100, width: 100, height: 100,
        fill: '#4a9eff', stroke: '#fff',
      });
      canvas.add(rect);
      canvas.setActiveObject(rect);
      canvas.renderAll();
    });

    const before = await page.evaluate(() => canvas.getObjects().length);
    expect(before).toBe(1);

    await page.keyboard.down('Control');
    await page.keyboard.press('c');
    await page.keyboard.up('Control');

    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');

    await page.waitForTimeout(100);
    const after = await page.evaluate(() => canvas.getObjects().length);
    expect(after).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ctrl+Enter submit
// ---------------------------------------------------------------------------

test.describe('Ctrl+Enter submit', () => {
  test('Ctrl+Enter in prompt input triggers submit', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');
    await page.waitForFunction(() => document.getElementById('btn-submit').disabled === false, { timeout: 5000 });

    await page.fill('#prompt-input', 'test message');
    await page.focus('#prompt-input');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');

    await page.waitForTimeout(200);
    const btnText = await page.locator('#btn-submit').textContent();
    expect(['Sending...', 'Sent!']).toContain(btnText);
  });
});

// ---------------------------------------------------------------------------
// Zoom indicator
// ---------------------------------------------------------------------------

test.describe('Zoom indicator', () => {
  test('zoom indicator shows 100% by default', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    const zoomText = await page.locator('#zoom-level').textContent();
    expect(zoomText).toBe('100%');
  });

  test('clicking zoom indicator resets to 100%', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.evaluate(() => {
      canvas.zoomToPoint(new fabric.Point(400, 300), 2.0);
    });

    await page.click('#zoom-level');
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => ({
      zoom: canvas.getZoom(),
      text: document.getElementById('zoom-level').textContent,
    }));

    expect(result.zoom).toBe(1);
    expect(result.text).toBe('100%');
  });
});

// ---------------------------------------------------------------------------
// Arrow tool performance
// ---------------------------------------------------------------------------

test.describe('Arrow tool performance', () => {
  test('arrow tool creates a grouped arrow on mouse up', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    await page.click('[data-tool="arrow"]');

    const canvasEl = page.locator('#drawing-canvas');
    const box = await canvasEl.boundingBox();
    const startX = box.x + 100;
    const startY = box.y + 100;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 200, startY + 50, { steps: 10 });
    await page.mouse.up();

    const result = await page.evaluate(() => {
      const objects = canvas.getObjects();
      const last = objects[objects.length - 1];
      return {
        count: objects.length,
        type: last?.type,
        isGroup: last?.type === 'group',
      };
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.isGroup).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Line Tool
// ---------------------------------------------------------------------------
test.describe('Line Tool', () => {
  test('L key switches to line tool', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.press('body', 'l');
    const btn = page.locator('.tool-btn[data-tool="line"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  test('draws a line on drag', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.press('body', 'l');
    const canvasEl = page.locator('.upper-canvas');
    const box = await canvasEl.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 200, { steps: 5 });
    await page.mouse.up();
    await page.press('body', 'v');
    const count = await page.evaluate(() => canvas.getObjects().length);
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Polygon Tool
// ---------------------------------------------------------------------------
test.describe('Polygon Tool', () => {
  test('P key switches to polygon tool', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.press('body', 'p');
    const btn = page.locator('.tool-btn[data-tool="polygon"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  test('Escape cancels polygon drawing', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.press('body', 'p');
    const canvasEl = page.locator('.upper-canvas');
    const box = await canvasEl.boundingBox();
    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 200, box.y + 100);
    await page.press('body', 'Escape');
    const count = await page.evaluate(() => canvas.getObjects().length);
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Object ID System
// ---------------------------------------------------------------------------
test.describe('Object ID System', () => {
  test('new objects get a caveId assigned', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.press('body', 'r');
    const canvasEl = page.locator('.upper-canvas');
    const box = await canvasEl.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
    await page.mouse.up();
    const hasId = await page.evaluate(() => {
      const obj = canvas.getObjects()[0];
      return typeof obj.caveId === 'string' && obj.caveId.length > 0;
    });
    expect(hasId).toBe(true);
  });

  test('caveId persists through JSON round-trip', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.press('body', 'r');
    const canvasEl = page.locator('.upper-canvas');
    const box = await canvasEl.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
    await page.mouse.up();

    const result = await page.evaluate(() => {
      const obj = canvas.getObjects()[0];
      const originalId = obj.caveId;
      const json = canvas.toJSON(['caveId', 'caveName']);
      return { originalId, jsonHasId: !!json.objects[0].caveId, jsonId: json.objects[0].caveId };
    });
    expect(result.jsonHasId).toBe(true);
    expect(result.jsonId).toBe(result.originalId);
  });
});

// ---------------------------------------------------------------------------
// Responsive Layout
// ---------------------------------------------------------------------------
test.describe('Responsive Layout', () => {
  test('toolbar moves to top on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 1024 });
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('#toolbar');
    const toolbar = page.locator('#toolbar');
    const box = await toolbar.boundingBox();
    expect(box.width).toBeGreaterThan(box.height);
  });

  test('toolbar is vertical sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('#toolbar');
    const toolbar = page.locator('#toolbar');
    const box = await toolbar.boundingBox();
    expect(box.height).toBeGreaterThan(box.width);
  });
});

// ---------------------------------------------------------------------------
// Connector System
// ---------------------------------------------------------------------------
test.describe('Connector System', () => {
  test('C key switches to connector tool', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');
    await page.press('body', 'c');
    const btn = page.locator('.tool-btn[data-tool="connector"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  test('connector button exists in toolbar', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForSelector('.tool-btn[data-tool="connector"]');
    await expect(page.locator('.tool-btn[data-tool="connector"]')).toBeVisible();
  });

  test('moving source object updates connector position', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Create two rectangles and a connector programmatically
    const connectorLeft = await page.evaluate(() => {
      const r1 = new fabric.Rect({
        left: 50, top: 50, width: 80, height: 80,
        fill: '#ff0000', stroke: '#fff', strokeWidth: 1,
      });
      const r2 = new fabric.Rect({
        left: 300, top: 50, width: 80, height: 80,
        fill: '#00ff00', stroke: '#fff', strokeWidth: 1,
      });
      canvas.add(r1);
      canvas.add(r2);
      canvas.renderAll();

      // Import createConnector via the module — it's already loaded
      // Use the global reference to connectors module
      const sourceId = r1.caveId;
      const targetId = r2.caveId;

      // We need to call createConnector. Since modules are loaded, access via import.
      // Instead, simulate by calling the function directly from the window.
      // The module system doesn't expose globals, so we'll create the connector manually.
      // Actually, let's use dynamic import or access the module's exports through the app.
      // Simplest: call through a helper we know is wired up.
      return { sourceId, targetId };
    });

    // Create connector by importing the module in-page
    await page.evaluate(async ({ sourceId, targetId }) => {
      const mod = await import('./connectors.js');
      mod.createConnector(sourceId, 'right', targetId, 'left', canvas);
      canvas.renderAll();
    }, connectorLeft);

    // Get initial connector position
    const initialPos = await page.evaluate(() => {
      const conn = canvas.getObjects().find(o => o.isConnector);
      return conn ? { left: conn.left, top: conn.top } : null;
    });
    expect(initialPos).not.toBeNull();

    // Move source object
    await page.evaluate(() => {
      const r1 = canvas.getObjects().find(o => !o.isConnector && o.fill === '#ff0000');
      r1.set({ left: 50, top: 200 });
      r1.setCoords();
      canvas.fire('object:moving', { target: r1 });
      canvas.renderAll();
    });

    // Check connector position changed
    const newPos = await page.evaluate(() => {
      const conn = canvas.getObjects().find(o => o.isConnector);
      return conn ? { left: conn.left, top: conn.top } : null;
    });
    expect(newPos).not.toBeNull();
    // Position should have changed (connector was rerouted)
    expect(newPos.left !== initialPos.left || newPos.top !== initialPos.top).toBe(true);
  });

  test('deleting an object removes its connectors', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');

    // Create two rectangles and a connector
    await page.evaluate(async () => {
      const r1 = new fabric.Rect({
        left: 50, top: 50, width: 80, height: 80,
        fill: '#ff0000', stroke: '#fff', strokeWidth: 1,
      });
      const r2 = new fabric.Rect({
        left: 300, top: 50, width: 80, height: 80,
        fill: '#00ff00', stroke: '#fff', strokeWidth: 1,
      });
      canvas.add(r1);
      canvas.add(r2);
      canvas.renderAll();

      const mod = await import('./connectors.js');
      mod.createConnector(r1.caveId, 'right', r2.caveId, 'left', canvas);
      canvas.renderAll();
    });

    // Verify connector exists
    const beforeCount = await page.evaluate(() =>
      canvas.getObjects().filter(o => o.isConnector).length
    );
    expect(beforeCount).toBe(1);

    // Remove one of the rectangles
    await page.evaluate(() => {
      const r1 = canvas.getObjects().find(o => !o.isConnector && o.fill === '#ff0000');
      canvas.remove(r1);
      canvas.renderAll();
    });

    // Connector should be gone
    const afterCount = await page.evaluate(() =>
      canvas.getObjects().filter(o => o.isConnector).length
    );
    expect(afterCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Object List Panel
// ---------------------------------------------------------------------------
test.describe('Object List Panel', () => {
  test('O key toggles object list panel', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');
    await page.press('body', 'o');
    const panel = page.locator('#object-list-panel');
    await expect(panel).toBeVisible();
    await page.press('body', 'o');
    await expect(panel).not.toBeVisible();
  });

  test('shows correct object count', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');
    await page.evaluate(() => {
      const r1 = new fabric.Rect({ left: 50, top: 50, width: 80, height: 80, fill: 'red' });
      const r2 = new fabric.Rect({ left: 200, top: 50, width: 80, height: 80, fill: 'blue' });
      canvas.add(r1);
      canvas.add(r2);
      canvas.renderAll();
    });
    await page.press('body', 'o');
    const items = page.locator('.object-list-item');
    await expect(items).toHaveCount(2);
  });

  test('clicking list item selects object on canvas', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForFunction(() => typeof window.fabric !== 'undefined');
    await page.evaluate(() => {
      canvas.add(new fabric.Rect({ left: 50, top: 50, width: 80, height: 80, fill: 'red' }));
      canvas.renderAll();
    });
    await page.press('body', 'o');
    await page.locator('.object-list-item').first().click();
    const hasActive = await page.evaluate(() => !!canvas.getActiveObject());
    expect(hasActive).toBe(true);
  });
});
