/* global fabric */

// ---------------------------------------------------------------------------
// Connector System
// ---------------------------------------------------------------------------
// Provides anchor points on objects, a routing algorithm, ConnectorLine
// creation via fabric.Group, a connector index for O(1) lookup, and
// lifecycle + serialization helpers.
// ---------------------------------------------------------------------------

import { getCanvas, saveState } from './canvas-core.js';

// ---------------------------------------------------------------------------
// Connector Index — caveId -> ConnectorLine[]
// ---------------------------------------------------------------------------
const connectorIndex = new Map();

function addToIndex(caveId, connector) {
  if (!connectorIndex.has(caveId)) connectorIndex.set(caveId, []);
  connectorIndex.get(caveId).push(connector);
}

function removeFromIndex(connector) {
  for (const [caveId, list] of connectorIndex) {
    const idx = list.indexOf(connector);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) connectorIndex.delete(caveId);
  }
}

// ---------------------------------------------------------------------------
// Connector metadata properties that must survive serialization
// ---------------------------------------------------------------------------
const CONNECTOR_PROPS = [
  'isConnector', 'sourceId', 'sourceAnchor', 'targetId', 'targetAnchor',
  'showArrow', 'connectorStroke', 'connectorStrokeWidth', 'connectorDash',
];

// ---------------------------------------------------------------------------
// getAnchorPoints(obj) — bounding box midpoints in canvas coords
// ---------------------------------------------------------------------------
export function getAnchorPoints(obj) {
  const br = obj.getBoundingRect();
  return {
    top:    { x: br.left + br.width / 2,  y: br.top },
    bottom: { x: br.left + br.width / 2,  y: br.top + br.height },
    left:   { x: br.left,                  y: br.top + br.height / 2 },
    right:  { x: br.left + br.width,       y: br.top + br.height / 2 },
  };
}

// ---------------------------------------------------------------------------
// findByCaveId(canvas, caveId) — find an object by its caveId
// ---------------------------------------------------------------------------
export function findByCaveId(canvas, caveId) {
  return canvas.getObjects().find(o => o.caveId === caveId) || null;
}

// ---------------------------------------------------------------------------
// Collision detection helpers
// ---------------------------------------------------------------------------
function getBoundingBoxes(canvas, excludeIds) {
  const boxes = [];
  for (const obj of canvas.getObjects()) {
    if (obj.isConnector) continue;
    if (excludeIds.has(obj.caveId)) continue;
    boxes.push(obj.getBoundingRect());
  }
  return boxes;
}

function segmentIntersectsRect(x1, y1, x2, y2, rect) {
  // Check if line segment (x1,y1)-(x2,y2) intersects axis-aligned rect
  const pad = 2; // small padding
  const rLeft = rect.left - pad;
  const rRight = rect.left + rect.width + pad;
  const rTop = rect.top - pad;
  const rBottom = rect.top + rect.height + pad;

  // Cohen-Sutherland-style clipping test
  function outcode(x, y) {
    let code = 0;
    if (x < rLeft) code |= 1;
    else if (x > rRight) code |= 2;
    if (y < rTop) code |= 4;
    else if (y > rBottom) code |= 8;
    return code;
  }

  let c1 = outcode(x1, y1);
  let c2 = outcode(x2, y2);

  // Trivially accept / reject
  if ((c1 & c2) !== 0) return false;
  if ((c1 | c2) === 0) return true;

  // Do a proper intersection check
  let ax = x1, ay = y1, bx = x2, by = y2;
  for (let i = 0; i < 10; i++) {
    let ca = outcode(ax, ay);
    let cb = outcode(bx, by);
    if ((ca & cb) !== 0) return false;
    if ((ca | cb) === 0) return true;

    const cout = ca !== 0 ? ca : cb;
    let nx, ny;
    if (cout & 8) {
      nx = ax + (bx - ax) * (rBottom - ay) / (by - ay);
      ny = rBottom;
    } else if (cout & 4) {
      nx = ax + (bx - ax) * (rTop - ay) / (by - ay);
      ny = rTop;
    } else if (cout & 2) {
      ny = ay + (by - ay) * (rRight - ax) / (bx - ax);
      nx = rRight;
    } else {
      ny = ay + (by - ay) * (rLeft - ax) / (bx - ax);
      nx = rLeft;
    }

    if (cout === ca) { ax = nx; ay = ny; }
    else { bx = nx; by = ny; }
  }
  return true;
}

