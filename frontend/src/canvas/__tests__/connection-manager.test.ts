// ===========================================================================
// Connection Manager Tests
// 来源: 任务清单 M-FE-03
// ===========================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { Rect, Group, Polyline, Triangle, Text, FabricObject } from 'fabric';
import type { ICanvasEngine } from '../canvas-engine';
import type { Point, Rect as RectType, EdgeStyle } from '@/types/canvas-model';
import type { RelationshipType } from '@/types/semantic-model';
import { RELATIONSHIP_STYLE_MAP } from '@/types/semantic-model';
import { ConnectionManager } from '../connectors/connection-manager';
import type { IConnectionManager } from '../connectors/connection-manager';

// ===========================================================================
// Mock ICanvasEngine
// ===========================================================================

interface ObjectWithData extends FabricObject {
  data?: Record<string, unknown>;
}

function getObjData(obj: FabricObject): Record<string, unknown> | undefined {
  return (obj as ObjectWithData).data;
}

function createMockCanvas(): ICanvasEngine {
  const objects: FabricObject[] = [];

  return {
    initialize: () => {},
    destroy: () => {},
    zoom: () => {},
    zoomToFit: () => {},
    pan: () => {},
    getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
    setViewport: () => {},
    addObject: (obj: FabricObject) => {
      objects.push(obj);
    },
    removeObject: (obj: FabricObject) => {
      const idx = objects.indexOf(obj);
      if (idx !== -1) objects.splice(idx, 1);
    },
    getObjectById: (id: string) =>
      objects.find((o) => getObjData(o)?.id === id) ?? null,
    getSelectedObjects: () => [],
    loadFromJSON: async () => {},
    toJSON: () => ({
      version: '1.0',
      viewport: { zoom: 1, panX: 0, panY: 0 },
      background: '#FFFFFF',
      objects: [],
    }),
    setGridVisible: () => {},
    setSnapToGrid: () => {},
    setBackground: () => {},
    on: () => {},
    off: () => {},
  };
}

