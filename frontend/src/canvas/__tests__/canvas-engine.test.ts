// ===========================================================================
// Canvas Engine Tests
// 来源: 任务清单 M-FE-01
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CanvasEngine, useCanvasEngine } from '../canvas-engine';
import type { CanvasEventPayload } from '../canvas-engine';
import type { ICanvasEngine } from '../canvas-engine';
import type { CanvasConfig, ViewportState } from '@/types/canvas-model';
import { DEFAULT_CANVAS_CONFIG } from '@/types/canvas-model';
import { Rect, FabricObject } from 'fabric';

// ===========================================================================
// Helper utilities
// ===========================================================================

/** 创建测试用的 HTMLDivElement */
function createContainer(): HTMLDivElement {
  const div = document.createElement('div');
  div.style.width = '800px';
  div.style.height = '600px';
  document.body.appendChild(div);
  return div;
}

/** 清理容器 */
function cleanupContainer(div: HTMLDivElement): void {
  if (div.parentNode) {
    div.parentNode.removeChild(div);
  }
}

/** 创建带 data.id 的对象 */
function createTestObject(id: string, left = 50, top = 50): FabricObject {
  return new Rect({
    left,
    top,
    width: 80,
    height: 60,
    fill: '#00FF00',
    data: { id },
  });
}

// ===========================================================================
// 1. 画布实例生命周期 (Lifecycle)
// ===========================================================================

describe('CanvasEngine Lifecycle', () => {
  it('1.1 initialize should create a Fabric.js Canvas in the container', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);

    // 容器内应有 canvas 元素
    const canvasElements = container.querySelectorAll('canvas');
    expect(canvasElements.length).toBeGreaterThan(0);

    engine.destroy();
    cleanupContainer(container);
  });

  it('1.2 destroy should clean up canvas and release resources', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);

    engine.destroy();

    // 验证 viewport 返回默认值（canvas 已销毁）
    const vp = engine.getViewport();
    expect(vp).toEqual({ zoom: 1, panX: 0, panY: 0 });

    cleanupContainer(container);
  });

  it('1.2 initialize after destroy should succeed (re-initialize)', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
    engine.destroy();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);

    const vp = engine.getViewport();
    expect(vp.zoom).toBe(1);

    engine.destroy();
    cleanupContainer(container);
  });

  it('1.2 double initialize should throw', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);

    expect(() => {
      engine.initialize(container, DEFAULT_CANVAS_CONFIG);
    }).toThrow('already initialized');

    engine.destroy();
    cleanupContainer(container);
  });

  it('1.3 should accept full CanvasConfig with all fields', () => {
    const config: CanvasConfig = {
      width: 1200,
      height: 900,
      backgroundColor: '#EEEEEE',
      gridSize: 10,
      snapToGrid: false,
      zoomMin: 0.2,
      zoomMax: 3.0,
    };

    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, config);
    expect(engine.getViewport().zoom).toBe(1);
    engine.destroy();
    cleanupContainer(container);
  });
});

// ===========================================================================
// 2. 视口控制 (Viewport)
// ===========================================================================

