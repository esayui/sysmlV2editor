// ===========================================================================
// Interaction Handler — 鼠标/键盘事件 → 操作意图（Intent）
// 来源: 详细设计 §3.4
// 依赖: M-FE-01 (Canvas Engine), M-FE-08 (State Store)
// ===========================================================================

import { FabricObject, Canvas, Point as FabricPoint } from 'fabric';
import type { ICanvasEngine, CanvasEventHandler, CanvasEventPayload } from '../canvas-engine';
import type { Point } from '@/types/canvas-model';

// ===========================================================================
// 类型定义
// ===========================================================================

export type InteractionMode =
  | 'select'        // 选择/移动模式（默认）
  | 'pan'           // 画布平移模式（空格+拖拽）
  | 'connect'       // 连线模式（点击端口拖到另一个端口）
  | 'create-block'  // 创建块模式（点击画布放置）
  | 'create-port'   // 创建端口模式（点击元素边缘放置）
  | 'delete';       // 删除模式（点击元素删除）

export type InteractionIntent =
  | 'canvas:click'
  | 'canvas:dblclick'
  | 'canvas:contextmenu'
  | 'element:click'
  | 'element:dblclick'
  | 'element:drag-start'
  | 'element:drag-move'
  | 'element:drag-end'
  | 'element:resize'
  | 'element:delete'
  | 'port:connect-start'
  | 'port:connect-end'
  | 'connection:click'
  | 'connection:add-waypoint'
  | 'connection:move-waypoint'
  | 'selection:box'
  | 'selection:clear'
  | 'drop:from-toolbox'
  | 'keyboard:undo'
  | 'keyboard:redo'
  | 'keyboard:delete'
  | 'keyboard:copy'
  | 'keyboard:paste'
  | 'keyboard:select-all';

export interface IntentPayload {
  scenePoint?: Point;
  viewportPoint?: Point;
  elementId?: string;
  elementIds?: string[];
  portId?: string;
  connectionId?: string;
  elementType?: string;
  dropPosition?: Point;
  dragDelta?: Point;
  selectionBounds?: { x: number; y: number; width: number; height: number };
  nativeEvent?: Event;
  [key: string]: unknown;
}

export type IntentCallback = (payload: IntentPayload) => void;

// ===========================================================================
// IInteractionHandler 接口
// ===========================================================================

export interface IInteractionHandler {
  /** 初始化：注册所有事件监听器 */
  initialize(): void;

  /** 销毁：移除所有事件监听器 */
  destroy(): void;

  /** 切换当前交互模式 */
  setMode(mode: InteractionMode): void;

  /** 获取当前交互模式 */
  getMode(): InteractionMode;

  /** 注册操作意图回调 */
  onIntent(intent: InteractionIntent, callback: IntentCallback): void;

  /** 注销操作意图回调 */
  offIntent(intent: InteractionIntent, callback: IntentCallback): void;
}

// ===========================================================================
// 内部类型
// ===========================================================================

/** FabricObject 上存储的自定义 data */
interface ObjectCustomData {
  id: string;
  type?: string;
  [key: string]: unknown;
}

/** 对象分类结果 */
type ObjectType = 'element' | 'port' | 'connection' | 'unknown';

/** 用于安全访问 CanvasEngine 内部的 Fabric.js Canvas 实例 */
interface CanvasEngineInternals {
  canvas: Canvas | null;
}

/** Fabric.js Canvas 上获取外层 DOM 元素的方法 */
interface CanvasWithElement {
  getElement?: () => HTMLElement | null;
  lowerCanvasEl?: HTMLElement;
}

/** 带尺寸属性的 FabricObject */
interface FabricObjectWithSize {
  width?: number;
  height?: number;
}

// ===========================================================================
// 常量
// ===========================================================================

const DBL_CLICK_THRESHOLD_MS = 300;
const DRAG_THRESHOLD_PX = 3;

/** 模式 → 光标样式映射 */
const MODE_CURSOR_MAP: Record<InteractionMode, string> = {
  select: 'default',
  pan: 'grab',
  connect: 'crosshair',
  'create-block': 'crosshair',
  'create-port': 'crosshair',
  delete: 'pointer',
};