/** 创建测试用元素矩形 */
function createElement(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Rect {
  const rect = new Rect({
    left,
    top,
    width,
    height,
    fill: '#CCCCCC',
    stroke: '#333333',
    strokeWidth: 2,
  });
  (rect as ObjectWithData).data = { id };
  return rect;
}

/** 创建模拟障碍物 Rects */
function makeObstacle(
  x: number,
  y: number,
  width: number,
  height: number,
): RectType {
  return { x, y, width, height };
}

// ===========================================================================
// 1. 连线生命周期 (Lifecycle)
// ===========================================================================

describe('1. Connection Lifecycle', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  it('1.1 createConnection should produce a Group with Polyline', () => {
    const src = createElement('elem-1', 100, 100, 160, 80);
    const tgt = createElement('elem-2', 400, 200, 160, 80);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('elem-1', 'elem-2', 'Connection');

    expect(conn).toBeInstanceOf(Group);
    const group = conn as Group;
    const children = group.getObjects();
    expect(children.some((c) => c instanceof Polyline)).toBe(true);
  });

  it('1.1 createConnection should store metadata in Group.data', () => {
    const src = createElement('elem-a', 50, 50, 100, 60);
    const tgt = createElement('elem-b', 300, 50, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('elem-a', 'elem-b', 'Binding');

    const data = getObjData(conn);
    expect(data).toBeDefined();
    expect(data?.id).toBeTruthy();
    expect(data?.sourceId).toBe('elem-a');
    expect(data?.targetId).toBe('elem-b');
    expect(data?.type).toBe('Binding');
    expect(data?.connectionType).toBe('edge');
  });

  it('1.1 createConnection should throw if source not found', () => {
    const tgt = createElement('elem-x', 200, 200, 100, 60);
    mockCanvas.addObject(tgt);

    expect(() =>
      manager.createConnection('nonexistent', 'elem-x', 'Connection'),
    ).toThrow('Source object not found');
  });

  it('1.1 createConnection should throw if target not found', () => {
    const src = createElement('elem-x', 200, 200, 100, 60);
    mockCanvas.addObject(src);

    expect(() =>
      manager.createConnection('elem-x', 'nonexistent', 'Connection'),
    ).toThrow('Target object not found');
  });

  it('1.2 removeConnection should delete the connection', () => {
    const src = createElement('r1', 100, 100, 100, 60);
    const tgt = createElement('r2', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('r1', 'r2', 'Connection');
    const data = getObjData(conn);
    const connId = data?.id as string;
    expect(manager.getConnectionById(connId)).not.toBeNull();

    manager.removeConnection(connId);
    expect(manager.getConnectionById(connId)).toBeNull();
  });

  it('1.3 create -> getConnectionById finds it, remove -> null', () => {
    const src = createElement('life-1', 0, 0, 80, 40);
    const tgt = createElement('life-2', 200, 0, 80, 40);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('life-1', 'life-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    expect(manager.getConnectionById(connId)).toBe(conn);
    manager.removeConnection(connId);
    expect(manager.getConnectionById(connId)).toBeNull();
  });

  it('1.3 removeConnection on non-existent ID should not throw', () => {
    expect(() => manager.removeConnection('nonexistent-conn')).not.toThrow();
  });

  it('1.1 createConnection with custom style should override defaults', () => {
    const src = createElement('cs1', 100, 100, 100, 60);
    const tgt = createElement('cs2', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const customStyle: EdgeStyle = {
      strokeColor: '#FF0000',
      strokeWidth: 3,
      dashPattern: [4, 4],
      startArrow: 'filled',
      endArrow: 'diamond',
      lineType: 'straight',
    };

    const conn = manager.createConnection('cs1', 'cs2', 'Connection', customStyle);
    const group = conn as Group;
    const polyline = group.getObjects().find((c) => c instanceof Polyline) as Polyline;

    expect(polyline.stroke).toBe('#FF0000');
    expect(polyline.strokeWidth).toBe(3);
    expect(polyline.strokeDashArray).toEqual([4, 4]);
  });
});

// ===========================================================================
// 2. 连线样式 (Styles)
// ===========================================================================

describe('2. Connection Styles', () => {
  it('2.1 RELATIONSHIP_STYLE_MAP covers all core relationship types', () => {
    const expectedTypes: RelationshipType[] = [
      'Connection', 'Binding', 'ObjectFlow', 'ControlFlow',
      'Transition', 'Message', 'Satisfy', 'Verify',
      'Subclassification', 'Allocation',
      'Subsetting', 'Redefinition', 'Containment', 'Composition',
    ];

    for (const type of expectedTypes) {
      const style = RELATIONSHIP_STYLE_MAP[type];
      expect(style).toBeDefined();
      expect(typeof style.strokeColor).toBe('string');
      expect(typeof style.strokeWidth).toBe('number');
      expect(Array.isArray(style.dashPattern)).toBe(true);
      expect(['straight', 'orthogonal', 'curved']).toContain(style.lineType);
    }
  });

  it('2.4 Connection should be solid line with no arrows (default)', () => {
    const style = RELATIONSHIP_STYLE_MAP['Connection'];
    expect(style.dashPattern).toEqual([]);
    expect(style.endArrow).toBe('none');
    expect(style.startArrow).toBe('none');
  });

  it('2.4 Satisfy should be green dashed with filled end arrow', () => {
    const style = RELATIONSHIP_STYLE_MAP['Satisfy'];
    expect(style.strokeColor).toBe('#228B22');
    expect(style.dashPattern.length).toBeGreaterThan(0);
    expect(style.endArrow).toBe('filled');
  });

  it('2.4 Verify should be blue dashed with filled end arrow', () => {
    const style = RELATIONSHIP_STYLE_MAP['Verify'];
    expect(style.strokeColor).toBe('#1E90FF');
    expect(style.dashPattern.length).toBeGreaterThan(0);
    expect(style.endArrow).toBe('filled');
  });

  it('2.4 Transition should be curved line type', () => {
    const style = RELATIONSHIP_STYLE_MAP['Transition'];
    expect(style.lineType).toBe('curved');
  });

  it('2.4 Binding should be dashed with open end arrow', () => {
    const style = RELATIONSHIP_STYLE_MAP['Binding'];
    expect(style.dashPattern.length).toBeGreaterThan(0);
    expect(style.endArrow).toBe('open');
  });

  it('2.2 applyRelationshipStyle should update polyline visual properties', () => {
    const mockCanvas = createMockCanvas();
    const mgr = new ConnectionManager(mockCanvas);

    const src = createElement('sty-1', 100, 100, 100, 60);
    const tgt = createElement('sty-2', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    // Create with Connection (solid black, no arrows)
    const conn = mgr.createConnection('sty-1', 'sty-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    // Switch to Satisfy (green dashed, filled arrow)
    mgr.applyRelationshipStyle(connId, 'Satisfy');
    const group = conn as Group;
    const polyline = group.getObjects().find((c) => c instanceof Polyline) as Polyline;

    expect(polyline.stroke).toBe('#228B22');
    expect(polyline.strokeWidth).toBe(1.5);
    expect(polyline.strokeDashArray?.length).toBeGreaterThan(0);

    // Should now have a triangle (arrowhead)
    const triangles = group.getObjects().filter((c) => c instanceof Triangle);
    expect(triangles.length).toBeGreaterThanOrEqual(1);
  });

  it('2.2 applyRelationshipStyle on non-existent ID should not error', () => {
    const mockCanvas = createMockCanvas();
    const mgr = new ConnectionManager(mockCanvas);
    expect(() => mgr.applyRelationshipStyle('nonexistent', 'Connection')).not.toThrow();
  });

  it('2.3 end arrow should be rendered as Triangle on target end', () => {
    const mockCanvas = createMockCanvas();
    const mgr = new ConnectionManager(mockCanvas);

    const src = createElement('arr-1', 50, 50, 100, 60);
    const tgt = createElement('arr-2', 300, 50, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    // Satisfy has endArrow = 'filled', so arrowhead should be created
    const conn = mgr.createConnection('arr-1', 'arr-2', 'Satisfy');
    const group = conn as Group;
    const triangles = group.getObjects().filter((c) => c instanceof Triangle);

    expect(triangles.length).toBeGreaterThanOrEqual(1);
  });

  it('2.3 startArrow should be rendered when specified', () => {
    const mockCanvas = createMockCanvas();
    const mgr = new ConnectionManager(mockCanvas);

    const src = createElement('sa-1', 50, 50, 100, 60);
    const tgt = createElement('sa-2', 300, 50, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const customStyle: EdgeStyle = {
      strokeColor: '#333',
      strokeWidth: 2,
      dashPattern: [],
      startArrow: 'filled',
      endArrow: 'filled',
      lineType: 'straight',
    };

    const conn = mgr.createConnection('sa-1', 'sa-2', 'Connection', customStyle);
    const group = conn as Group;
    const triangles = group.getObjects().filter((c) => c instanceof Triangle);

    // Should have both start and end arrows
    expect(triangles.length).toBe(2);
  });

  it('2.3 connection with no arrows should have zero Triangles', () => {
    const mockCanvas = createMockCanvas();
    const mgr = new ConnectionManager(mockCanvas);

    const src = createElement('noarr-1', 50, 50, 100, 60);
    const tgt = createElement('noarr-2', 300, 50, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    // Connection has no arrows by default
    const conn = mgr.createConnection('noarr-1', 'noarr-2', 'Connection');
    const group = conn as Group;
    const triangles = group.getObjects().filter((c) => c instanceof Triangle);

    expect(triangles.length).toBe(0);
  });
});

// ===========================================================================
// 3. 路径计算 (Path Calculation)
// ===========================================================================

describe('3. Path Calculation', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  // ---- 3.1 Orthogonal Routing ----

  it('3.1 calculatePath should return at least source and target points', () => {
    const source: Point = { x: 100, y: 100 };
    const target: Point = { x: 300, y: 200 };
    const path = manager.calculatePath(source, target, []);

    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
  });

  it('3.1 orthogonal routing without obstacles should be L-shaped', () => {
    const source: Point = { x: 100, y: 100 };
    const target: Point = { x: 300, y: 200 };
    const path = manager.calculatePath(source, target, []);

    // Without obstacles, path should be 3 points (L-shape)
    expect(path.length).toBeLessThanOrEqual(3);

    // All segments should be axis-aligned
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const isHorizontal = p1.y === p2.y;
      const isVertical = p1.x === p2.x;
      expect(isHorizontal || isVertical).toBe(true);
    }
  });

  it('3.1 orthogonal routing should avoid a middle obstacle', () => {
    const source: Point = { x: 50, y: 100 };
    const target: Point = { x: 350, y: 100 };
    // Obstacle directly between source and target
    const obstacle = makeObstacle(180, 50, 40, 100);

    const path = manager.calculatePath(source, target, [obstacle]);

    // Verify no segment passes through the obstacle
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];

      // Segments should not pass through obstacle
      // Quick check: if segment is horizontal at y between 50-150
      // and x spans across 180-220, it would intersect
      if (p1.y === p2.y) {
        const y = p1.y;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        if (y > 50 && y < 150) {
          // Horizontal segment in the vertical range of obstacle
          // Should not cross x range 180-220
          const crossesObs = maxX > 180 && minX < 220;
          expect(crossesObs).toBe(false);
        }
      }
    }
  });

  it('3.1 orthogonal routing with vertical obstacle', () => {
    const source: Point = { x: 200, y: 50 };
    const target: Point = { x: 200, y: 300 };
    const obstacle = makeObstacle(150, 150, 100, 40);

    const path = manager.calculatePath(source, target, [obstacle]);

    // Verify path goes around vertically
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];

      if (p1.x === p2.x) {
        const x = p1.x;
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (x > 150 && x < 250) {
          const crossesObs = maxY > 150 && minY < 190;
          expect(crossesObs).toBe(false);
        }
      }
    }
  });

  it('3.1 orthogonal routing with empty obstacles returns clean path', () => {
    const source: Point = { x: 50, y: 150 };
    const target: Point = { x: 400, y: 150 };
    const path = manager.calculatePath(source, target, []);

    // Same Y, different X: should be a direct horizontal line
    expect(path.length).toBeLessThanOrEqual(3);
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
  });

  // ---- 3.2 Straight Routing ----

  it('3.2 straight line type should produce direct two-point path', () => {
    const src = createElement('st-1', 50, 50, 100, 60);
    const tgt = createElement('st-2', 300, 50, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('st-1', 'st-2', 'Message');
    const data = getObjData(conn);
    const waypoints = data?.waypoints as Point[];

    // Message type uses 'straight' lineType
    expect(waypoints.length).toBe(2);
    expect(waypoints[0].x).toBeGreaterThanOrEqual(0);
    expect(waypoints[1].x).toBeGreaterThanOrEqual(0);
  });

  // ---- 3.3 Curved Routing ----

  it('3.3 Transition (curved) should produce multiple waypoints', () => {
    const src = createElement('cv-1', 50, 50, 100, 60);
    const tgt = createElement('cv-2', 300, 50, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('cv-1', 'cv-2', 'Transition');
    const data = getObjData(conn);
    const waypoints = data?.waypoints as Point[];

    // Curved path is discretized into many segments
    expect(waypoints.length).toBeGreaterThan(2);
  });

  // ---- 3.5 连线跟随元素移动 ----

  it('3.5 updatePathsForElement should update connection when element moves', () => {
    const src = createElement('move-1', 100, 100, 100, 60);
    const tgt = createElement('move-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('move-1', 'move-2', 'Connection');
    const data = getObjData(conn);
    const originalWaypoints = [...(data?.waypoints as Point[])];

    // Move source element far enough that waypoints change
    src.set({ left: 200, top: 300 });
    src.setCoords();

    manager.updatePathsForElement('move-1');

    const updatedWaypoints = (getObjData(conn)?.waypoints) as Point[];
    // Waypoints should have changed
    expect(updatedWaypoints).not.toEqual(originalWaypoints);
  });

  it('3.5 updatePathsForElement should update target-side connections too', () => {
    const src = createElement('tgt-move-1', 100, 100, 100, 60);
    const tgt = createElement('tgt-move-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('tgt-move-1', 'tgt-move-2', 'Connection');
    const originalWaypoints = [...((getObjData(conn)?.waypoints) as Point[])];

    // Move target element far enough that waypoints change
    tgt.set({ left: 400, top: 350 });
    tgt.setCoords();

    manager.updatePathsForElement('tgt-move-2');

    const updatedWaypoints = (getObjData(conn)?.waypoints) as Point[];
    expect(updatedWaypoints).not.toEqual(originalWaypoints);
  });

  it('3.5 updatePathsForElement with no connections should not throw', () => {
    expect(() => manager.updatePathsForElement('no-conn-element')).not.toThrow();
  });
});

// ===========================================================================
// 4. 路径点交互 (Waypoint Interaction)
// ===========================================================================

describe('4. Waypoint Interaction', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  it('4.1 addWaypoint should insert a point into the path', () => {
    const src = createElement('wp-1', 100, 100, 100, 60);
    const tgt = createElement('wp-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('wp-1', 'wp-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;
    const originalLen = ((getObjData(conn)?.waypoints) as Point[]).length;

    // Add waypoint in the middle of segment 0
    manager.addWaypoint(connId, { x: 250, y: 150 }, 0);

    const updatedLen = ((getObjData(conn)?.waypoints) as Point[]).length;
    expect(updatedLen).toBe(originalLen + 1);

    const waypoints = (getObjData(conn)?.waypoints) as Point[];
    expect(waypoints[1]).toEqual({ x: 250, y: 150 });
  });

  it('4.1 addWaypoint with invalid segmentIndex should not change anything', () => {
    const src = createElement('wpi-1', 50, 50, 80, 40);
    const tgt = createElement('wpi-2', 200, 50, 80, 40);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('wpi-1', 'wpi-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;
    const originalLen = ((getObjData(conn)?.waypoints) as Point[]).length;

    // Invalid: -1 should do nothing
    manager.addWaypoint(connId, { x: 150, y: 150 }, -1);
    expect(((getObjData(conn)?.waypoints) as Point[]).length).toBe(originalLen);

    // Invalid: beyond last segment
    manager.addWaypoint(connId, { x: 150, y: 150 }, 99);
    expect(((getObjData(conn)?.waypoints) as Point[]).length).toBe(originalLen);
  });

  it('4.2 moveWaypoint should update the point coordinates', () => {
    const src = createElement('mw-1', 100, 100, 100, 60);
    const tgt = createElement('mw-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('mw-1', 'mw-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    // Add a waypoint first
    manager.addWaypoint(connId, { x: 250, y: 80 }, 0);

    // Move it
    manager.moveWaypoint(connId, 1, { x: 250, y: 200 });

    const waypoints = (getObjData(conn)?.waypoints) as Point[];
    expect(waypoints[1].y).toBe(200);
  });

  it('4.2 moveWaypoint with invalid index should not throw', () => {
    const src = createElement('mwi-1', 50, 50, 80, 40);
    const tgt = createElement('mwi-2', 200, 50, 80, 40);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('mwi-1', 'mwi-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    expect(() =>
      manager.moveWaypoint(connId, -1, { x: 0, y: 0 }),
    ).not.toThrow();
    expect(() =>
      manager.moveWaypoint(connId, 999, { x: 0, y: 0 }),
    ).not.toThrow();
  });

  it('4.3 removeWaypoint should delete a waypoint', () => {
    const src = createElement('rw-1', 100, 100, 100, 60);
    const tgt = createElement('rw-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('rw-1', 'rw-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    // Add waypoints to have something to delete
    manager.addWaypoint(connId, { x: 200, y: 150 }, 0);
    manager.addWaypoint(connId, { x: 300, y: 150 }, 1);
    const countAfterAdd = ((getObjData(conn)?.waypoints) as Point[]).length;
    expect(countAfterAdd).toBeGreaterThanOrEqual(4);

    // Remove middle waypoint
    manager.removeWaypoint(connId, 2);

    const countAfterRemove = ((getObjData(conn)?.waypoints) as Point[]).length;
    expect(countAfterRemove).toBe(countAfterAdd - 1);
  });

  it('4.3 removeWaypoint should not delete endpoints', () => {
    const src = createElement('ep-1', 100, 100, 100, 60);
    const tgt = createElement('ep-2', 400, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('ep-1', 'ep-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;
    const originalLen = ((getObjData(conn)?.waypoints) as Point[]).length;

    // Try to delete first endpoint
    manager.removeWaypoint(connId, 0);
    expect(((getObjData(conn)?.waypoints) as Point[]).length).toBe(originalLen);

    // Try to delete last endpoint
    manager.removeWaypoint(connId, originalLen - 1);
    expect(((getObjData(conn)?.waypoints) as Point[]).length).toBe(originalLen);
  });

  it('4.3 removeWaypoint should not delete if only 2 waypoints', () => {
    const src = createElement('min-1', 100, 100, 100, 60);
    const tgt = createElement('min-2', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('min-1', 'min-2', 'Message');
    const connId = (getObjData(conn)?.id) as string;

    // Message uses straight -> 2 waypoints
    const len = ((getObjData(conn)?.waypoints) as Point[]).length;
    expect(len).toBe(2);

    // Should not allow removal
    manager.removeWaypoint(connId, 1);
    expect(((getObjData(conn)?.waypoints) as Point[]).length).toBe(2);
  });

  it('4.3 remove waypoint then path should be updated (waypoint count correct)', () => {
    const src = createElement('rw2-1', 100, 100, 100, 60);
    const tgt = createElement('rw2-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('rw2-1', 'rw2-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    manager.addWaypoint(connId, { x: 250, y: 80 }, 0);
    const afterAdd = ((getObjData(conn)?.waypoints) as Point[]).length;

    manager.removeWaypoint(connId, 1);
    const afterRemove = ((getObjData(conn)?.waypoints) as Point[]).length;

    expect(afterRemove).toBe(afterAdd - 1);
  });
});

// ===========================================================================
// 5. 查询 (Query)
// ===========================================================================

describe('5. Query', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  it('5.1 getConnectionsForElement should return connections', () => {
    const a = createElement('q-a', 100, 100, 80, 40);
    const b = createElement('q-b', 300, 100, 80, 40);
    const c = createElement('q-c', 100, 300, 80, 40);
    mockCanvas.addObject(a);
    mockCanvas.addObject(b);
    mockCanvas.addObject(c);

    manager.createConnection('q-a', 'q-b', 'Connection');
    manager.createConnection('q-a', 'q-c', 'Binding');

    const connsForA = manager.getConnectionsForElement('q-a');
    expect(connsForA.length).toBe(2);
  });

  it('5.1 getConnectionsForElement for unconnected element should return empty', () => {
    const x = createElement('isolated', 500, 500, 80, 40);
    mockCanvas.addObject(x);

    const conns = manager.getConnectionsForElement('isolated');
    expect(conns.length).toBe(0);
  });

  it('5.2 getConnectionById should return correct connection', () => {
    const src = createElement('qid-1', 100, 100, 80, 40);
    const tgt = createElement('qid-2', 300, 100, 80, 40);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('qid-1', 'qid-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    expect(manager.getConnectionById(connId)).toBe(conn);
  });

  it('5.2 getConnectionById for unknown ID should return null', () => {
    expect(manager.getConnectionById('does-not-exist')).toBeNull();
  });

  it('5.3 Elements connected through ports: getConnectionsForElement should find both', () => {
    const block1 = createElement('block-x', 100, 100, 160, 80);
    const block2 = createElement('block-y', 300, 200, 160, 80);
    mockCanvas.addObject(block1);
    mockCanvas.addObject(block2);

    const conn = manager.createConnection('block-x', 'block-y', 'Connection');

    const forBlock1 = manager.getConnectionsForElement('block-x');
    const forBlock2 = manager.getConnectionsForElement('block-y');

    expect(forBlock1.length).toBe(1);
    expect(forBlock2.length).toBe(1);
    expect(forBlock1[0]).toBe(conn);
    expect(forBlock2[0]).toBe(conn);
  });
});

// ===========================================================================
// 6. 连线标签 (Connection Labels)
// ===========================================================================

describe('6. Connection Labels', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  it('should set a label text on the connection', () => {
    const src = createElement('lbl-1', 100, 100, 100, 60);
    const tgt = createElement('lbl-2', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('lbl-1', 'lbl-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    manager.setConnectionLabel(connId, 'MyLabel');

    const group = conn as Group;
    const textObj = group.getObjects().find((c) => c instanceof Text);
    expect(textObj).toBeDefined();
    expect((textObj as Text).text).toBe('MyLabel');
  });

  it('should remove old label when setting a new one', () => {
    const src = createElement('lbl-3', 100, 100, 100, 60);
    const tgt = createElement('lbl-4', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('lbl-3', 'lbl-4', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    manager.setConnectionLabel(connId, 'OldLabel');
    manager.setConnectionLabel(connId, 'NewLabel');

    const group = conn as Group;
    const textObjs = group.getObjects().filter((c) => c instanceof Text);
    // Should only have one text label
    const labelTexts = textObjs.filter((t) => {
      const d = getObjData(t);
      return d?.role === 'connection-label';
    });
    expect(labelTexts.length).toBe(1);
    expect((labelTexts[0] as Text).text).toBe('NewLabel');
  });

  it('setting empty label should remove the label', () => {
    const src = createElement('lbl-5', 100, 100, 100, 60);
    const tgt = createElement('lbl-6', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('lbl-5', 'lbl-6', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    manager.setConnectionLabel(connId, 'TempLabel');
    manager.setConnectionLabel(connId, '');

    const group = conn as Group;
    const labelObjs = group.getObjects().filter((c) => {
      const d = getObjData(c);
      return d?.role === 'connection-label';
    });
    expect(labelObjs.length).toBe(0);
  });

  it('getConnectionMidpoint should return a point on the path', () => {
    const src = createElement('mid-1', 100, 100, 100, 60);
    const tgt = createElement('mid-2', 400, 200, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('mid-1', 'mid-2', 'Message');
    const connId = (getObjData(conn)?.id) as string;

    const mid = manager.getConnectionMidpoint(connId);
    expect(mid).not.toBeNull();
    expect(typeof mid!.x).toBe('number');
    expect(typeof mid!.y).toBe('number');
  });

  it('getConnectionMidpoint for unknown connection should return null', () => {
    expect(manager.getConnectionMidpoint('no-such-conn')).toBeNull();
  });
});

// ===========================================================================
// 7. Interface Compliance
// ===========================================================================

describe('7. IConnectionManager Interface Compliance', () => {
  it('should expose all required methods', () => {
    const mockCanvas = createMockCanvas();
    const mgr: IConnectionManager = new ConnectionManager(mockCanvas);

    expect(typeof mgr.createConnection).toBe('function');
    expect(typeof mgr.removeConnection).toBe('function');
    expect(typeof mgr.calculatePath).toBe('function');
    expect(typeof mgr.updatePathsForElement).toBe('function');
    expect(typeof mgr.applyRelationshipStyle).toBe('function');
    expect(typeof mgr.getConnectionsForElement).toBe('function');
    expect(typeof mgr.getConnectionById).toBe('function');
  });
});

// ===========================================================================
// 8. 障碍物提供者 (Obstacle Provider)
// ===========================================================================

describe('8. Obstacle Provider', () => {
  it('setObstacleProvider should allow external obstacle list', () => {
    const mockCanvas = createMockCanvas();
    const mgr = new ConnectionManager(mockCanvas);

    const src = createElement('op-1', 100, 100, 100, 60);
    const tgt = createElement('op-2', 400, 100, 100, 60);
    const obstacle = createElement('op-3', 250, 50, 40, 120);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);
    mockCanvas.addObject(obstacle);

    // Set provider that returns obstacle's rect
    mgr.setObstacleProvider(() => {
      const rect = obstacle.getBoundingRect();
      return [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }];
    });

    const conn = mgr.createConnection('op-1', 'op-2', 'Connection');
    const data = getObjData(conn);
    const waypoints = data?.waypoints as Point[];

    // Path should go around the obstacle
    expect(waypoints.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < waypoints.length - 1; i++) {
      expect(waypoints[i].x).toBeGreaterThanOrEqual(0);
      expect(waypoints[i].y).toBeGreaterThanOrEqual(0);
    }
  });
});

// ===========================================================================
// 9. 边界情况 (Edge Cases)
// ===========================================================================

describe('9. Edge Cases', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  it('should handle elements at the same position', () => {
    const src = createElement('same-1', 100, 100, 100, 60);
    const tgt = createElement('same-2', 100, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('same-1', 'same-2', 'Connection');
    expect(conn).toBeDefined();
    expect(conn instanceof Group).toBe(true);
  });

  it('should handle vertically stacked elements', () => {
    const src = createElement('v-1', 200, 50, 100, 60);
    const tgt = createElement('v-2', 200, 300, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('v-1', 'v-2', 'Connection');
    expect(conn).toBeDefined();
    const data = getObjData(conn);
    const waypoints = data?.waypoints as Point[];
    expect(waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle horizontally aligned elements', () => {
    const src = createElement('h-1', 50, 150, 100, 60);
    const tgt = createElement('h-2', 400, 150, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('h-1', 'h-2', 'Connection');
    expect(conn).toBeDefined();
  });

  it('should handle all relationship types without error', () => {
    const allTypes: RelationshipType[] = [
      'Connection', 'Binding', 'ObjectFlow', 'ControlFlow',
      'Transition', 'Message', 'Satisfy', 'Verify',
      'Subclassification', 'Allocation',
      'Subsetting', 'Redefinition', 'Containment', 'Composition',
    ];

    for (const relType of allTypes) {
      const srcId = `ec-${relType}-1`;
      const tgtId = `ec-${relType}-2`;
      const src = createElement(srcId, 50, 50, 100, 60);
      const tgt = createElement(tgtId, 300, 50, 100, 60);

      // Fresh canvas per type
      const canvas = createMockCanvas();
      const mgr = new ConnectionManager(canvas);
      canvas.addObject(src);
      canvas.addObject(tgt);

      const conn = mgr.createConnection(srcId, tgtId, relType);
      expect(conn).toBeDefined();
      expect(conn instanceof Group).toBe(true);

      // Verify polyline exists
      const group = conn as Group;
      expect(group.getObjects().some((c) => c instanceof Polyline)).toBe(true);
    }
  });

  it('should handle multiple connections between same elements', () => {
    const src = createElement('multi-1', 100, 100, 100, 60);
    const tgt = createElement('multi-2', 300, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn1 = manager.createConnection('multi-1', 'multi-2', 'Connection');
    const conn2 = manager.createConnection('multi-1', 'multi-2', 'Binding');

    expect(conn1).not.toBe(conn2);

    const conns = manager.getConnectionsForElement('multi-1');
    expect(conns.length).toBe(2);
  });

  it('calculatePath with same source and target should return a path', () => {
    const path = manager.calculatePath(
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      [],
    );
    expect(path.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// 10. Polyline Points Update Verification
// ===========================================================================

describe('10. Polyline Points Update', () => {
  let mockCanvas: ICanvasEngine;
  let manager: ConnectionManager;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    manager = new ConnectionManager(mockCanvas);
  });

  it('waypoint changes should update the Polyline points array', () => {
    const src = createElement('pup-1', 100, 100, 100, 60);
    const tgt = createElement('pup-2', 400, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('pup-1', 'pup-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    manager.addWaypoint(connId, { x: 250, y: 150 }, 0);

    const group = conn as Group;
    const polyline = group.getObjects().find((c) => c instanceof Polyline) as Polyline;
    const points = polyline.points;

    expect(points).toBeDefined();
    expect(points!.length).toBeGreaterThanOrEqual(3);

    // Middle point should match our inserted waypoint
    const midPoint = points![1];
    expect(midPoint.x).toBe(250);
    expect(midPoint.y).toBe(150);
  });

  it('moveWaypoint should update Polyline points', () => {
    const src = createElement('mwp-1', 100, 100, 100, 60);
    const tgt = createElement('mwp-2', 400, 100, 100, 60);
    mockCanvas.addObject(src);
    mockCanvas.addObject(tgt);

    const conn = manager.createConnection('mwp-1', 'mwp-2', 'Connection');
    const connId = (getObjData(conn)?.id) as string;

    manager.addWaypoint(connId, { x: 250, y: 80 }, 0);
    manager.moveWaypoint(connId, 1, { x: 250, y: 200 });

    const group = conn as Group;
    const polyline = group.getObjects().find((c) => c instanceof Polyline) as Polyline;
    expect(polyline.points![1].y).toBe(200);
  });
});