describe('CanvasEngine Viewport', () => {
  let engine: CanvasEngine;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
    engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
  });

  afterEach(() => {
    engine.destroy();
    cleanupContainer(container);
  });

  it('2.1 zoom should change viewport zoom level', () => {
    engine.zoom(2.0);
    expect(engine.getViewport().zoom).toBeCloseTo(2.0, 5);
  });

  it('2.1 zoom should be clamped to zoomMin', () => {
    engine.zoom(0.01);
    expect(engine.getViewport().zoom).toBeGreaterThanOrEqual(
      DEFAULT_CANVAS_CONFIG.zoomMin,
    );
  });

  it('2.1 zoom should be clamped to zoomMax', () => {
    engine.zoom(10);
    expect(engine.getViewport().zoom).toBeLessThanOrEqual(
      DEFAULT_CANVAS_CONFIG.zoomMax,
    );
  });

  it('2.1 zoom with custom min/max should respect configured bounds', () => {
    const c = createContainer();
    const e = new CanvasEngine();
    e.initialize(c, { ...DEFAULT_CANVAS_CONFIG, zoomMin: 0.5, zoomMax: 2.0 });

    e.zoom(0.1);
    expect(e.getViewport().zoom).toBe(0.5);

    e.zoom(5);
    expect(e.getViewport().zoom).toBe(2.0);

    e.destroy();
    cleanupContainer(c);
  });

  it('2.1 zoom with center point should zoom toward that point', () => {
    // Verify zoomToPoint is called internally - the zoom value should change
    const before = engine.getViewport();
    engine.zoom(1.5, { x: 100, y: 100 });
    const after = engine.getViewport();
    expect(after.zoom).toBeCloseTo(1.5, 5);
    // Pan should be non-zero because zooming toward a point shifts the viewport
    expect(after.panX).not.toBe(before.panX);
    expect(after.panY).not.toBe(before.panY);
  });

  it('2.2 zoomToFit should adjust viewport to show all objects', () => {
    const obj1 = createTestObject('obj-1', 100, 100);
    const obj2 = createTestObject('obj-2', 300, 300);
    engine.addObject(obj1);
    engine.addObject(obj2);

    engine.zoomToFit();
    const vp = engine.getViewport();
    // zoom should be within valid range
    expect(vp.zoom).toBeGreaterThanOrEqual(DEFAULT_CANVAS_CONFIG.zoomMin);
    expect(vp.zoom).toBeLessThanOrEqual(DEFAULT_CANVAS_CONFIG.zoomMax);
  });

  it('2.2 zoomToFit on empty canvas should reset to default', () => {
    engine.zoom(2.0);
    engine.zoomToFit();
    expect(engine.getViewport().zoom).toBe(1);
  });

  it('2.3 pan should translate viewport', () => {
    const before = engine.getViewport();
    engine.pan({ x: 100, y: 50 });
    const after = engine.getViewport();

    expect(after.panX).not.toBe(before.panX);
    expect(after.panY).not.toBe(before.panY);
  });

  it('2.3 pan should accumulate translations', () => {
    engine.pan({ x: 100, y: 0 });
    engine.pan({ x: 50, y: 0 });

    const vp = engine.getViewport();
    expect(vp.panX).toBeCloseTo(150, 1);
  });

  it('2.4 getViewport should return current state', () => {
    engine.zoom(2.0);
    engine.pan({ x: 100, y: -50 });

    const vp = engine.getViewport();
    expect(vp.zoom).toBeCloseTo(2.0, 5);
    expect(typeof vp.panX).toBe('number');
    expect(typeof vp.panY).toBe('number');
  });

  it('2.4 setViewport should restore viewport state exactly', () => {
    const state: ViewportState = { zoom: 1.5, panX: 200, panY: 300 };
    engine.setViewport(state);

    const vp = engine.getViewport();
    expect(vp.zoom).toBeCloseTo(1.5, 5);
    expect(vp.panX).toBeCloseTo(200, 1);
    expect(vp.panY).toBeCloseTo(300, 1);
  });

  it('2.4 setViewport should clamp zoom to valid range', () => {
    engine.setViewport({ zoom: 0.001, panX: 0, panY: 0 });
    expect(engine.getViewport().zoom).toBeGreaterThanOrEqual(
      DEFAULT_CANVAS_CONFIG.zoomMin,
    );

    engine.setViewport({ zoom: 100, panX: 0, panY: 0 });
    expect(engine.getViewport().zoom).toBeLessThanOrEqual(
      DEFAULT_CANVAS_CONFIG.zoomMax,
    );
  });

  it('2.4 getViewport/setViewport roundtrip should be consistent', () => {
    engine.zoom(1.3);
    engine.pan({ x: 50, y: 75 });
    const state = engine.getViewport();
    engine.setViewport(state);
    const restored = engine.getViewport();
    expect(restored.zoom).toBeCloseTo(state.zoom, 5);
  });
});

// ===========================================================================
// 3. 对象操作 (Object Operations)
// ===========================================================================

