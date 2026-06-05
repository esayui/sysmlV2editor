// ===========================================================================
// Canvas Engine — Fabric.js Canvas 管理器
// 来源: 详细设计 §3.1
// ===========================================================================

import { Canvas, FabricObject, Point as FabricPoint, Group, Line } from 'fabric';
import type { XY } from 'fabric';
import type { CanvasConfig, Point, ViewportState } from '@/types/canvas-model';
import { DEFAULT_CANVAS_CONFIG } from '@/types/canvas-model';
import { useRef, useEffect, useState, type RefObject } from 'react';

// ===========================================================================
// 类型定义
// ===========================================================================

/** 画布事件类型 */
export type CanvasEvent =
  | 'object:selected'
  | 'object:deselected'
  | 'object:moving'
  | 'object:modified'
  | 'mouse:down'
  | 'mouse:move'
  | 'mouse:up'
  | 'canvas:drop'
  | 'viewport:change';

/** 画布事件载荷 */
export interface CanvasEventPayload {
  type: CanvasEvent;
  target?: FabricObject;
  selectedObjects?: FabricObject[];
  viewport?: ViewportState;
  scenePoint?: Point;
  viewportPoint?: Point;
}

/** 画布事件处理器 */
export type CanvasEventHandler = (payload: CanvasEventPayload) => void;

/** 画布序列化格式 */
export interface CanvasJSON {
  version: string;
  viewport: ViewportState;
  background: string;
  objects: Record<string, unknown>[];
}

// ===========================================================================
// ICanvasEngine 接口
// ===========================================================================

export interface ICanvasEngine {
  /** 初始化画布，绑定到 DOM 容器 */
  initialize(container: HTMLDivElement, config: CanvasConfig): void;

  /** 销毁画布实例，释放资源 */
  destroy(): void;

  /** 以指定点为中心缩放 */
  zoom(factor: number, center?: Point): void;

  /** 自动缩放至所有对象可见 */
  zoomToFit(): void;

  /** 平移画布视口 */
  pan(delta: Point): void;

  /** 获取当前视口状态 */
  getViewport(): ViewportState;

  /** 恢复视口状态 */
  setViewport(state: ViewportState): void;

  /** 添加对象到画布 */
  addObject(obj: FabricObject): void;

  /** 从画布移除对象 */
  removeObject(obj: FabricObject): void;

  /** 按自定义 ID 查找对象 */
  getObjectById(id: string): FabricObject | null;

  /** 获取当前选中对象列表 */
  getSelectedObjects(): FabricObject[];

  /** 从 JSON 反序列化画布 */
  loadFromJSON(canvasJSON: CanvasJSON): Promise<void>;

  /** 序列化画布为 JSON */
  toJSON(): CanvasJSON;

  /** 显示/隐藏网格 */
  setGridVisible(visible: boolean): void;

  /** 启用/禁用吸附到网格 */
  setSnapToGrid(enabled: boolean): void;

  /** 设置画布背景色 */
  setBackground(color: string): void;

  /** 注册事件处理器 */
  on(event: CanvasEvent, handler: CanvasEventHandler): void;

  /** 注销事件处理器 */
  off(event: CanvasEvent, handler: CanvasEventHandler): void;
}

// ===========================================================================
// 辅助工具
// ===========================================================================

/** 存储在 FabricObject 上的自定义数据 */
interface ObjectCustomData {
  id: string;
  [key: string]: unknown;
}

/** 安全获取 FabricObject 上的自定义 data */
function getObjectCustomData(obj: FabricObject): ObjectCustomData | undefined {
  return (obj as { data?: ObjectCustomData }).data;
}

/** 将我们的 Point 转为 Fabric Point */
function toFabricPoint(p: Point): FabricPoint {
  return new FabricPoint(p.x, p.y);
}

/** 从 Fabric Point 转为我们的 Point */
function fromFabricPoint(p: XY): Point {
  return { x: p.x, y: p.y };
}

// ===========================================================================
// CanvasEngine 实现
// ===========================================================================

export class CanvasEngine implements ICanvasEngine {
  private canvas: Canvas | null = null;
  private config!: CanvasConfig;
  private gridGroup: Group | null = null;
  private gridVisible = false;
  private snapToGridEnabled = false;

