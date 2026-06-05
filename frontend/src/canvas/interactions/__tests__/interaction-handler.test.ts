// ===========================================================================
// Interaction Handler Tests
// 来源: 任务清单 M-FE-04
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Rect, FabricObject, Canvas, Point as FabricPoint } from 'fabric';

// ===========================================================================
// Polyfill: DataTransfer (not available in jsdom)
// ===========================================================================

class MockDataTransfer {
  private data: Map<string, string> = new Map();

  setData(format: string, data: string): void {
    this.data.set(format, data);
  }

  getData(format: string): string {
    return this.data.get(format) ?? '';
  }

  clearData(): void {
    this.data.clear();
  }
}

// Install global DataTransfer if not available
if (typeof (globalThis as Record<string, unknown>).DataTransfer === 'undefined') {
  (globalThis as Record<string, unknown>).DataTransfer = MockDataTransfer;
}

// ===========================================================================
// Polyfill: DragEvent (not available in jsdom)
// ===========================================================================

interface DragEventInit extends MouseEventInit {
  dataTransfer?: MockDataTransfer | null;
}

class MockDragEvent extends MouseEvent implements DragEvent {
  readonly dataTransfer: DataTransfer | null;

  constructor(type: string, eventInitDict?: DragEventInit) {
    super(type, eventInitDict);
    this.dataTransfer = (eventInitDict?.dataTransfer as DataTransfer | null) ?? null;
  }
}

// Install global DragEvent if not available
if (typeof (globalThis as Record<string, unknown>).DragEvent === 'undefined') {
  (globalThis as Record<string, unknown>).DragEvent = MockDragEvent;
}
import {
  InteractionHandler,
  type IInteractionHandler,
  type InteractionMode,
  type InteractionIntent,
  type IntentPayload,
} from '../interaction-handler';
import { CanvasEngine } from '../../canvas-engine';
import type { ICanvasEngine } from '../../canvas-engine';
import type { CanvasConfig } from '@/types/canvas-model';
import { DEFAULT_CANVAS_CONFIG } from '@/types/canvas-model';

// ===========================================================================
// Helpers
// ===========================================================================

function createContainer(): HTMLDivElement {
  const div = document.createElement('div');
  div.style.width = '800px';
  div.style.height = '600px';
  document.body.appendChild(div);
  return div;
}

function cleanupContainer(div: HTMLDivElement): void {
  if (div.parentNode) {
    div.parentNode.removeChild(div);
  }
}

interface TestObjectCustomData {
  id: string;
  type: string;
}

function createElementObject(
  id: string,
  left: number,
  top: number,
  width = 100,
  height = 80,
): FabricObject {
  const data: TestObjectCustomData = { id, type: 'element' };
  return new Rect({ left, top, width, height, fill: '#4488FF', data }) as FabricObject;
}

function createPortObject(
  id: string,
  left: number,
  top: number,
): FabricObject {
  const data: TestObjectCustomData = { id, type: 'port' };
  return new Rect({ left, top, width: 12, height: 12, fill: '#FF8844', data }) as FabricObject;
}

function createConnectionObject(
  id: string,
  left: number,
  top: number,
): FabricObject {
  const data: TestObjectCustomData = { id, type: 'connection' };
  return new Rect({ left, top, width: 80, height: 4, fill: '#333333', data }) as FabricObject;
}

/** Access the underlying Fabric.js Canvas for event firing */
function getFabricCanvas(engine: ICanvasEngine): Canvas | null {
  const internals = engine as unknown as { canvas: Canvas | null };
  return internals.canvas ?? null;
}

/** Get the wrapper element for the Fabric.js canvas */
function getCanvasElement(engine: ICanvasEngine): HTMLElement | null {
  const c = getFabricCanvas(engine);
  if (!c) return null;
  const withEl = c as unknown as { lowerCanvasEl?: HTMLElement; getElement?: () => HTMLElement | null };
  return withEl.lowerCanvasEl ?? withEl.getElement?.() ?? null;
}

/** Minimal pointer event info for Fabric.js fire() */
interface MinimalPointerEventInfo {
  e: Event;
  pointer: FabricPoint;
  absolutePointer: FabricPoint;
  scenePoint: FabricPoint;
  viewportPoint: FabricPoint;
  transform: number[];
  target?: FabricObject;
}

/** Type-safe accessor for canvas.fire() with relaxed typing */
interface CanvasFireAccessor {
  fire: (eventName: string, options: Record<string, unknown>) => void;
}

function buildPointerInfo(x: number, y: number): MinimalPointerEventInfo {
  const pt = new FabricPoint(x, y);
  return {
    e: new MouseEvent('mousedown'),
    pointer: pt,
    absolutePointer: pt,
    scenePoint: pt,
    viewportPoint: pt,
    transform: [1, 0, 0, 1, 0, 0],
  };
}

/** Fire a mouse:down event at the given scene coordinates */
function fireMouseDown(engine: ICanvasEngine, x: number, y: number): void {
  const c = getFabricCanvas(engine);
  if (!c) return;
  const info = buildPointerInfo(x, y);
  (c as unknown as CanvasFireAccessor).fire('mouse:down', info as unknown as Record<string, unknown>);
}