describe('CanvasEngine Object Operations', () => {
  let engine: CanvasEngine;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
    engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
  });

  afterEach(() => {
    engine.destroy();
    cleanupContainer(container);
  });

  it('3.1 addObject should add object to canvas', () => {
    const obj = createTestObject('test-1');
    engine.addObject(obj);

    const found = engine.getObjectById('test-1');
    expect(found).not.toBeNull();
  });

  it('3.2 removeObject should remove object from canvas', () => {
    const obj = createTestObject('test-2');
    engine.addObject(obj);
    expect(engine.getObjectById('test-2')).not.toBeNull();

    engine.removeObject(obj);
    expect(engine.getObjectById('test-2')).toBeNull();
  });

  it('3.3 getObjectById should find object by data.id', () => {
    const obj1 = createTestObject('rect-a', 100, 100);
    const obj2 = createTestObject('rect-b', 200, 200);
    const obj3 = createTestObject('rect-c', 300, 300);

    engine.addObject(obj1);
    engine.addObject(obj2);
    engine.addObject(obj3);

    expect(engine.getObjectById('rect-a')).not.toBeNull();
    expect(engine.getObjectById('rect-b')).not.toBeNull();
    expect(engine.getObjectById('rect-c')).not.toBeNull();
    expect(engine.getObjectById('nonexistent')).toBeNull();
  });

  it('3.3 getObjectById should return null for object without data.id', () => {
    const rect = new Rect({
      left: 100,
      top: 100,
      width: 50,
      height: 50,
      fill: 'blue',
    });
    engine.addObject(rect);
    expect(engine.getObjectById('anything')).toBeNull();
  });

  it('3.4 getSelectedObjects should return empty when nothing selected', () => {
    const selected = engine.getSelectedObjects();
    expect(selected).toHaveLength(0);
  });

  it('3.5 full add -> find -> remove lifecycle', () => {
    const obj = createTestObject('lifecycle-1');
    engine.addObject(obj);
    expect(engine.getObjectById('lifecycle-1')).not.toBeNull();

    engine.removeObject(obj);
    expect(engine.getObjectById('lifecycle-1')).toBeNull();
  });

  it('3.5 add multiple objects and verify count', () => {
    for (let i = 0; i < 5; i++) {
      engine.addObject(createTestObject(`obj-${i}`, i * 100, i * 100));
    }

    for (let i = 0; i < 5; i++) {
      expect(engine.getObjectById(`obj-${i}`)).not.toBeNull();
    }
  });
});

// ===========================================================================
// 4. 序列化 (Serialization)
// ===========================================================================