// ===========================================================================
// 辅助函数
// ===========================================================================

function getCustomData(obj: FabricObject): ObjectCustomData | undefined {
  const d = (obj as { data?: ObjectCustomData }).data;
  return d;
}

function classifyObject(obj: FabricObject): ObjectType {
  const data = getCustomData(obj);
  if (!data) return 'unknown';
  const t = data.type;
  if (t === 'element' || t === 'port' || t === 'connection') return t;
  if (t === 'block' || t === 'node') return 'element';
  return 'unknown';
}

function getObjectId(obj: FabricObject): string | undefined {
  return getCustomData(obj)?.id;
}

/** 从 ICanvasEngine 内部获取 Fabric.js Canvas 实例 */
function getFabricCanvas(engine: ICanvasEngine): Canvas | null {
  const internals = engine as unknown as CanvasEngineInternals;
  return internals.canvas ?? null;
}

/** 获取 canvas 上层 DOM 元素（用于设置光标、监听 DOM 事件） */
function getCanvasElement(engine: ICanvasEngine): HTMLElement | null {
  const c = getFabricCanvas(engine);
  if (!c) return null;
  const withEl = c as unknown as CanvasWithElement;
  return withEl.lowerCanvasEl ?? withEl.getElement?.() ?? null;
}

// ===========================================================================
// InteractionHandler 实现
// ===========================================================================

export class InteractionHandler implements IInteractionHandler {
  private engine: ICanvasEngine;
  private mode: InteractionMode = 'select';
  private previousMode: InteractionMode | null = null;

  /** Intent 回调注册表 */
  private intentCallbacks = new Map<InteractionIntent, Set<IntentCallback>>();

  // ---- 中间状态（模式切换时重置） ----

  /** 是否正在拖拽元素 */
  private isDragging = false;
  /** 是否正在进行框选 */
  private isBoxSelecting = false;
  /** 拖拽起始场景坐标 */
  private dragStartScenePoint: Point | null = null;
  /** 拖拽当前场景坐标（用于计算 delta） */
  private dragLastScenePoint: Point | null = null;
  /** 被拖拽的元素 ID 列表 */
  private draggedElementIds: string[] = [];

  /** Shift 键是否按下（框选） */
  private shiftKeyDown = false;
  /** 空格键是否按下（临时平移模式） */
  private spaceKeyDown = false;

  /** 双击检测：上次点击时间 */
  private lastClickTime = 0;
  /** 双击检测：上次点击目标 ID */
  private lastClickTargetId: string | null = null;

  /** 连线模式：已选中的源端口/元素 ID */
  private connectSourceId: string | null = null;

  /** element:modified 前记录尺寸，用于判断是否为 resize */
  private preModifyDimensions = new Map<string, { width: number; height: number }>();

  // ---- 绑定的事件处理器引用（必须保持身份稳定以支持 off） ----

  private readonly boundMouseDown: CanvasEventHandler;
  private readonly boundMouseMove: CanvasEventHandler;
  private readonly boundMouseUp: CanvasEventHandler;
  private readonly boundObjectModifying: CanvasEventHandler;
  private readonly boundObjectModified: CanvasEventHandler;
  private readonly boundObjectSelected: CanvasEventHandler;
  private readonly boundObjectDeselected: CanvasEventHandler;

  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private boundDropEvent: ((e: DragEvent) => void) | null = null;
  private boundDragOver: ((e: DragEvent) => void) | null = null;
  private boundContextMenu: ((e: MouseEvent) => void) | null = null;

  constructor(engine: ICanvasEngine) {
    this.engine = engine;

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundObjectModifying = this.handleObjectModifying.bind(this);
    this.boundObjectModified = this.handleObjectModified.bind(this);
    this.boundObjectSelected = this.handleObjectSelected.bind(this);
    this.boundObjectDeselected = this.handleObjectDeselected.bind(this);
  }

  // =========================================================================
  // 生命周期
  // =========================================================================