/** Fire a mouse:move event at the given scene coordinates */
function fireMouseMove(engine: ICanvasEngine, x: number, y: number): void {
  const c = getFabricCanvas(engine);
  if (!c) return;
  const info = buildPointerInfo(x, y);
  (c as unknown as CanvasFireAccessor).fire('mouse:move', info as unknown as Record<string, unknown>);
}

/** Fire a mouse:up event at the given scene coordinates */
function fireMouseUp(engine: ICanvasEngine, x: number, y: number): void {
  const c = getFabricCanvas(engine);
  if (!c) return;
  const info = buildPointerInfo(x, y);
  (c as unknown as CanvasFireAccessor).fire('mouse:up', info as unknown as Record<string, unknown>);
}

/** Fire an object:modified event */
function fireObjectModified(engine: ICanvasEngine, target: FabricObject): void {
  const c = getFabricCanvas(engine);
  if (!c) return;
  (c as unknown as CanvasFireAccessor).fire('object:modified', { target, transform: { target } });
}

/** Fire an object:moving event */
function fireObjectMoving(engine: ICanvasEngine, target: FabricObject): void {
  const c = getFabricCanvas(engine);
  if (!c) return;
  (c as unknown as CanvasFireAccessor).fire('object:moving', { target });
}

/** Fire an object:selected event */
function fireObjectSelected(engine: ICanvasEngine, selectedObjects: FabricObject[]): void {
  const c = getFabricCanvas(engine);
  if (!c) return;
  (c as unknown as CanvasFireAccessor).fire('selection:created', { selected: selectedObjects });
}

/** Shorthand to register and track a specific intent */
function trackIntent(
  handler: InteractionHandler,
  intent: InteractionIntent,
  calls: Array<{ intent: InteractionIntent; payload: IntentPayload }>,
): void {
  handler.onIntent(intent, (payload: IntentPayload) => {
    calls.push({ intent, payload });
  });
}

// ===========================================================================
// Full setup helper
// ===========================================================================

interface TestContext {
  container: HTMLDivElement;
  engine: CanvasEngine;
  handler: InteractionHandler;
}

function setupTest(config?: Partial<CanvasConfig>): TestContext {
  const container = createContainer();
  const engine = new CanvasEngine();
  const mergedConfig: CanvasConfig = { ...DEFAULT_CANVAS_CONFIG, ...config };
  engine.initialize(container, mergedConfig);

  const handler = new InteractionHandler(engine);
  handler.initialize();

  return { container, engine, handler };
}

function teardownTest(ctx: TestContext): void {
  ctx.handler.destroy();
  ctx.engine.destroy();
  cleanupContainer(ctx.container);
}

// ===========================================================================
// Tests
// ===========================================================================

// ===== 1. 模式管理 =====

describe('InteractionHandler — Mode Management', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('1.1 should start with mode = select', () => {
    expect(ctx.handler.getMode()).toBe('select');
  });

  it('1.2 setMode should change the current mode', () => {
    ctx.handler.setMode('connect');
    expect(ctx.handler.getMode()).toBe('connect');

    ctx.handler.setMode('pan');
    expect(ctx.handler.getMode()).toBe('pan');

    ctx.handler.setMode('create-block');
    expect(ctx.handler.getMode()).toBe('create-block');

    ctx.handler.setMode('create-port');
    expect(ctx.handler.getMode()).toBe('create-port');

    ctx.handler.setMode('delete');
    expect(ctx.handler.getMode()).toBe('delete');

    ctx.handler.setMode('select');
    expect(ctx.handler.getMode()).toBe('select');
  });

  it('1.2 all six modes should be settable', () => {
    const modes: InteractionMode[] = [
      'select', 'pan', 'connect', 'create-block', 'create-port', 'delete',
    ];
    for (const mode of modes) {
      ctx.handler.setMode(mode);
      expect(ctx.handler.getMode()).toBe(mode);
    }
  });

  it('1.3 setMode to same mode should be a no-op', () => {
    ctx.handler.setMode('connect');
    expect(ctx.handler.getMode()).toBe('connect');
    ctx.handler.setMode('connect');
    expect(ctx.handler.getMode()).toBe('connect');
  });

  it('1.4 setMode should update cursor style on the canvas element', () => {
    const el = getCanvasElement(ctx.engine);
    expect(el).not.toBeNull();

    ctx.handler.setMode('connect');
    expect(el!.style.cursor).toBe('crosshair');

    ctx.handler.setMode('pan');
    expect(el!.style.cursor).toBe('grab');

    ctx.handler.setMode('select');
    expect(el!.style.cursor).toBe('default');

    ctx.handler.setMode('create-block');
    expect(el!.style.cursor).toBe('crosshair');

    ctx.handler.setMode('delete');
    expect(el!.style.cursor).toBe('pointer');
  });

  it('1.4 mode switch should reset intermediate state', () => {
    // Simulate partial drag state
    const elem = createElementObject('elem-1', 50, 50);
    ctx.engine.addObject(elem);

    // Select mode: click on element to begin potential drag
    fireMouseDown(ctx.engine, 100, 90);
    fireMouseMove(ctx.engine, 120, 110);

    // Switch mode — intermediate state should be cleared
    ctx.handler.setMode('pan');

    // Switch back — should be in clean state
    ctx.handler.setMode('select');

    // Click on empty canvas should not dispatch drag-end
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:drag-end', calls);

    fireMouseDown(ctx.engine, 400, 300);
    fireMouseUp(ctx.engine, 400, 300);
    expect(calls).toHaveLength(0);
  });
});