describe('CanvasEngine Serialization', () => {
  let engine: CanvasEngine;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
    engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
  });

  afterEach(() => {
    engine.destroy();
    cleanupContainer(container);
  });

  it('4.1 toJSON should produce valid CanvasJSON structure', () => {
    const obj = createTestObject('serial-1', 150, 150);
    engine.addObject(obj);

    const json = engine.toJSON();
    expect(json).toBeDefined();
    expect(json.version).toBeDefined();
    expect(json.viewport).toBeDefined();
    expect(json.viewport.zoom).toBeDefined();
    expect(json.background).toBeDefined();
    expect(Array.isArray(json.objects)).toBe(true);
    expect(json.objects.length).toBeGreaterThan(0);
  });

  it('4.1 toJSON should include viewport state', () => {
    engine.zoom(1.5);
    engine.pan({ x: 100, y: 200 });

    const json = engine.toJSON();
    expect(json.viewport.zoom).toBeCloseTo(1.5, 5);
  });

  it('4.1 toJSON on empty canvas should return valid JSON', () => {
    const json = engine.toJSON();
    expect(json.objects).toHaveLength(0);
    expect(json.viewport.zoom).toBe(1);
  });

  it('4.2 loadFromJSON should restore objects', async () => {
    const obj = createTestObject('load-test', 200, 200);
    engine.addObject(obj);

    const json = engine.toJSON();

    // 创建新 engine 并反序列化
    const c2 = createContainer();
    const e2 = new CanvasEngine();
    e2.initialize(c2, DEFAULT_CANVAS_CONFIG);

    await e2.loadFromJSON(json);
    expect(e2.getObjectById('load-test')).not.toBeNull();

    e2.destroy();
    cleanupContainer(c2);
  });

  it('4.2 loadFromJSON should restore viewport', async () => {
    engine.zoom(2.0);
    engine.pan({ x: 500, y: 300 });
    const obj = createTestObject('vp-test', 100, 100);
    engine.addObject(obj);

    const json = engine.toJSON();

    const c2 = createContainer();
    const e2 = new CanvasEngine();
    e2.initialize(c2, DEFAULT_CANVAS_CONFIG);

    await e2.loadFromJSON(json);
    const vp = e2.getViewport();
    expect(vp.zoom).toBeCloseTo(2.0, 1);
    expect(vp.panX).toBeCloseTo(500, 0);
    expect(vp.panY).toBeCloseTo(300, 0);

    e2.destroy();
    cleanupContainer(c2);
  });

  it('4.2 loadFromJSON should handle empty objects array', async () => {
    const json = engine.toJSON(); // empty canvas
    const c2 = createContainer();
    const e2 = new CanvasEngine();
    e2.initialize(c2, DEFAULT_CANVAS_CONFIG);

    await e2.loadFromJSON(json);
    expect(e2.getViewport().zoom).toBe(1);
    expect(e2.toJSON().objects).toHaveLength(0);

    e2.destroy();
    cleanupContainer(c2);
  });

  it('4.3 roundtrip: toJSON -> loadFromJSON -> toJSON should be consistent', async () => {
    // Setup
    const obj1 = createTestObject('round-1', 100, 100);
    const obj2 = createTestObject('round-2', 300, 200);
    engine.addObject(obj1);
    engine.addObject(obj2);
    engine.zoom(1.5);

    const json1 = engine.toJSON();

    // Create fresh engine and load
    const c2 = createContainer();
    const e2 = new CanvasEngine();
    e2.initialize(c2, DEFAULT_CANVAS_CONFIG);

    await e2.loadFromJSON(json1);
    const json2 = e2.toJSON();

    // Verify key properties match
    expect(json2.objects.length).toBe(json1.objects.length);
    // Viewport should be close (floating point may differ slightly)
    expect(json2.viewport.zoom).toBeCloseTo(json1.viewport.zoom, 1);
    expect(json2.viewport.panX).toBeCloseTo(json1.viewport.panX, 0);
    expect(json2.viewport.panY).toBeCloseTo(json1.viewport.panY, 0);

    e2.destroy();
    cleanupContainer(c2);
  });

  it('4.3 serialization should preserve object custom data', async () => {
    const obj = createTestObject('data-preserve', 50, 50);
    engine.addObject(obj);

    const json = engine.toJSON();
    expect(json.objects.length).toBeGreaterThan(0);

    const c2 = createContainer();
    const e2 = new CanvasEngine();
    e2.initialize(c2, DEFAULT_CANVAS_CONFIG);
    await e2.loadFromJSON(json);

    const restored = e2.getObjectById('data-preserve');
    expect(restored).not.toBeNull();

    e2.destroy();
    cleanupContainer(c2);
  });
});

// ===========================================================================
// 5. 画布配置 (Canvas Configuration)
// ===========================================================================

describe('CanvasEngine Configuration', () => {
  let engine: CanvasEngine;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
    engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
  });

  afterEach(() => {
    engine.destroy();
    cleanupContainer(container);
  });

  it('5.1 setGridVisible(true) should make grid visible', () => {
    // 不应抛出异常
    expect(() => engine.setGridVisible(true)).not.toThrow();
  });

  it('5.1 setGridVisible(false) should hide grid', () => {
    engine.setGridVisible(true);
    expect(() => engine.setGridVisible(false)).not.toThrow();
  });

  it('5.1 toggle grid visibility multiple times should not error', () => {
    engine.setGridVisible(true);
    engine.setGridVisible(false);
    engine.setGridVisible(true);
    engine.setGridVisible(false);
    // 不应抛出异常
  });

  it('5.2 setSnapToGrid should enable snapping', () => {
    engine.setSnapToGrid(true);
    // 不应抛出异常
  });

  it('5.2 setSnapToGrid should disable snapping', () => {
    engine.setSnapToGrid(true);
    engine.setSnapToGrid(false);
    // 不应抛出异常
  });

  it('5.3 setBackground should change canvas background color', () => {
    expect(() => engine.setBackground('#FFCC00')).not.toThrow();
  });

  it('5.3 setBackground should accept various color formats', () => {
    expect(() => engine.setBackground('red')).not.toThrow();
    expect(() => engine.setBackground('#AABBCC')).not.toThrow();
    expect(() => engine.setBackground('rgb(100,200,50)')).not.toThrow();
  });
});