  /** 事件处理器注册表 */
  private handlers: Map<CanvasEvent, Set<CanvasEventHandler>> = new Map();

  /** Fabric.js 原生事件 disposer 列表 */
  private fabricDisposers: VoidFunction[] = [];

  /** FPS 监控数据 */
  private fpsRafId = 0;
  private fpsFrames = 0;
  private fpsLastTime = 0;
  private fpsMonitoring = false;

  // =========================================================================
  // 生命周期
  // =========================================================================

  initialize(container: HTMLDivElement, config: CanvasConfig): void {
    if (this.canvas) {
      throw new Error('CanvasEngine is already initialized. Call destroy() first.');
    }

    this.config = { ...config };

    // Use container's actual size, falling back to config defaults
    const w = container.clientWidth || config.width;
    const h = container.clientHeight || config.height;

    const canvasEl = document.createElement('canvas');
    canvasEl.width = w;
    canvasEl.height = h;
    canvasEl.style.display = 'block';
    container.appendChild(canvasEl);
    container.style.overflow = 'hidden';

    this.canvas = new Canvas(canvasEl, {
      width: w,
      height: h,
      backgroundColor: config.backgroundColor,
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: true,
      stopContextMenu: true,
      fireMiddleClick: true,
    });

    this.snapToGridEnabled = config.snapToGrid;
    this.registerFabricEvents();
    this.startFPSMonitor();

    // 如果配置中要求显示网格，立即创建
    if (this.config.snapToGrid) {
      this.setGridVisible(true);
    }
  }

  destroy(): void {
    this.stopFPSMonitor();

    // 注销所有 Fabric.js 事件
    for (const disposer of this.fabricDisposers) {
      disposer();
    }
    this.fabricDisposers = [];

    // 清理事件处理器
    this.handlers.clear();

    // 销毁画布
    if (this.canvas) {
      this.canvas.dispose();
      this.canvas = null;
    }

    this.gridGroup = null;
    this.gridVisible = false;
  }

  // =========================================================================
  // 视口控制
  // =========================================================================

  zoom(factor: number, center?: Point): void {
    if (!this.canvas) return;

    const clamped = Math.min(
      Math.max(factor, this.config.zoomMin),
      this.config.zoomMax,
    );

    if (center) {
      this.canvas.zoomToPoint(toFabricPoint(center), clamped);
    } else {
      this.canvas.setZoom(clamped);
    }

    this.canvas.requestRenderAll();
    this.fireViewportChange();
  }