// ===== 2. 鼠标事件 → Intent (select 模式) =====

describe('InteractionHandler — Select Mode Mouse Events', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('2.1 clicking on an element should dispatch element:click', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:click', calls);

    const elem = createElementObject('block-1', 100, 100);
    ctx.engine.addObject(elem);

    fireMouseDown(ctx.engine, 150, 140);
    fireMouseUp(ctx.engine, 150, 140);

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('element:click');
    expect(calls[0].payload.elementId).toBe('block-1');
  });

  it('2.1 clicking on empty canvas should dispatch canvas:click', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:click', calls);

    fireMouseDown(ctx.engine, 400, 300);
    fireMouseUp(ctx.engine, 400, 300);

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('canvas:click');
    expect(calls[0].payload.scenePoint).toBeDefined();
  });

  it('2.1 clicking on empty canvas should also dispatch selection:clear', () => {
    const clearCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'selection:clear', clearCalls);

    fireMouseDown(ctx.engine, 400, 300);
    fireMouseUp(ctx.engine, 400, 300);

    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0].intent).toBe('selection:clear');
  });

  it('2.1 double-clicking an element should dispatch element:dblclick', () => {
    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const dblClickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:click', clickCalls);
    trackIntent(ctx.handler, 'element:dblclick', dblClickCalls);

    const elem = createElementObject('block-2', 100, 100);
    ctx.engine.addObject(elem);

    // First click
    fireMouseDown(ctx.engine, 150, 140);
    fireMouseUp(ctx.engine, 150, 140);

    // Second click within double-click threshold
    fireMouseDown(ctx.engine, 150, 140);
    fireMouseUp(ctx.engine, 150, 140);

    // First click fires element:click, second fires element:dblclick only
    expect(clickCalls).toHaveLength(1);
    expect(dblClickCalls).toHaveLength(1);
    expect(dblClickCalls[0].payload.elementId).toBe('block-2');
  });

  it('2.1 double-clicking empty canvas should dispatch canvas:dblclick', () => {
    const dblClickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:dblclick', dblClickCalls);

    fireMouseDown(ctx.engine, 400, 300);
    fireMouseUp(ctx.engine, 400, 300);
    fireMouseDown(ctx.engine, 400, 300);
    fireMouseUp(ctx.engine, 400, 300);

    expect(dblClickCalls).toHaveLength(1);
    expect(dblClickCalls[0].intent).toBe('canvas:dblclick');
  });

  it('2.2 dragging an element should dispatch drag-start → drag-move → drag-end', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const moveCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const endCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:drag-start', startCalls);
    trackIntent(ctx.handler, 'element:drag-move', moveCalls);
    trackIntent(ctx.handler, 'element:drag-end', endCalls);

    const elem = createElementObject('drag-1', 100, 100);
    ctx.engine.addObject(elem);

    // mouse:down on element
    fireMouseDown(ctx.engine, 150, 140);
    // Small move (starts drag)
    fireMouseMove(ctx.engine, 155, 145);
    // Continue drag
    fireMouseMove(ctx.engine, 170, 160);
    // mouse:up ends drag
    fireMouseUp(ctx.engine, 200, 200);

    expect(startCalls).toHaveLength(1);
    expect(startCalls[0].payload.elementIds).toContain('drag-1');

    expect(moveCalls.length).toBeGreaterThanOrEqual(1);
    expect(moveCalls[0].payload.elementIds).toContain('drag-1');

    expect(endCalls).toHaveLength(1);
    expect(endCalls[0].payload.elementIds).toContain('drag-1');
    expect(endCalls[0].payload.dragDelta).toBeDefined();
  });

  it('2.2 drag-start should only fire after exceeding drag threshold', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:drag-start', startCalls);

    const elem = createElementObject('drag-thresh', 100, 100);
    ctx.engine.addObject(elem);

    // mouse:down on element
    fireMouseDown(ctx.engine, 150, 140);
    // Very small move (below threshold)
    fireMouseMove(ctx.engine, 151, 141);
    // mouse:up before threshold
    fireMouseUp(ctx.engine, 151, 141);

    expect(startCalls).toHaveLength(0);

    // Now exceed threshold
    fireMouseDown(ctx.engine, 150, 140);
    fireMouseMove(ctx.engine, 155, 145);
    expect(startCalls).toHaveLength(1);
    fireMouseUp(ctx.engine, 155, 145);
  });

  it('2.3 shift+drag on empty canvas should dispatch selection:box', () => {
    const boxCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'selection:box', boxCalls);

    // Simulate shift key down
    const shiftEvent = new KeyboardEvent('keydown', { key: 'Shift' });
    window.dispatchEvent(shiftEvent);

    // Click and drag on empty canvas
    fireMouseDown(ctx.engine, 200, 200);
    fireMouseMove(ctx.engine, 205, 205);
    fireMouseMove(ctx.engine, 300, 300);
    fireMouseUp(ctx.engine, 400, 400);

    expect(boxCalls.length).toBeGreaterThanOrEqual(1);

    // Clean up shift state
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
  });

  it('2.3 object:selected with shift should dispatch selection:box', () => {
    const boxCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'selection:box', boxCalls);

    // Simulate shift key down
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));

    const elem1 = createElementObject('box-elem-1', 50, 50);
    const elem2 = createElementObject('box-elem-2', 200, 50);
    ctx.engine.addObject(elem1);
    ctx.engine.addObject(elem2);

    // Fire selection with multiple objects
    fireObjectSelected(ctx.engine, [elem1, elem2]);

    expect(boxCalls.length).toBeGreaterThanOrEqual(1);

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
  });

  it('2.4 clicking on a connection should dispatch connection:click', () => {
    const connCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'connection:click', connCalls);

    const conn = createConnectionObject('conn-1', 100, 100);
    ctx.engine.addObject(conn);

    fireMouseDown(ctx.engine, 140, 102);
    fireMouseUp(ctx.engine, 140, 102);

    expect(connCalls).toHaveLength(1);
    expect(connCalls[0].payload.connectionId).toBe('conn-1');
  });

  it('2.6 clicking on a port in select mode should dispatch element:click', () => {
    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:click', clickCalls);

    const port = createPortObject('port-1', 200, 200);
    ctx.engine.addObject(port);

    fireMouseDown(ctx.engine, 206, 206);
    fireMouseUp(ctx.engine, 206, 206);

    expect(clickCalls).toHaveLength(1);
    expect(clickCalls[0].payload.elementId).toBe('port-1');
  });

  it('2.7 element:resize should dispatch when object dimensions change on modified', () => {
    const resizeCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:resize', resizeCalls);

    const elem = createElementObject('resize-1', 100, 100);
    // Set initial dimensions for pre-modify tracking
    (elem as unknown as { width: number; height: number }).width = 100;
    (elem as unknown as { width: number; height: number }).height = 80;
    ctx.engine.addObject(elem);

    // Simulate modifying: record pre-dimensions
    fireObjectMoving(ctx.engine, elem);

    // Change dimensions
    (elem as unknown as { width: number; height: number }).width = 150;
    (elem as unknown as { width: number; height: number }).height = 120;

    // Simulate modified
    fireObjectModified(ctx.engine, elem);

    expect(resizeCalls).toHaveLength(1);
    expect(resizeCalls[0].payload.elementId).toBe('resize-1');
  });

  it('2.7 element:modified without size change should not dispatch element:resize', () => {
    const resizeCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:resize', resizeCalls);

    const elem = createElementObject('no-resize-1', 100, 100);
    (elem as unknown as { width: number; height: number }).width = 100;
    (elem as unknown as { width: number; height: number }).height = 80;
    ctx.engine.addObject(elem);

    fireObjectMoving(ctx.engine, elem);
    // Same dimensions
    fireObjectModified(ctx.engine, elem);

    expect(resizeCalls).toHaveLength(0);
  });
});