  initialize(): void {
    // 注册 CanvasEngine 事件
    this.engine.on('mouse:down', this.boundMouseDown);
    this.engine.on('mouse:move', this.boundMouseMove);
    this.engine.on('mouse:up', this.boundMouseUp);
    this.engine.on('object:moving', this.boundObjectModifying);
    this.engine.on('object:modified', this.boundObjectModified);
    this.engine.on('object:selected', this.boundObjectSelected);
    this.engine.on('object:deselected', this.boundObjectDeselected);

    // 键盘事件（window）
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    // 拖放事件（canvas 元素）
    const canvasEl = getCanvasElement(this.engine);
    if (canvasEl) {
      // drop
      this.boundDropEvent = this.handleNativeDrop.bind(this);
      canvasEl.addEventListener('drop', this.boundDropEvent as EventListener);

      // dragover（必须 preventDefault 才能触发 drop）
      this.boundDragOver = (e: DragEvent) => {
        e.preventDefault();
      };
      canvasEl.addEventListener('dragover', this.boundDragOver as EventListener);

      // contextmenu
      this.boundContextMenu = this.handleContextMenu.bind(this);
      canvasEl.addEventListener('contextmenu', this.boundContextMenu as EventListener);
    }

    // 初始光标
    this.updateCursor();
  }

  destroy(): void {
    // 注销 CanvasEngine 事件
    this.engine.off('mouse:down', this.boundMouseDown);
    this.engine.off('mouse:move', this.boundMouseMove);
    this.engine.off('mouse:up', this.boundMouseUp);
    this.engine.off('object:moving', this.boundObjectModifying);
    this.engine.off('object:modified', this.boundObjectModified);
    this.engine.off('object:selected', this.boundObjectSelected);
    this.engine.off('object:deselected', this.boundObjectDeselected);

    // 注销键盘
    if (this.boundKeyDown) {
      window.removeEventListener('keydown', this.boundKeyDown);
      this.boundKeyDown = null;
    }
    if (this.boundKeyUp) {
      window.removeEventListener('keyup', this.boundKeyUp);
      this.boundKeyUp = null;
    }

    // 注销拖放 & 右键
    const canvasEl = getCanvasElement(this.engine);
    if (canvasEl) {
      if (this.boundDropEvent) {
        canvasEl.removeEventListener('drop', this.boundDropEvent as EventListener);
        this.boundDropEvent = null;
      }
      if (this.boundDragOver) {
        canvasEl.removeEventListener('dragover', this.boundDragOver as EventListener);
        this.boundDragOver = null;
      }
      if (this.boundContextMenu) {
        canvasEl.removeEventListener('contextmenu', this.boundContextMenu as EventListener);
        this.boundContextMenu = null;
      }
    }

    // 清空回调
    this.intentCallbacks.clear();

    // 重置中间状态
    this.resetIntermediateState();
  }

  // =========================================================================
  // 模式管理
  // =========================================================================

  setMode(mode: InteractionMode): void {
    if (this.mode === mode) return;
    this.resetIntermediateState();
    this.mode = mode;
    this.updateCursor();
  }

  getMode(): InteractionMode {
    return this.mode;
  }

  // =========================================================================
  // Intent 回调
  // =========================================================================

  onIntent(intent: InteractionIntent, callback: IntentCallback): void {
    if (!this.intentCallbacks.has(intent)) {
      this.intentCallbacks.set(intent, new Set());
    }
    this.intentCallbacks.get(intent)!.add(callback);
  }