  zoomToFit(): void {
    if (!this.canvas) return;

    const objects = this.canvas.getObjects().filter((o) => o !== this.gridGroup);
    if (objects.length === 0) {
      // 没有对象时重置视口
      const vpt = this.canvas.viewportTransform;
      if (vpt) {
        vpt[0] = 1;
        vpt[3] = 1;
        vpt[4] = 0;
        vpt[5] = 0;
      }
      this.canvas.requestRenderAll();
      this.fireViewportChange();
      return;
    }

    // 计算所有对象的包围盒
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of objects) {
      const bounds = obj.getBoundingRect();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.left + bounds.width);
      maxY = Math.max(maxY, bounds.top + bounds.height);
    }

    const objectsWidth = maxX - minX;
    const objectsHeight = maxY - minY;
    const padding = 40;
    const canvasWidth = this.config.width;
    const canvasHeight = this.config.height;

    const zoomX = canvasWidth / (objectsWidth + padding * 2);
    const zoomY = canvasHeight / (objectsHeight + padding * 2);
    const targetZoom = Math.min(zoomX, zoomY, this.config.zoomMax);

    const clampedZoom = Math.max(targetZoom, this.config.zoomMin);

    // 平移使对象居中
    const centerX = minX + objectsWidth / 2;
    const centerY = minY + objectsHeight / 2;

    const panX = canvasWidth / 2 - centerX * clampedZoom;
    const panY = canvasHeight / 2 - centerY * clampedZoom;

    this.canvas.setViewportTransform([
      clampedZoom,
      0,
      0,
      clampedZoom,
      panX,
      panY,
    ]);
    this.canvas.requestRenderAll();
    this.fireViewportChange();
  }

  pan(delta: Point): void {
    if (!this.canvas) return;

    this.canvas.relativePan(toFabricPoint(delta));
    this.canvas.requestRenderAll();
    this.fireViewportChange();
  }

  getViewport(): ViewportState {
    if (!this.canvas) {
      return { zoom: 1, panX: 0, panY: 0 };
    }

    const vpt = this.canvas.viewportTransform;
    return {
      zoom: vpt ? vpt[0] : 1,
      panX: vpt ? vpt[4] : 0,
      panY: vpt ? vpt[5] : 0,
    };
  }

  setViewport(state: ViewportState): void {
    if (!this.canvas) return;

    const zoomClamped = Math.min(
      Math.max(state.zoom, this.config.zoomMin),
      this.config.zoomMax,
    );

    this.canvas.setViewportTransform([
      zoomClamped,
      0,
      0,
      zoomClamped,
      state.panX,
      state.panY,
    ]);
    this.canvas.requestRenderAll();
    this.fireViewportChange();
  }

  // =========================================================================
  // 对象操作
  // =========================================================================

  addObject(obj: FabricObject): void {
    if (!this.canvas) return;
    this.canvas.add(obj);
    this.canvas.requestRenderAll();

    // 检查对象数量，>100 时确保缓存开启
    this.checkObjectCaching();

    // 触发 canvas:drop 事件
    this.fireCustomEvent('canvas:drop', {
      target: obj,
    });

    // 触发 viewport:change
    this.fireViewportChange();
  }

  removeObject(obj: FabricObject): void {
    if (!this.canvas) return;
    this.canvas.remove(obj);
    this.canvas.requestRenderAll();
    this.fireViewportChange();
  }

  getObjectById(id: string): FabricObject | null {
    if (!this.canvas) return null;

    const objects = this.canvas.getObjects();
    for (const obj of objects) {
      const customData = getObjectCustomData(obj);
      if (customData?.id === id) {
        return obj;
      }
    }
    return null;
  }

  getSelectedObjects(): FabricObject[] {
    if (!this.canvas) return [];
    return this.canvas.getActiveObjects();
  }

  // =========================================================================
  // 序列化
  // =========================================================================

  toJSON(): CanvasJSON {
    if (!this.canvas) {
      return {
        version: '1.0',
        viewport: { zoom: 1, panX: 0, panY: 0 },
        background: '#FFFFFF',
        objects: [],
      };
    }

    // 序列化时排除网格
    const gridWasVisible = this.gridGroup?.visible;
    if (this.gridGroup) {
      this.gridGroup.visible = false;
    }

    const fabricJSON = this.canvas.toObject(['data']);

    // 恢复网格可见性
    if (this.gridGroup) {
      this.gridGroup.visible = gridWasVisible ?? this.gridVisible;
    }

    const background =
      typeof this.canvas.backgroundColor === 'string'
        ? this.canvas.backgroundColor
        : this.config.backgroundColor;

    return {
      version: fabricJSON.version ?? '1.0',
      viewport: this.getViewport(),
      background,
      objects: fabricJSON.objects as Record<string, unknown>[],
    };
  }

  async loadFromJSON(canvasJSON: CanvasJSON): Promise<void> {
    if (!this.canvas) return;

    const gridWasVisible = this.gridVisible;

    // 使用 Fabric.js 原生反序列化
    // canvasJSON 结构与 fabric 格式兼容 (version, objects, background)
    await this.canvas.loadFromJSON(
      canvasJSON as unknown as Record<string, unknown>,
    );

    // 恢复视口
    this.setViewport(canvasJSON.viewport);

    // 恢复网格
    if (gridWasVisible) {
      this.createGrid();
      this.setGridVisible(true);
    }

    this.canvas.requestRenderAll();
    this.checkObjectCaching();
  }

  // =========================================================================
  // 画布配置
  // =========================================================================

  setGridVisible(visible: boolean): void {
    if (!this.canvas) return;
    this.gridVisible = visible;

    if (visible) {
      if (!this.gridGroup) {
        this.createGrid();
      }
      if (this.gridGroup) {
        this.gridGroup.visible = true;
      }
    } else {
      if (this.gridGroup) {
        this.gridGroup.visible = false;
      }
    }

    this.canvas.requestRenderAll();
  }

  setSnapToGrid(enabled: boolean): void {
    this.snapToGridEnabled = enabled;
  }

  setBackground(color: string): void {
    if (!this.canvas) return;
    this.canvas.backgroundColor = color;
    this.canvas.requestRenderAll();
  }

  // =========================================================================
  // 事件系统
  // =========================================================================

  on(event: CanvasEvent, handler: CanvasEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: CanvasEvent, handler: CanvasEventHandler): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  // =========================================================================
  // 内部方法: 事件桥接
  // =========================================================================

  /** 注册 Fabric.js 原生事件并桥接到我们的 CanvasEvent */
  private registerFabricEvents(): void {
    if (!this.canvas) return;

    const c = this.canvas;

    // -- selection:created → object:selected --
    this.fabricDisposers.push(
      c.on('selection:created', (e: { selected: FabricObject[] }) => {
        this.fireCustomEvent('object:selected', {
          selectedObjects: e.selected,
        });
      }),
    );

    // -- selection:updated → object:selected --
    this.fabricDisposers.push(
      c.on('selection:updated', (e: { selected: FabricObject[] }) => {
        this.fireCustomEvent('object:selected', {
          selectedObjects: e.selected,
        });
      }),
    );

    // -- selection:cleared → object:deselected --
    this.fabricDisposers.push(
      c.on('selection:cleared', (e: { deselected: FabricObject[] }) => {
        this.fireCustomEvent('object:deselected', {
          selectedObjects: e.deselected,
        });
      }),
    );

    // -- object:moving --
    this.fabricDisposers.push(
      c.on('object:moving', (e: { target: FabricObject }) => {
        // 应用网格吸附
        if (this.snapToGridEnabled && e.target) {
          this.snapObjectToGrid(e.target);
        }
        this.fireCustomEvent('object:moving', {
          target: e.target,
        });
      }),
    );

    // -- object:modified --
    this.fabricDisposers.push(
      c.on('object:modified', (e: { target: FabricObject }) => {
        // 确保最终位置吸附到网格
        if (this.snapToGridEnabled && e.target) {
          this.snapObjectToGrid(e.target);
        }
        this.fireCustomEvent('object:modified', {
          target: e.target,
        });
        this.fireViewportChange();
      }),
    );

    // -- mouse:down --
    this.fabricDisposers.push(
      c.on('mouse:down', (e: { scenePoint: XY; viewportPoint: XY }) => {
        this.fireCustomEvent('mouse:down', {
          scenePoint: fromFabricPoint(e.scenePoint),
          viewportPoint: fromFabricPoint(e.viewportPoint),
        });
      }),
    );

    // -- mouse:move --
    this.fabricDisposers.push(
      c.on('mouse:move', (e: { scenePoint: XY; viewportPoint: XY }) => {
        this.fireCustomEvent('mouse:move', {
          scenePoint: fromFabricPoint(e.scenePoint),
          viewportPoint: fromFabricPoint(e.viewportPoint),
        });
      }),
    );

    // -- mouse:up --
    this.fabricDisposers.push(
      c.on('mouse:up', (e: { scenePoint: XY; viewportPoint: XY }) => {
        this.fireCustomEvent('mouse:up', {
          scenePoint: fromFabricPoint(e.scenePoint),
          viewportPoint: fromFabricPoint(e.viewportPoint),
        });
      }),
    );
  }

  /** 触发自定义事件 */
  private fireCustomEvent(type: CanvasEvent, extra: Partial<CanvasEventPayload> = {}): void {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return;

    const payload: CanvasEventPayload = {
      type,
      target: extra.target,
      selectedObjects: extra.selectedObjects,
      viewport: extra.viewport,
      scenePoint: extra.scenePoint,
      viewportPoint: extra.viewportPoint,
    };

    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[CanvasEngine] Error in '${type}' handler:`, err);
      }
    }
  }

  /** 触发视口变更事件 */
  private fireViewportChange(): void {
    this.fireCustomEvent('viewport:change', {
      viewport: this.getViewport(),
    });
  }

  // =========================================================================
  // 内部方法: 网格
  // =========================================================================

  /** 创建网格 Group */
  private createGrid(): void {
    if (!this.canvas) return;

    // 移除旧网格
    if (this.gridGroup) {
      this.canvas.remove(this.gridGroup);
      this.gridGroup = null;
    }

    const { width, height, gridSize } = this.config;
    const lines: Line[] = [];

    // 垂直线
    for (let x = 0; x <= width; x += gridSize) {
      const line = new Line([x, 0, x, height], {
        stroke: '#E0E0E0',
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      lines.push(line);
    }

    // 水平线
    for (let y = 0; y <= height; y += gridSize) {
      const line = new Line([0, y, width, y], {
        stroke: '#E0E0E0',
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      lines.push(line);
    }

    this.gridGroup = new Group(lines, {
      selectable: false,
      evented: false,
      excludeFromExport: true,
      objectCaching: true,
      visible: this.gridVisible,
    });

    this.canvas.add(this.gridGroup);
    this.canvas.sendObjectToBack(this.gridGroup);
  }

  // =========================================================================
  // 内部方法: 网格吸附
  // =========================================================================

  /** 将对象坐标吸附到最近的网格点 */
  private snapObjectToGrid(target: FabricObject): void {
    const gs = this.config.gridSize;
    target.set({
      left: Math.round(target.left / gs) * gs,
      top: Math.round(target.top / gs) * gs,
    });
    target.setCoords();
  }

  // =========================================================================
  // 内部方法: 性能优化
  // =========================================================================

  /** 检查对象数量并在需要时启用对象缓存 */
  private checkObjectCaching(): void {
    if (!this.canvas) return;
    const objectCount = this.canvas.getObjects().length;
    if (objectCount > 100) {
      // Fabric.js v6 默认已为对象启用 objectCaching，
      // 此处确保所有对象都开启了缓存以优化大量对象时的渲染性能
      const objects = this.canvas.getObjects();
      for (const obj of objects) {
        if (obj !== this.gridGroup && !obj.objectCaching) {
          obj.objectCaching = true;
        }
      }
    }
  }

  // =========================================================================
  // 内部方法: FPS 监控
  // =========================================================================

  private startFPSMonitor(): void {
    if (this.fpsMonitoring) return;
    this.fpsMonitoring = true;
    this.fpsFrames = 0;
    this.fpsLastTime = performance.now();

    const tick = (): void => {
      if (!this.fpsMonitoring) return;
      this.fpsFrames++;
      const now = performance.now();
      const elapsed = now - this.fpsLastTime;
      if (elapsed >= 1000) {
        const fps = Math.round(this.fpsFrames / (elapsed / 1000));
        console.log(`[CanvasEngine] FPS: ${fps}`);
        this.fpsFrames = 0;
        this.fpsLastTime = now;
      }
      this.fpsRafId = requestAnimationFrame(tick);
    };

    this.fpsRafId = requestAnimationFrame(tick);
  }

  private stopFPSMonitor(): void {
    this.fpsMonitoring = false;
    if (this.fpsRafId) {
      cancelAnimationFrame(this.fpsRafId);
      this.fpsRafId = 0;
    }
  }
}

// ===========================================================================
// React Hook
// ===========================================================================

/**
 * React Hook 用于在组件中集成 CanvasEngine。
 * 自动管理 CanvasEngine 的初始化和销毁。
 *
 * @param containerRef - 指向 HTMLDivElement 的 React Ref
 * @param config - 画布配置（合并到默认值）
 * @returns CanvasEngine 实例（初始化完成前为 null）
 *
 * @example
 * ```tsx
 * function MyCanvas() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const engine = useCanvasEngine(containerRef, { width: 1200, height: 800 });
 *   // 使用 engine...
 *   return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
 * }
 * ```
 */
export function useCanvasEngine(
  containerRef: RefObject<HTMLDivElement>,
  config?: Partial<CanvasConfig>,
): CanvasEngine | null {
  const engineRef = useRef<CanvasEngine | null>(null);
  const [engine, setEngine] = useState<CanvasEngine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instance = new CanvasEngine();
    const mergedConfig: CanvasConfig = { ...DEFAULT_CANVAS_CONFIG, ...config };
    instance.initialize(container, mergedConfig);
    engineRef.current = instance;
    setEngine(instance);

    return () => {
      instance.destroy();
      engineRef.current = null;
      setEngine(null);
    };
    // 仅在挂载时初始化，配置变更不重新初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return engine;
}