// ===== 3. 鼠标事件 → Intent (connect 模式) =====

describe('InteractionHandler — Connect Mode Mouse Events', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
    ctx.handler.setMode('connect');
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('2.4 clicking a port should dispatch port:connect-start', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'port:connect-start', startCalls);

    const port = createPortObject('src-port', 100, 100);
    ctx.engine.addObject(port);

    fireMouseDown(ctx.engine, 106, 106);

    expect(startCalls).toHaveLength(1);
    expect(startCalls[0].payload.portId).toBe('src-port');
  });

  it('2.4 clicking a second port should dispatch port:connect-end', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const endCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'port:connect-start', startCalls);
    trackIntent(ctx.handler, 'port:connect-end', endCalls);

    const port1 = createPortObject('port-a', 100, 100);
    const port2 = createPortObject('port-b', 300, 100);
    ctx.engine.addObject(port1);
    ctx.engine.addObject(port2);

    // Click first port
    fireMouseDown(ctx.engine, 106, 106);
    expect(startCalls).toHaveLength(1);

    // Click second port
    fireMouseDown(ctx.engine, 306, 106);
    expect(endCalls).toHaveLength(1);
    expect(endCalls[0].payload.portId).toBe('port-b');
  });

  it('2.4 clicking the same port twice should not dispatch port:connect-end', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const endCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'port:connect-start', startCalls);
    trackIntent(ctx.handler, 'port:connect-end', endCalls);

    const port = createPortObject('same-port', 100, 100);
    ctx.engine.addObject(port);

    fireMouseDown(ctx.engine, 106, 106);
    expect(startCalls).toHaveLength(1);

    // Click same port again
    fireMouseDown(ctx.engine, 106, 106);
    // Should NOT fire connect-end because sourceId === targetId
    expect(endCalls).toHaveLength(0);
  });

  it('2.4 clicking an element in connect mode should work as port start/end', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const endCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'port:connect-start', startCalls);
    trackIntent(ctx.handler, 'port:connect-end', endCalls);

    const elem1 = createElementObject('conn-elem-1', 100, 100);
    const elem2 = createElementObject('conn-elem-2', 300, 100);
    ctx.engine.addObject(elem1);
    ctx.engine.addObject(elem2);

    fireMouseDown(ctx.engine, 150, 140);
    expect(startCalls).toHaveLength(1);
    expect(startCalls[0].payload.portId).toBe('conn-elem-1');

    fireMouseDown(ctx.engine, 350, 140);
    expect(endCalls).toHaveLength(1);
    expect(endCalls[0].payload.portId).toBe('conn-elem-2');
  });

  it('2.4 clicking empty canvas in connect mode should not dispatch anything', () => {
    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const endCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'port:connect-start', startCalls);
    trackIntent(ctx.handler, 'port:connect-end', endCalls);
    trackIntent(ctx.handler, 'canvas:click', clickCalls);

    fireMouseDown(ctx.engine, 400, 300);

    expect(startCalls).toHaveLength(0);
    expect(endCalls).toHaveLength(0);
    expect(clickCalls).toHaveLength(0);
  });
});