  offIntent(intent: InteractionIntent, callback: IntentCallback): void {
    const set = this.intentCallbacks.get(intent);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.intentCallbacks.delete(intent);
      }
    }
  }

  // =========================================================================
  // 内部: Intent 分发
  // =========================================================================

  private dispatchIntent(intent: InteractionIntent, payload: IntentPayload = {}): void {
    const set = this.intentCallbacks.get(intent);
    if (!set || set.size === 0) return;

    for (const callback of set) {
      try {
        callback(payload);
      } catch (err) {
        console.error(`[InteractionHandler] Error in '${intent}' handler:`, err);
      }
    }
  }

  // =========================================================================
  // 内部: mouse:down
  // =========================================================================

  private handleMouseDown(payload: CanvasEventPayload): void {
    const scenePoint = payload.scenePoint;
    const viewportPoint = payload.viewportPoint;
    if (!scenePoint || !viewportPoint) return;

    const target = this.findTargetAtPoint(scenePoint);
    const targetType = target ? classifyObject(target) : 'unknown';
    const targetId = target ? getObjectId(target) : undefined;

    // 双击检测
    const now = Date.now();
    const normalizedTargetId = targetId ?? null;
    const isDblClick =
      now - this.lastClickTime <= DBL_CLICK_THRESHOLD_MS &&
      this.lastClickTargetId === normalizedTargetId;
    this.lastClickTime = now;
    this.lastClickTargetId = normalizedTargetId;

    switch (this.mode) {
      case 'select':
        this.handleMouseDownSelect(scenePoint, viewportPoint, target, targetType, targetId, isDblClick);
        break;
      case 'pan':
        this.handleMouseDownPan(scenePoint);
        break;
      case 'connect':
        this.handleMouseDownConnect(scenePoint, target, targetType, targetId);
        break;
      case 'create-block':
        this.handleMouseDownCreateBlock(scenePoint, viewportPoint, target, targetId);
        break;
      case 'create-port':
        this.handleMouseDownCreatePort(scenePoint, viewportPoint, target, targetType, targetId);
        break;
      case 'delete':
        this.handleMouseDownDelete(scenePoint, viewportPoint, target, targetType, targetId);
        break;
    }
  }

  // -- select 模式 mouse:down --

  private handleMouseDownSelect(
    scenePoint: Point,
    viewportPoint: Point,
    target: FabricObject | null,
    targetType: ObjectType,
    targetId: string | undefined,
    isDblClick: boolean,
  ): void {
    if (target && targetType === 'element' && targetId) {
      // 点击元素 → 准备拖拽
      this.isDragging = false;
      this.isBoxSelecting = false;
      this.dragStartScenePoint = scenePoint;
      this.dragLastScenePoint = scenePoint;

      // 获取选中元素列表（包括当前点击的）
      const selectedObjects = this.engine.getSelectedObjects();
      const selectedIds = selectedObjects
        .map((o) => getObjectId(o))
        .filter((id): id is string => id !== undefined);

      // 如果当前点击的元素不在已选中列表中，则以当前元素为准
      if (selectedIds.includes(targetId)) {
        this.draggedElementIds = selectedIds.length > 0 ? selectedIds : [targetId];
      } else {
        this.draggedElementIds = [targetId];
      }

      if (isDblClick) {
        this.dispatchIntent('element:dblclick', {
          scenePoint, viewportPoint, elementId: targetId,
        });
      } else {
        this.dispatchIntent('element:click', {
          scenePoint, viewportPoint, elementId: targetId,
        });
      }
    } else if (target && targetType === 'connection' && targetId) {
      this.dispatchIntent('connection:click', {
        scenePoint, viewportPoint, connectionId: targetId,
      });
    } else if (target && targetType === 'port' && targetId) {
      // 端口点击按元素点击处理
      this.dispatchIntent('element:click', {
        scenePoint, viewportPoint, elementId: targetId,
      });
    } else {
      // 点击空白区域
      if (this.shiftKeyDown) {
        // 开始框选
        this.isBoxSelecting = true;
        this.isDragging = false;
        this.dragStartScenePoint = scenePoint;
      }

      if (isDblClick) {
        this.dispatchIntent('canvas:dblclick', { scenePoint, viewportPoint });
      } else {
        this.dispatchIntent('canvas:click', { scenePoint, viewportPoint });
        // 点击空白 → 取消选择
        this.dispatchIntent('selection:clear', { scenePoint, viewportPoint });
      }
    }
  }

  // -- pan 模式 mouse:down --

  private handleMouseDownPan(scenePoint: Point): void {
    this.isDragging = true;
    this.dragStartScenePoint = scenePoint;
    this.dragLastScenePoint = scenePoint;
  }

  // -- connect 模式 mouse:down --

  private handleMouseDownConnect(
    scenePoint: Point,
    _target: FabricObject | null,
    targetType: ObjectType,
    targetId: string | undefined,
  ): void {
    if (targetType === 'port' && targetId) {
      if (this.connectSourceId === null) {
        this.connectSourceId = targetId;
        this.dispatchIntent('port:connect-start', {
          scenePoint, portId: targetId,
        });
      } else if (targetId !== this.connectSourceId) {
        this.dispatchIntent('port:connect-end', {
          scenePoint, portId: targetId,
        });
        this.connectSourceId = null;
      }
    } else if (targetType === 'element' && targetId) {
      if (this.connectSourceId === null) {
        this.connectSourceId = targetId;
        this.dispatchIntent('port:connect-start', {
          scenePoint, portId: targetId,
        });
      } else if (targetId !== this.connectSourceId) {
        this.dispatchIntent('port:connect-end', {
          scenePoint, portId: targetId,
        });
        this.connectSourceId = null;
      }
    }
    // 点击空白区域在 connect 模式下无操作
  }

  // -- create-block 模式 mouse:down --

  private handleMouseDownCreateBlock(
    scenePoint: Point,
    viewportPoint: Point,
    target: FabricObject | null,
    targetId: string | undefined,
  ): void {
    // 在空白处点击才创建
    if (!target) {
      this.dispatchIntent('canvas:click', { scenePoint, viewportPoint });
    } else if (targetId) {
      // 点击元素视为 canvas:click，由外部决定行为
      this.dispatchIntent('canvas:click', { scenePoint, viewportPoint });
    }
  }

  // -- create-port 模式 mouse:down --

  private handleMouseDownCreatePort(
    scenePoint: Point,
    viewportPoint: Point,
    _target: FabricObject | null,
    targetType: ObjectType,
    targetId: string | undefined,
  ): void {
    if (targetType === 'element' && targetId) {
      this.dispatchIntent('element:click', {
        scenePoint, viewportPoint, elementId: targetId,
      });
    }
  }

  // -- delete 模式 mouse:down --

  private handleMouseDownDelete(
    scenePoint: Point,
    viewportPoint: Point,
    target: FabricObject | null,
    targetType: ObjectType,
    targetId: string | undefined,
  ): void {
    if (target && targetType === 'element' && targetId) {
      this.dispatchIntent('element:delete', {
        scenePoint, viewportPoint, elementId: targetId,
      });
    }
  }

  // =========================================================================
  // 内部: mouse:move
  // =========================================================================

  private handleMouseMove(payload: CanvasEventPayload): void {
    const scenePoint = payload.scenePoint;
    if (!scenePoint) return;

    switch (this.mode) {
      case 'select':
        this.handleMouseMoveSelect(scenePoint);
        break;
      case 'pan':
        this.handleMouseMovePan(scenePoint);
        break;
      case 'connect':
        // 连线拖拽中的视觉反馈由外部处理
        break;
      default:
        break;
    }
  }

  private handleMouseMoveSelect(scenePoint: Point): void {
    if (!this.dragStartScenePoint) return;

    if (this.isBoxSelecting) {
      // Shift+拖拽空白 → 框选，由 Fabric.js 原生处理
      // 仅在 drag-start 时发一次 selection:box
      if (!this.isDragging) {
        const dx = scenePoint.x - this.dragStartScenePoint.x;
        const dy = scenePoint.y - this.dragStartScenePoint.y;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
          this.isDragging = true;
          this.dispatchIntent('selection:box', {
            scenePoint,
            selectionBounds: {
              x: this.dragStartScenePoint.x,
              y: this.dragStartScenePoint.y,
              width: dx,
              height: dy,
            },
          });
        }
      }
    } else {
      // 元素拖拽
      if (!this.isDragging) {
        const dx = scenePoint.x - this.dragStartScenePoint.x;
        const dy = scenePoint.y - this.dragStartScenePoint.y;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
          this.isDragging = true;
          this.dispatchIntent('element:drag-start', {
            scenePoint,
            elementIds: this.draggedElementIds,
            dragDelta: { x: dx, y: dy },
          });
        }
      } else {
        // 继续拖拽
        const delta: Point = {
          x: scenePoint.x - (this.dragLastScenePoint?.x ?? this.dragStartScenePoint.x),
          y: scenePoint.y - (this.dragLastScenePoint?.y ?? this.dragStartScenePoint.y),
        };
        this.dragLastScenePoint = scenePoint;
        this.dispatchIntent('element:drag-move', {
          scenePoint,
          elementIds: this.draggedElementIds,
          dragDelta: delta,
        });
      }
    }
  }

  private handleMouseMovePan(scenePoint: Point): void {
    if (!this.isDragging || !this.dragLastScenePoint) return;

    const delta: Point = {
      x: scenePoint.x - this.dragLastScenePoint.x,
      y: scenePoint.y - this.dragLastScenePoint.y,
    };
    this.dragLastScenePoint = scenePoint;

    // 直接调用 CanvasEngine 平移
    this.engine.pan(delta);
  }

  // =========================================================================
  // 内部: mouse:up
  // =========================================================================

  private handleMouseUp(payload: CanvasEventPayload): void {
    const scenePoint = payload.scenePoint;

    switch (this.mode) {
      case 'select':
        if (this.isDragging) {
          if (this.isBoxSelecting) {
            // 框选结束（Fabric.js 已处理实际选择，此处通知）
            // selection:box 已在 drag-start 时发送，此处不需要重复
          } else if (this.dragStartScenePoint && scenePoint) {
            const totalDelta: Point = {
              x: scenePoint.x - this.dragStartScenePoint.x,
              y: scenePoint.y - this.dragStartScenePoint.y,
            };
            this.dispatchIntent('element:drag-end', {
              scenePoint,
              elementIds: this.draggedElementIds,
              dragDelta: totalDelta,
            });
          }
        }
        break;
      case 'pan':
        break;
      default:
        break;
    }

    // 重置所有拖拽/框选状态
    this.isDragging = false;
    this.isBoxSelecting = false;
    this.dragStartScenePoint = null;
    this.dragLastScenePoint = null;
    this.draggedElementIds = [];
  }

  // =========================================================================
  // 内部: object 事件
  // =========================================================================

  /** object:moving — 在修改前记录尺寸 */
  private handleObjectModifying(payload: CanvasEventPayload): void {
    const target = payload.target;
    if (!target) return;
    const id = getObjectId(target);
    if (!id) return;

    const sized = target as unknown as FabricObjectWithSize;
    this.preModifyDimensions.set(id, {
      width: sized.width ?? 0,
      height: sized.height ?? 0,
    });
  }

  /** object:modified — 判断是否为 resize */
  private handleObjectModified(payload: CanvasEventPayload): void {
    const target = payload.target;
    if (!target) return;
    const id = getObjectId(target);
    if (!id) return;

    const oldDims = this.preModifyDimensions.get(id);
    if (!oldDims) {
      this.preModifyDimensions.delete(id);
      return;
    }

    const sized = target as unknown as FabricObjectWithSize;
    const w = sized.width ?? 0;
    const h = sized.height ?? 0;

    if (Math.abs(w - oldDims.width) > 1 || Math.abs(h - oldDims.height) > 1) {
      this.dispatchIntent('element:resize', { elementId: id });
    }

    this.preModifyDimensions.delete(id);
  }

  /** object:selected — 检测是否为框选 */
  private handleObjectSelected(payload: CanvasEventPayload): void {
    if (this.mode !== 'select') return;
    // 如果 shift 按下且有多个对象被选中，视为框选
    const selected = payload.selectedObjects ?? [];
    if (this.shiftKeyDown && selected.length > 1) {
      this.dispatchIntent('selection:box', {
        elementIds: selected
          .map((o) => getObjectId(o))
          .filter((id): id is string => id !== undefined),
      });
    }
  }

  /** object:deselected — 清空选择通知 */
  private handleObjectDeselected(_payload: CanvasEventPayload): void {
    // Fabric.js selection:cleared 时触发
    // 我们的 selection:clear 已在点击空白处时手动发送
  }

  // =========================================================================
  // 内部: 右键菜单
  // =========================================================================

  private handleContextMenu(e: MouseEvent): void {
    // 不 preventDefault，允许外部覆盖
    const canvasEl = getCanvasElement(this.engine);
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const scenePoint: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const target = this.findTargetAtPoint(scenePoint);
    const targetId = target ? getObjectId(target) : undefined;

    this.dispatchIntent('canvas:contextmenu', {
      scenePoint,
      elementId: targetId,
      nativeEvent: e,
    });
  }

  // =========================================================================
  // 内部: 键盘事件
  // =========================================================================

  private handleKeyDown(e: KeyboardEvent): void {
    // 跟踪修饰键
    if (e.key === 'Shift') {
      this.shiftKeyDown = true;
      return;
    }

    // 空格键 → 临时平移模式
    if (e.key === ' ' && !this.spaceKeyDown) {
      this.spaceKeyDown = true;
      e.preventDefault();
      if (this.mode !== 'pan') {
        this.previousMode = this.mode;
        this.setMode('pan');
      }
      return;
    }

    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+Z → undo
    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.dispatchIntent('keyboard:undo', { nativeEvent: e });
    }
    // Ctrl+Y / Ctrl+Shift+Z → redo
    else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.dispatchIntent('keyboard:redo', { nativeEvent: e });
    }
    // Delete / Backspace → keyboard:delete
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      // 不在输入框内时才处理
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        e.preventDefault();
        this.dispatchIntent('keyboard:delete', { nativeEvent: e });
      }
    }
    // Ctrl+C → copy
    else if (mod && e.key === 'c') {
      this.dispatchIntent('keyboard:copy', { nativeEvent: e });
    }
    // Ctrl+V → paste
    else if (mod && e.key === 'v') {
      this.dispatchIntent('keyboard:paste', { nativeEvent: e });
    }
    // Ctrl+A → select-all
    else if (mod && e.key === 'a') {
      e.preventDefault();
      this.dispatchIntent('keyboard:select-all', { nativeEvent: e });
    }
    // Escape → 取消操作 / 清空选择
    else if (e.key === 'Escape') {
      this.resetIntermediateState();
      this.connectSourceId = null;
      this.dispatchIntent('selection:clear', { nativeEvent: e });
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Shift') {
      this.shiftKeyDown = false;
    }
    if (e.key === ' ' && this.spaceKeyDown) {
      this.spaceKeyDown = false;
      const restore = this.previousMode ?? 'select';
      this.previousMode = null;
      this.setMode(restore);
    }
  }

  // =========================================================================
  // 内部: 拖放事件（从 Toolbox）
  // =========================================================================

  private handleNativeDrop(e: DragEvent): void {
    e.preventDefault();

    const dt = e.dataTransfer;
    if (!dt) return;

    // 提取 elementType
    let elementType = dt.getData('application/sysml2-element-type');
    if (!elementType) {
      elementType = dt.getData('text/plain');
    }
    if (!elementType) return;

    // 计算画布相对坐标
    const canvasEl = getCanvasElement(this.engine);
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const dropPosition: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    this.dispatchIntent('drop:from-toolbox', {
      elementType,
      dropPosition,
      nativeEvent: e,
    });
  }

  // =========================================================================
  // 内部: 辅助方法
  // =========================================================================

  /** 在指定场景坐标处查找 FabricObject */
  private findTargetAtPoint(point: Point): FabricObject | null {
    const c = getFabricCanvas(this.engine);
    if (!c) return null;

    const objects = c.getObjects();
    const fp = new FabricPoint(point.x, point.y);

    // 反向遍历，顶层对象优先
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (!obj.visible) continue;
      if (!obj.evented && !obj.selectable) continue;
      if (obj.containsPoint(fp)) {
        return obj;
      }
    }

    return null;
  }

  /** 更新 canvas 元素光标 */
  private updateCursor(): void {
    const el = getCanvasElement(this.engine);
    if (!el) return;
    el.style.cursor = MODE_CURSOR_MAP[this.mode] ?? 'default';
  }

  /** 重置所有中间状态（模式切换时调用） */
  private resetIntermediateState(): void {
    this.isDragging = false;
    this.isBoxSelecting = false;
    this.dragStartScenePoint = null;
    this.dragLastScenePoint = null;
    this.draggedElementIds = [];
    this.lastClickTime = 0;
    this.lastClickTargetId = null;
    this.preModifyDimensions.clear();
  }
}