function countCollisions(points, boxes) {
  let hits = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const box of boxes) {
      if (segmentIntersectsRect(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, box)) {
        hits++;
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// calculateRoute — returns array of {x, y} points for the polyline
// ---------------------------------------------------------------------------
export function calculateRoute(sourceAnchor, sourcePoint, targetAnchor, targetPoint, allObjects, sourceObj, targetObj) {
  const canvas = getCanvas();
  const excludeIds = new Set();
  if (sourceObj?.caveId) excludeIds.add(sourceObj.caveId);
  if (targetObj?.caveId) excludeIds.add(targetObj.caveId);
  const boxes = getBoundingBoxes(canvas, excludeIds);

  // 1. Try straight line
  const straightCollisions = countCollisions([sourcePoint, targetPoint], boxes);
  if (straightCollisions === 0) {
    return [sourcePoint, targetPoint];
  }

  // 2. Orthogonal routing with 20px extension from anchor direction
  const EXT = 20;
  const dirMap = {
    top:    { dx: 0, dy: -EXT },
    bottom: { dx: 0, dy:  EXT },
    left:   { dx: -EXT, dy: 0 },
    right:  { dx:  EXT, dy: 0 },
  };

  const srcExt = {
    x: sourcePoint.x + (dirMap[sourceAnchor]?.dx || 0),
    y: sourcePoint.y + (dirMap[sourceAnchor]?.dy || 0),
  };
  const tgtExt = {
    x: targetPoint.x + (dirMap[targetAnchor]?.dx || 0),
    y: targetPoint.y + (dirMap[targetAnchor]?.dy || 0),
  };

  // L-shape option 1: H then V
  const mid1 = { x: tgtExt.x, y: srcExt.y };
  const route1 = [sourcePoint, srcExt, mid1, tgtExt, targetPoint];
  const c1 = countCollisions(route1, boxes);

  // L-shape option 2: V then H
  const mid2 = { x: srcExt.x, y: tgtExt.y };
  const route2 = [sourcePoint, srcExt, mid2, tgtExt, targetPoint];
  const c2 = countCollisions(route2, boxes);

  return c1 <= c2 ? route1 : route2;
}

// ---------------------------------------------------------------------------
// createArrowhead — small triangle polygon at the target end
// ---------------------------------------------------------------------------
function createArrowhead(points, stroke) {
  const len = points.length;
  if (len < 2) return null;
  const p1 = points[len - 2];
  const p2 = points[len - 1];
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const headLen = 10;

  return new fabric.Polygon(
    [
      { x: 0, y: 0 },
      { x: -headLen, y: headLen / 2 },
      { x: -headLen, y: -headLen / 2 },
    ],
    {
      left: p2.x,
      top: p2.y,
      fill: stroke,
      stroke: stroke,
      angle: (angle * 180) / Math.PI,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    }
  );
}

// ---------------------------------------------------------------------------
// buildConnectorGroup — creates a fabric.Group with polyline + optional arrow
// ---------------------------------------------------------------------------
function buildConnectorGroup(points, meta) {
  const stroke = meta.connectorStroke || '#4a9eff';
  const strokeWidth = meta.connectorStrokeWidth || 2;
  const dash = meta.connectorDash || null;

  const polyline = new fabric.Polyline(points, {
    fill: 'transparent',
    stroke: stroke,
    strokeWidth: strokeWidth,
    strokeDashArray: dash,
    selectable: false,
    evented: false,
  });

  const children = [polyline];
  if (meta.showArrow !== false) {
    const arrow = createArrowhead(points, stroke);
    if (arrow) children.push(arrow);
  }

  const group = new fabric.Group(children, {
    selectable: true,
    evented: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
    subTargetCheck: false,
  });

  // Assign metadata
  group.isConnector = true;
  group.sourceId = meta.sourceId;
  group.sourceAnchor = meta.sourceAnchor;
  group.targetId = meta.targetId;
  group.targetAnchor = meta.targetAnchor;
  group.showArrow = meta.showArrow !== false;
  group.connectorStroke = stroke;
  group.connectorStrokeWidth = strokeWidth;
  group.connectorDash = dash;

  // Patch toObject on this instance so metadata survives serialization
  const _origToObject = group.toObject.bind(group);
  group.toObject = function (additionalProps) {
    const base = _origToObject(additionalProps);
    CONNECTOR_PROPS.forEach(prop => {
      if (this[prop] !== undefined) base[prop] = this[prop];
    });
    return base;
  };

  return group;
}

// ---------------------------------------------------------------------------
// createConnector — the main public API
// ---------------------------------------------------------------------------
export function createConnector(sourceId, sourceAnchor, targetId, targetAnchor, canvas) {
  const sourceObj = findByCaveId(canvas, sourceId);
  const targetObj = findByCaveId(canvas, targetId);
  if (!sourceObj || !targetObj) {
    console.warn('createConnector: source or target not found', sourceId, targetId);
    return null;
  }

  const srcAnchors = getAnchorPoints(sourceObj);
  const tgtAnchors = getAnchorPoints(targetObj);
  const srcPt = srcAnchors[sourceAnchor];
  const tgtPt = tgtAnchors[targetAnchor];

  const points = calculateRoute(sourceAnchor, srcPt, targetAnchor, tgtPt, null, sourceObj, targetObj);

  const group = buildConnectorGroup(points, {
    sourceId,
    sourceAnchor,
    targetId,
    targetAnchor,
    showArrow: true,
    connectorStroke: '#4a9eff',
    connectorStrokeWidth: 2,
    connectorDash: null,
  });

  canvas.add(group);
  addToIndex(sourceId, group);
  addToIndex(targetId, group);

  return group;
}

// ---------------------------------------------------------------------------
// rerouteConnectors — recalculate routes for all connectors on movedObj
// ---------------------------------------------------------------------------
export function rerouteConnectors(canvas, movedObj) {
  const caveId = movedObj.caveId;
  if (!caveId) return;

  const connectors = connectorIndex.get(caveId);
  if (!connectors || connectors.length === 0) return;

  // Work on a copy because we'll modify the list
  const toReroute = [...connectors];

  for (const conn of toReroute) {
    const sourceObj = findByCaveId(canvas, conn.sourceId);
    const targetObj = findByCaveId(canvas, conn.targetId);
    if (!sourceObj || !targetObj) continue;

    const srcAnchors = getAnchorPoints(sourceObj);
    const tgtAnchors = getAnchorPoints(targetObj);
    const srcPt = srcAnchors[conn.sourceAnchor];
    const tgtPt = tgtAnchors[conn.targetAnchor];

    const points = calculateRoute(
      conn.sourceAnchor, srcPt, conn.targetAnchor, tgtPt,
      null, sourceObj, targetObj
    );

    // Remove old connector, create replacement
    const meta = {
      sourceId: conn.sourceId,
      sourceAnchor: conn.sourceAnchor,
      targetId: conn.targetId,
      targetAnchor: conn.targetAnchor,
      showArrow: conn.showArrow,
      connectorStroke: conn.connectorStroke,
      connectorStrokeWidth: conn.connectorStrokeWidth,
      connectorDash: conn.connectorDash,
    };

    removeFromIndex(conn);
    canvas.remove(conn);

    const newGroup = buildConnectorGroup(points, meta);
    canvas.add(newGroup);
    addToIndex(meta.sourceId, newGroup);
    addToIndex(meta.targetId, newGroup);
  }

  canvas.requestRenderAll();
}

// ---------------------------------------------------------------------------
// deleteConnectorsFor — remove all connectors referencing a caveId
// ---------------------------------------------------------------------------
export function deleteConnectorsFor(canvas, caveId) {
  const connectors = connectorIndex.get(caveId);
  if (!connectors || connectors.length === 0) return;

  const toDelete = [...connectors];
  for (const conn of toDelete) {
    removeFromIndex(conn);
    canvas.remove(conn);
  }
}

// ---------------------------------------------------------------------------
// clearConnectorIndex — clear the connector index
// ---------------------------------------------------------------------------
export function clearConnectorIndex() {
  connectorIndex.clear();
}

// ---------------------------------------------------------------------------
// reconnectConnectors — rebuild index from existing objects after loadFromJSON
// ---------------------------------------------------------------------------
export function reconnectConnectors(canvas) {
  // Clear old index
  connectorIndex.clear();

  const toRemove = [];
  for (const obj of canvas.getObjects()) {
    if (!obj.isConnector) continue;

    const sourceObj = findByCaveId(canvas, obj.sourceId);
    const targetObj = findByCaveId(canvas, obj.targetId);

    if (!sourceObj || !targetObj) {
      console.warn('reconnectConnectors: missing source or target, removing connector', obj.sourceId, obj.targetId);
      toRemove.push(obj);
      continue;
    }

    // Re-patch toObject on deserialized connectors
    const _origToObject = obj.toObject.bind(obj);
    obj.toObject = function (additionalProps) {
      const base = _origToObject(additionalProps);
      CONNECTOR_PROPS.forEach(prop => {
        if (this[prop] !== undefined) base[prop] = this[prop];
      });
      return base;
    };

    addToIndex(obj.sourceId, obj);
    addToIndex(obj.targetId, obj);
  }

  for (const obj of toRemove) {
    canvas.remove(obj);
  }
}

// ---------------------------------------------------------------------------
// Connector tool state
// ---------------------------------------------------------------------------
let connectorToolState = {
  active: false,
  sourceId: null,
  sourceAnchor: null,
  previewLine: null,
  afterRenderHandler: null,
};

// ---------------------------------------------------------------------------
// Anchor overlay rendering
// ---------------------------------------------------------------------------
const ANCHOR_RADIUS = 6;
const ANCHOR_HIT_RADIUS = 14;

function findNearestAnchor(canvas, pointer) {
  let best = null;
  let bestDist = ANCHOR_HIT_RADIUS;

  for (const obj of canvas.getObjects()) {
    if (obj.isConnector) continue;
    if (!obj.caveId) continue;
    const anchors = getAnchorPoints(obj);
    for (const [name, pt] of Object.entries(anchors)) {
      const dist = Math.sqrt((pointer.x - pt.x) ** 2 + (pointer.y - pt.y) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = { caveId: obj.caveId, anchor: name, point: pt, obj };
      }
    }
  }
  return best;
}

function drawAnchorOverlay(canvas) {
  const ctx = canvas.getTopContext();
  ctx.save();
  // Apply the same viewport transform as the main canvas
  const vpt = canvas.viewportTransform;
  ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

  for (const obj of canvas.getObjects()) {
    if (obj.isConnector) continue;
    if (!obj.caveId) continue;
    const anchors = getAnchorPoints(obj);
    for (const [, pt] of Object.entries(anchors)) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ANCHOR_RADIUS / vpt[0], 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(74,158,255,0.8)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / vpt[0];
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// activateConnectorTool / deactivateConnectorTool
// ---------------------------------------------------------------------------
export function activateConnectorTool() {
  const canvas = getCanvas();
  connectorToolState.active = true;
  connectorToolState.sourceId = null;
  connectorToolState.sourceAnchor = null;

  // Prevent Fabric.js from selecting/dragging objects — we handle anchor
  // hit-testing ourselves from raw pointer coordinates
  canvas.skipTargetFind = true;
  canvas.selection = false;
  canvas.defaultCursor = 'crosshair';
  canvas.hoverCursor = 'crosshair';

  // Remove any existing handler before adding a new one (prevents duplication)
  if (connectorToolState.afterRenderHandler) {
    canvas.off('after:render', connectorToolState.afterRenderHandler);
  }

  // Draw anchor overlay after each render
  connectorToolState.afterRenderHandler = () => {
    if (connectorToolState.active) drawAnchorOverlay(canvas);
  };
  canvas.on('after:render', connectorToolState.afterRenderHandler);
  canvas.requestRenderAll();
}

export function deactivateConnectorTool() {
  const canvas = getCanvas();
  connectorToolState.active = false;

  if (connectorToolState.afterRenderHandler) {
    canvas.off('after:render', connectorToolState.afterRenderHandler);
    connectorToolState.afterRenderHandler = null;
  }

  // Remove preview line if exists
  if (connectorToolState.previewLine) {
    canvas.remove(connectorToolState.previewLine);
    connectorToolState.previewLine = null;
  }

  connectorToolState.sourceId = null;
  connectorToolState.sourceAnchor = null;

  // Force clear the overlay canvas to remove lingering anchor dots
  canvas.clearContext(canvas.getTopContext());
  canvas.requestRenderAll();
}

// ---------------------------------------------------------------------------
// Connector tool mouse handlers — called from tools.js
// ---------------------------------------------------------------------------
export function connectorMouseDown(pointer) {
  const canvas = getCanvas();
  const hit = findNearestAnchor(canvas, pointer);

  if (!hit) {
    // Clicked empty canvas — cancel if in progress
    if (connectorToolState.sourceId) {
      connectorToolState.sourceId = null;
      connectorToolState.sourceAnchor = null;
      if (connectorToolState.previewLine) {
        canvas.remove(connectorToolState.previewLine);
        connectorToolState.previewLine = null;
      }
    }
    return;
  }

  if (!connectorToolState.sourceId) {
    // First click — set source
    connectorToolState.sourceId = hit.caveId;
    connectorToolState.sourceAnchor = hit.anchor;

    // Create preview line
    connectorToolState.previewLine = new fabric.Line(
      [hit.point.x, hit.point.y, hit.point.x, hit.point.y],
      {
        stroke: '#4a9eff',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
      }
    );
    canvas.add(connectorToolState.previewLine);
  } else {
    // Second click — create connector (cannot connect to self)
    if (hit.caveId === connectorToolState.sourceId) return;

    // Remove preview line
    if (connectorToolState.previewLine) {
      canvas.remove(connectorToolState.previewLine);
      connectorToolState.previewLine = null;
    }

    createConnector(
      connectorToolState.sourceId,
      connectorToolState.sourceAnchor,
      hit.caveId,
      hit.anchor,
      canvas
    );

    connectorToolState.sourceId = null;
    connectorToolState.sourceAnchor = null;
    saveState();
  }
}

export function connectorMouseMove(pointer) {
  if (!connectorToolState.previewLine) return;
  connectorToolState.previewLine.set({ x2: pointer.x, y2: pointer.y });
  getCanvas().requestRenderAll();
}

export function connectorCancel() {
  const canvas = getCanvas();
  connectorToolState.sourceId = null;
  connectorToolState.sourceAnchor = null;
  if (connectorToolState.previewLine) {
    canvas.remove(connectorToolState.previewLine);
    connectorToolState.previewLine = null;
  }
  canvas.requestRenderAll();
}

// ---------------------------------------------------------------------------
// Lifecycle event wiring — call from canvas-core or app.js
// ---------------------------------------------------------------------------
export function setupConnectorLifecycle(canvas) {
  canvas.on('object:moving', (e) => {
    if (e.target.caveId) rerouteConnectors(canvas, e.target);
  });
  canvas.on('object:scaling', (e) => {
    if (e.target.caveId) rerouteConnectors(canvas, e.target);
  });
  canvas.on('object:rotating', (e) => {
    if (e.target.caveId) rerouteConnectors(canvas, e.target);
  });
  canvas.on('object:removed', (e) => {
    if (e.target.caveId && !e.target.isConnector) {
      deleteConnectorsFor(canvas, e.target.caveId);
    }
  });
}