// ===== 4. 鼠标事件 → Intent (pan 模式) =====

describe('InteractionHandler — Pan Mode', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
    ctx.handler.setMode('pan');
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('2.5 pan mode drag should call engine.pan() (no intent dispatched)', () => {
    const panSpy = vi.spyOn(ctx.engine, 'pan');

    fireMouseDown(ctx.engine, 100, 100);
    fireMouseMove(ctx.engine, 150, 120);
    fireMouseMove(ctx.engine, 200, 140);
    fireMouseUp(ctx.engine, 200, 140);

    expect(panSpy).toHaveBeenCalled();
    panSpy.mockRestore();
  });

  it('2.5 pan mode mouse down without drag should not pan', () => {
    const panSpy = vi.spyOn(ctx.engine, 'pan');

    fireMouseDown(ctx.engine, 100, 100);
    fireMouseUp(ctx.engine, 100, 100);

    expect(panSpy).not.toHaveBeenCalled();
    panSpy.mockRestore();
  });
});

// ===== 5. 鼠标事件 → Intent (create-block / create-port / delete 模式) =====

describe('InteractionHandler — Create-Block, Create-Port, Delete Modes', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('2.6 create-block mode: clicking canvas should dispatch canvas:click', () => {
    ctx.handler.setMode('create-block');

    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:click', clickCalls);

    fireMouseDown(ctx.engine, 300, 200);

    expect(clickCalls).toHaveLength(1);
    expect(clickCalls[0].payload.scenePoint).toBeDefined();
    expect(clickCalls[0].payload.viewportPoint).toBeDefined();
  });

  it('2.6 create-block mode: clicking on element should still dispatch canvas:click', () => {
    ctx.handler.setMode('create-block');

    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:click', clickCalls);

    const elem = createElementObject('block-under', 100, 100);
    ctx.engine.addObject(elem);

    fireMouseDown(ctx.engine, 150, 140);

    expect(clickCalls).toHaveLength(1);
  });

  it('2.6 create-port mode: clicking element should dispatch element:click', () => {
    ctx.handler.setMode('create-port');

    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:click', clickCalls);

    const elem = createElementObject('target-elem', 100, 100);
    ctx.engine.addObject(elem);

    fireMouseDown(ctx.engine, 150, 140);

    expect(clickCalls).toHaveLength(1);
    expect(clickCalls[0].payload.elementId).toBe('target-elem');
  });

  it('2.6 create-port mode: clicking empty canvas should NOT dispatch element:click', () => {
    ctx.handler.setMode('create-port');

    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:click', clickCalls);

    fireMouseDown(ctx.engine, 400, 300);

    expect(clickCalls).toHaveLength(0);
  });

  it('2.6 delete mode: clicking element should dispatch element:delete', () => {
    ctx.handler.setMode('delete');

    const deleteCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:delete', deleteCalls);

    const elem = createElementObject('to-delete', 100, 100);
    ctx.engine.addObject(elem);

    fireMouseDown(ctx.engine, 150, 140);

    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].payload.elementId).toBe('to-delete');
  });

  it('2.6 delete mode: clicking empty canvas should NOT dispatch element:delete', () => {
    ctx.handler.setMode('delete');

    const deleteCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:delete', deleteCalls);

    fireMouseDown(ctx.engine, 400, 300);

    expect(deleteCalls).toHaveLength(0);
  });

  it('2.6 delete mode: clicking port or connection should not dispatch element:delete', () => {
    ctx.handler.setMode('delete');

    const deleteCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:delete', deleteCalls);

    const port = createPortObject('del-port', 100, 100);
    const conn = createConnectionObject('del-conn', 200, 100);
    ctx.engine.addObject(port);
    ctx.engine.addObject(conn);

    fireMouseDown(ctx.engine, 106, 106); // port
    fireMouseDown(ctx.engine, 240, 102); // connection

    expect(deleteCalls).toHaveLength(0);
  });
});