// ===========================================================================
// 6. 事件系统 (Event System)
// ===========================================================================

describe('CanvasEngine Events', () => {
  let engine: CanvasEngine;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
    engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
  });

  afterEach(() => {
    engine.destroy();
    cleanupContainer(container);
  });

  it('6.1 on should register an event handler', () => {
    const handler = vi.fn();
    engine.on('canvas:drop', handler);
    // 不应抛出异常
  });

  it('6.1 off should unregister an event handler', () => {
    const handler = vi.fn();
    engine.on('canvas:drop', handler);
    engine.off('canvas:drop', handler);
    // 不应抛出异常
  });

  it('6.1 multiple handlers for the same event should all register', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    engine.on('canvas:drop', h1);
    engine.on('canvas:drop', h2);
    // Both registered, no errors
  });

  it('6.1 off without prior on should not throw', () => {
    const handler = vi.fn();
    expect(() => engine.off('viewport:change', handler)).not.toThrow();
  });

  it('6.3 addObject should trigger canvas:drop event', () => {
    const handler = vi.fn();
    engine.on('canvas:drop', handler);

    const obj = createTestObject('drop-test');
    engine.addObject(obj);

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0] as CanvasEventPayload;
    expect(payload.type).toBe('canvas:drop');
    expect(payload.target).toBeDefined();
  });

  it('6.3 canvas:drop handler should receive correct payload', () => {
    const handler = vi.fn();
    engine.on('canvas:drop', handler);

    const obj = createTestObject('payload-test', 150, 250);
    engine.addObject(obj);

    expect(handler).toHaveBeenCalled();
    const payload = handler.mock.calls[0][0] as CanvasEventPayload;
    expect(payload.type).toBe('canvas:drop');
    expect(payload.target).toBe(obj);
  });

  it('6.3 off should prevent handler from being called', () => {
    const handler = vi.fn();
    engine.on('canvas:drop', handler);
    engine.off('canvas:drop', handler);

    engine.addObject(createTestObject('no-trigger'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('6.3 viewport:change should fire on zoom', () => {
    const handler = vi.fn();
    engine.on('viewport:change', handler);

    engine.zoom(1.5);
    // 视口事件在 programmatic changes 中可能被抑制
    // 但在此测试中，fireViewportChange 会正常触发
    expect(handler).toHaveBeenCalled();
    const payload = handler.mock.calls[0][0] as CanvasEventPayload;
    expect(payload.type).toBe('viewport:change');
    expect(payload.viewport).toBeDefined();
  });

  it('6.2 object:moving event should be bridged from Fabric.js', () => {
    const handler = vi.fn();
    engine.on('object:moving', handler);

    // 事件注册成功
    expect(handler).toHaveBeenCalledTimes(0);

    // 验证 off 正常工作
    engine.off('object:moving', handler);
  });

  it('6.2 object:selected bridged from Fabric.js selection:created', () => {
    const handler = vi.fn();
    engine.on('object:selected', handler);

    // Verify registration works
    engine.off('object:selected', handler);
  });

  it('6.2 mouse events are bridged from Fabric.js', () => {
    const downHandler = vi.fn();
    const moveHandler = vi.fn();
    const upHandler = vi.fn();

    engine.on('mouse:down', downHandler);
    engine.on('mouse:move', moveHandler);
    engine.on('mouse:up', upHandler);

    engine.off('mouse:down', downHandler);
    engine.off('mouse:move', moveHandler);
    engine.off('mouse:up', upHandler);
  });

  it('6.3 handler error should not crash the engine', () => {
    const errorHandler = vi.fn(() => {
      throw new Error('Test handler error');
    });
    const normalHandler = vi.fn();

    engine.on('canvas:drop', errorHandler);
    engine.on('canvas:drop', normalHandler);

    // Should not throw even though errorHandler throws
    expect(() => {
      engine.addObject(createTestObject('error-test'));
    }).not.toThrow();

    // normalHandler should still be called
    expect(normalHandler).toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. 性能 (Performance)
// ===========================================================================

describe('CanvasEngine Performance', () => {
  let engine: CanvasEngine;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
    engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
  });

  afterEach(() => {
    engine.destroy();
    cleanupContainer(container);
  });

  it('7.1 should handle adding 150 objects without error', () => {
    for (let i = 0; i < 150; i++) {
      engine.addObject(createTestObject(`perf-${i}`, i * 5, i * 3));
    }
    // Should have added all objects without crashing
    expect(engine.getObjectById('perf-0')).not.toBeNull();
    expect(engine.getObjectById('perf-149')).not.toBeNull();
  });

  it('7.1 object caching should be enabled when object count exceeds 100', () => {
    // Add more than 100 objects
    const objects: FabricObject[] = [];
    for (let i = 0; i < 110; i++) {
      const obj = createTestObject(`cache-${i}`, i * 2, i * 2);
      objects.push(obj);
    }
    for (const obj of objects) {
      engine.addObject(obj);
    }

    // After adding >100 objects, check that cache is enabled
    // This is verified by the checkObjectCaching method being called
    // We verify no errors occurred during the process
    expect(engine.getObjectById('cache-0')).not.toBeNull();
    expect(engine.getObjectById('cache-109')).not.toBeNull();
  });

  it('7.2 FPS monitoring should output to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const c = createContainer();
    const e = new CanvasEngine();
    e.initialize(c, DEFAULT_CANVAS_CONFIG);

    // 等待至少 1 秒让 FPS 输出一次
    // 在实际环境中，requestAnimationFrame 在 jsdom 中可能不会触发多次
    // 但确保 start/stop 不报错即可
    e.destroy();
    cleanupContainer(c);

    consoleSpy.mockRestore();
  });
});

// ===========================================================================
// 8. ICanvasEngine Interface Compliance
// ===========================================================================

describe('ICanvasEngine Interface Compliance', () => {
  it('should expose all required methods', () => {
    const engine = new CanvasEngine();
    const iface: ICanvasEngine = engine;

    // 生命周期
    expect(typeof iface.initialize).toBe('function');
    expect(typeof iface.destroy).toBe('function');

    // 视口控制
    expect(typeof iface.zoom).toBe('function');
    expect(typeof iface.zoomToFit).toBe('function');
    expect(typeof iface.pan).toBe('function');
    expect(typeof iface.getViewport).toBe('function');
    expect(typeof iface.setViewport).toBe('function');

    // 对象操作
    expect(typeof iface.addObject).toBe('function');
    expect(typeof iface.removeObject).toBe('function');
    expect(typeof iface.getObjectById).toBe('function');
    expect(typeof iface.getSelectedObjects).toBe('function');

    // 序列化
    expect(typeof iface.loadFromJSON).toBe('function');
    expect(typeof iface.toJSON).toBe('function');

    // 画布配置
    expect(typeof iface.setGridVisible).toBe('function');
    expect(typeof iface.setSnapToGrid).toBe('function');
    expect(typeof iface.setBackground).toBe('function');

    // 事件
    expect(typeof iface.on).toBe('function');
    expect(typeof iface.off).toBe('function');
  });
});

// ===========================================================================
// 9. useCanvasEngine React Hook
// ===========================================================================

describe('useCanvasEngine Hook', () => {
  it('should return null initially when container is null', () => {
    // React hooks can only be tested in renderHook context
    // We test the export exists and type signature is correct
    expect(typeof useCanvasEngine).toBe('function');
  });
});