// ===== 6. 键盘事件 → Intent =====

describe('InteractionHandler — Keyboard Events', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  function sendKeyDown(key: string, opts: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}): void {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      ctrlKey: opts.ctrlKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      metaKey: opts.metaKey ?? false,
      bubbles: true,
    }));
  }

  function sendKeyUp(key: string): void {
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }

  it('3.1 Ctrl+Z should dispatch keyboard:undo', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:undo', calls);

    sendKeyDown('z', { ctrlKey: true });
    sendKeyUp('z');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:undo');
  });

  it('3.2 Ctrl+Y should dispatch keyboard:redo', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:redo', calls);

    sendKeyDown('y', { ctrlKey: true });
    sendKeyUp('y');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:redo');
  });

  it('3.2 Ctrl+Shift+Z should dispatch keyboard:redo', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:redo', calls);

    sendKeyDown('z', { ctrlKey: true, shiftKey: true });
    sendKeyUp('z');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:redo');
  });

  it('3.3 Delete key should dispatch keyboard:delete', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:delete', calls);

    sendKeyDown('Delete');
    sendKeyUp('Delete');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:delete');
  });

  it('3.3 Backspace key should dispatch keyboard:delete', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:delete', calls);

    sendKeyDown('Backspace');
    sendKeyUp('Backspace');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:delete');
  });

  it('3.4 Ctrl+C should dispatch keyboard:copy', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:copy', calls);

    sendKeyDown('c', { ctrlKey: true });
    sendKeyUp('c');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:copy');
  });

  it('3.4 Ctrl+V should dispatch keyboard:paste', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:paste', calls);

    sendKeyDown('v', { ctrlKey: true });
    sendKeyUp('v');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:paste');
  });

  it('3.5 Ctrl+A should dispatch keyboard:select-all', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:select-all', calls);

    sendKeyDown('a', { ctrlKey: true });
    sendKeyUp('a');

    expect(calls).toHaveLength(1);
    expect(calls[0].intent).toBe('keyboard:select-all');
  });

  it('3.6 Space key should temporarily switch to pan mode', () => {
    expect(ctx.handler.getMode()).toBe('select');

    sendKeyDown(' ');

    expect(ctx.handler.getMode()).toBe('pan');

    sendKeyUp(' ');

    expect(ctx.handler.getMode()).toBe('select');
  });

  it('3.6 Space key should restore previous mode (not default)', () => {
    ctx.handler.setMode('connect');
    expect(ctx.handler.getMode()).toBe('connect');

    sendKeyDown(' ');
    expect(ctx.handler.getMode()).toBe('pan');

    sendKeyUp(' ');
    expect(ctx.handler.getMode()).toBe('connect');
  });

  it('3.6 Space key twice should not toggle', () => {
    ctx.handler.setMode('connect');

    sendKeyDown(' ');
    expect(ctx.handler.getMode()).toBe('pan');

    // Second space keydown while already in pan mode (should not change state)
    sendKeyDown(' ');
    expect(ctx.handler.getMode()).toBe('pan');

    sendKeyUp(' ');
    expect(ctx.handler.getMode()).toBe('connect');
  });

  it('3.7 Escape should dispatch selection:clear', () => {
    const clearCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'selection:clear', clearCalls);

    sendKeyDown('Escape');
    sendKeyUp('Escape');

    expect(clearCalls).toHaveLength(1);
  });

  it('3.7 Escape should reset connect state', () => {
    ctx.handler.setMode('connect');

    const startCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    const endCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'port:connect-start', startCalls);
    trackIntent(ctx.handler, 'port:connect-end', endCalls);

    const port1 = createPortObject('esc-port-1', 100, 100);
    const port2 = createPortObject('esc-port-2', 300, 100);
    ctx.engine.addObject(port1);
    ctx.engine.addObject(port2);

    // Start connection
    fireMouseDown(ctx.engine, 106, 106);
    expect(startCalls).toHaveLength(1);

    // Press Escape
    sendKeyDown('Escape');

    // Now click second port — should start new connection, not end old one
    startCalls.length = 0;
    fireMouseDown(ctx.engine, 306, 106);
    expect(startCalls).toHaveLength(1);
    expect(endCalls).toHaveLength(0);
  });

  it('3.8 All keyboard intents should include nativeEvent in payload', () => {
    const calls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'keyboard:undo', calls);

    sendKeyDown('z', { ctrlKey: true });
    sendKeyUp('z');

    expect(calls).toHaveLength(1);
    expect(calls[0].payload.nativeEvent).toBeInstanceOf(KeyboardEvent);
  });
});

// ===== 7. 拖放事件（从 Toolbox）=====

describe('InteractionHandler — Drop Events', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('4.1/4.2 drop event should dispatch drop:from-toolbox with elementType', () => {
    const dropCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'drop:from-toolbox', dropCalls);

    const canvasEl = getCanvasElement(ctx.engine);
    expect(canvasEl).not.toBeNull();

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/sysml2-element-type', 'PartDefinition');

    const dropEvent = new DragEvent('drop', {
      dataTransfer,
      clientX: 200,
      clientY: 150,
      bubbles: true,
      cancelable: true,
    });

    canvasEl!.dispatchEvent(dropEvent);

    expect(dropCalls).toHaveLength(1);
    expect(dropCalls[0].intent).toBe('drop:from-toolbox');
    expect(dropCalls[0].payload.elementType).toBe('PartDefinition');
    expect(dropCalls[0].payload.dropPosition).toBeDefined();
    expect(dropCalls[0].payload.nativeEvent).toBeDefined();
  });

  it('4.2 fallback to text/plain when application type is not set', () => {
    const dropCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'drop:from-toolbox', dropCalls);

    const canvasEl = getCanvasElement(ctx.engine);
    expect(canvasEl).not.toBeNull();

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', 'BlockItem');

    const dropEvent = new DragEvent('drop', {
      dataTransfer,
      clientX: 300,
      clientY: 250,
      bubbles: true,
      cancelable: true,
    });

    canvasEl!.dispatchEvent(dropEvent);

    expect(dropCalls).toHaveLength(1);
    expect(dropCalls[0].payload.elementType).toBe('BlockItem');
  });

  it('4.2 drop without elementType should not dispatch', () => {
    const dropCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'drop:from-toolbox', dropCalls);

    const canvasEl = getCanvasElement(ctx.engine);
    expect(canvasEl).not.toBeNull();

    const dataTransfer = new DataTransfer();
    // No elementType data set

    const dropEvent = new DragEvent('drop', {
      dataTransfer,
      clientX: 200,
      clientY: 150,
      bubbles: true,
      cancelable: true,
    });

    canvasEl!.dispatchEvent(dropEvent);

    expect(dropCalls).toHaveLength(0);
  });

  it('4.3 drop position coordinates should be relative to canvas element', () => {
    const dropCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'drop:from-toolbox', dropCalls);

    const canvasEl = getCanvasElement(ctx.engine);
    expect(canvasEl).not.toBeNull();

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/sysml2-element-type', 'Constraint');

    const dropEvent = new DragEvent('drop', {
      dataTransfer,
      clientX: 350,
      clientY: 280,
      bubbles: true,
      cancelable: true,
    });

    canvasEl!.dispatchEvent(dropEvent);

    expect(dropCalls).toHaveLength(1);
    const pos = dropCalls[0].payload.dropPosition;
    expect(pos).toBeDefined();
    expect(typeof pos!.x).toBe('number');
    expect(typeof pos!.y).toBe('number');
  });
});

// ===== 8. Intent 回调机制 =====

describe('InteractionHandler — Intent Callback System', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('5.1 onIntent should register a callback', () => {
    const callback = vi.fn();
    ctx.handler.onIntent('element:click', callback as (p: IntentPayload) => void);

    const elem = createElementObject('cb-1', 100, 100);
    ctx.engine.addObject(elem);
    fireMouseDown(ctx.engine, 150, 140);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('5.1 offIntent should unregister a callback', () => {
    const callback = vi.fn();
    ctx.handler.onIntent('element:click', callback as (p: IntentPayload) => void);
    ctx.handler.offIntent('element:click', callback as (p: IntentPayload) => void);

    const elem = createElementObject('cb-2', 100, 100);
    ctx.engine.addObject(elem);
    fireMouseDown(ctx.engine, 150, 140);

    expect(callback).not.toHaveBeenCalled();
  });

  it('5.1 offIntent without prior on should not throw', () => {
    const callback = vi.fn();
    expect(() => {
      ctx.handler.offIntent('element:click', callback as (p: IntentPayload) => void);
    }).not.toThrow();
  });

  it('5.2 multiple callbacks for same intent should all be called', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    ctx.handler.onIntent('element:click', cb1 as (p: IntentPayload) => void);
    ctx.handler.onIntent('element:click', cb2 as (p: IntentPayload) => void);
    ctx.handler.onIntent('element:click', cb3 as (p: IntentPayload) => void);

    const elem = createElementObject('cb-multi', 100, 100);
    ctx.engine.addObject(elem);
    fireMouseDown(ctx.engine, 150, 140);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  it('5.2 callbacks receive correct payload data', () => {
    const receivedPayloads: IntentPayload[] = [];
    ctx.handler.onIntent('element:click', (p: IntentPayload) => {
      receivedPayloads.push(p);
    });

    const elem = createElementObject('cb-payload', 100, 100);
    ctx.engine.addObject(elem);
    fireMouseDown(ctx.engine, 150, 140);

    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0].elementId).toBe('cb-payload');
    expect(receivedPayloads[0].scenePoint).toBeDefined();
    expect(receivedPayloads[0].scenePoint!.x).toBe(150);
    expect(receivedPayloads[0].scenePoint!.y).toBe(140);
  });

  it('5.3 callback error should not prevent other callbacks', () => {
    const errorCb = vi.fn(() => {
      throw new Error('Test error');
    });
    const normalCb = vi.fn();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ctx.handler.onIntent('element:click', errorCb as (p: IntentPayload) => void);
    ctx.handler.onIntent('element:click', normalCb as (p: IntentPayload) => void);

    const elem = createElementObject('cb-error', 100, 100);
    ctx.engine.addObject(elem);

    expect(() => {
      fireMouseDown(ctx.engine, 150, 140);
    }).not.toThrow();

    expect(normalCb).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('5.3 unregistering one callback should not affect others', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    ctx.handler.onIntent('element:click', cb1 as (p: IntentPayload) => void);
    ctx.handler.onIntent('element:click', cb2 as (p: IntentPayload) => void);

    // Unregister cb1
    ctx.handler.offIntent('element:click', cb1 as (p: IntentPayload) => void);

    const elem = createElementObject('cb-remove-1', 100, 100);
    ctx.engine.addObject(elem);
    fireMouseDown(ctx.engine, 150, 140);

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

// ===== 9. Context Menu =====

describe('InteractionHandler — Context Menu', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('right-clicking on canvas should dispatch canvas:contextmenu', () => {
    const ctxMenuCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:contextmenu', ctxMenuCalls);

    const canvasEl = getCanvasElement(ctx.engine);
    expect(canvasEl).not.toBeNull();

    const event = new MouseEvent('contextmenu', {
      clientX: 200,
      clientY: 150,
      bubbles: true,
      cancelable: true,
    });

    canvasEl!.dispatchEvent(event);

    expect(ctxMenuCalls).toHaveLength(1);
    expect(ctxMenuCalls[0].intent).toBe('canvas:contextmenu');
    expect(ctxMenuCalls[0].payload.scenePoint).toBeDefined();
  });

  it('right-clicking near element should include elementId in contextmenu', () => {
    const ctxMenuCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:contextmenu', ctxMenuCalls);

    const elem = createElementObject('ctx-elem', 100, 100);
    ctx.engine.addObject(elem);

    const canvasEl = getCanvasElement(ctx.engine);
    expect(canvasEl).not.toBeNull();

    // Get actual canvas position
    const rect = canvasEl!.getBoundingClientRect();
    const event = new MouseEvent('contextmenu', {
      clientX: rect.left + 150, // x=150 relative to canvas
      clientY: rect.top + 140,  // y=140 relative to canvas
      bubbles: true,
      cancelable: true,
    });

    canvasEl!.dispatchEvent(event);

    expect(ctxMenuCalls).toHaveLength(1);
  });
});

// ===== 10. 生命周期 =====

describe('InteractionHandler — Lifecycle', () => {
  it('should initialize without errors', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
    const handler = new InteractionHandler(engine);

    expect(() => handler.initialize()).not.toThrow();

    handler.destroy();
    engine.destroy();
    cleanupContainer(container);
  });

  it('should destroy cleanly and remove all listeners', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
    const handler = new InteractionHandler(engine);
    handler.initialize();

    expect(() => handler.destroy()).not.toThrow();

    // Verify events no longer fire after destroy
    expect(() => fireMouseDown(engine, 400, 300)).not.toThrow();

    engine.destroy();
    cleanupContainer(container);
  });

  it('should support IInteractionHandler interface', () => {
    const container = createContainer();
    const engine = new CanvasEngine();
    engine.initialize(container, DEFAULT_CANVAS_CONFIG);
    const handler: IInteractionHandler = new InteractionHandler(engine);

    expect(typeof handler.initialize).toBe('function');
    expect(typeof handler.destroy).toBe('function');
    expect(typeof handler.setMode).toBe('function');
    expect(typeof handler.getMode).toBe('function');
    expect(typeof handler.onIntent).toBe('function');
    expect(typeof handler.offIntent).toBe('function');

    handler.destroy();
    engine.destroy();
    cleanupContainer(container);
  });
});

// ===== 11. Find Target =====

describe('InteractionHandler — Find Target', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTest();
  });

  afterEach(() => {
    teardownTest(ctx);
  });

  it('should find top-most object when objects overlap', () => {
    const clickCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'element:click', clickCalls);

    // Lower element
    const lower = createElementObject('lower', 100, 100);
    ctx.engine.addObject(lower);
    // Upper element overlapping
    const upper = createElementObject('upper', 120, 110);
    ctx.engine.addObject(upper);

    // Click at a point inside both → should find top-most (upper)
    fireMouseDown(ctx.engine, 160, 150);

    expect(clickCalls).toHaveLength(1);
    expect(clickCalls[0].payload.elementId).toBe('upper');
  });

  it('clicking outside all objects should dispatch canvas:click', () => {
    const canvasCalls: Array<{ intent: InteractionIntent; payload: IntentPayload }> = [];
    trackIntent(ctx.handler, 'canvas:click', canvasCalls);

    const elem = createElementObject('far-away', 500, 500);
    ctx.engine.addObject(elem);

    // Click nowhere near the object
    fireMouseDown(ctx.engine, 50, 50);

    expect(canvasCalls).toHaveLength(1);
  });
});
