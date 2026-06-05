// ===========================================================================
// BaseElementRenderer — 元素渲染器抽象基类
// 来源: 详细设计 §3.2.2
// ===========================================================================

import { FabricObject, Group } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { NodeStyle, Point } from '@/types/canvas-model';
import { DEFAULT_NODE_STYLE } from '@/types/canvas-model';
import type { ICanvasEngine } from '../canvas-engine';

// ===========================================================================
// PortAnchor
// ===========================================================================

/** 端口锚点，用于连线端点吸附 */
export interface PortAnchor {
  /** 锚点唯一标识 */
  id: string;
  /** 锚点在元素边上的位置 */
  position: 'top' | 'right' | 'bottom' | 'left' | 'center';
  /** 相对于 FabricObject 左上角的偏移 */
  point: Point;
  /** 端口方向 */
  direction: 'in' | 'out' | 'inout';
}

// ===========================================================================
// 子对象角色常量
// ===========================================================================

/** FabricObject data.role 值，用于标识子对象 */
export const ChildRole = {
  Background: 'background',
  Name: 'name',
  Label: 'label',
  Text: 'text',
  Attribute: 'attribute',
  Expression: 'expression',
  Id: 'id',
  Port: 'port',
  ActorHead: 'actor-head',
  ActorBody: 'actor-body',
  ActorLabel: 'actor-label',
  PackageTab: 'package-tab',
  FoldCorner: 'fold-corner',
} as const;

export type ChildRoleType = (typeof ChildRole)[keyof typeof ChildRole];

// ===========================================================================
// 子对象数据辅助函数
// ===========================================================================

/** FabricObject 上自定义数据的类型 */
interface FabricObjectWithData extends FabricObject {
  data?: Record<string, unknown>;
}

/** 获取子对象的 role */
function getChildData(obj: FabricObject): Record<string, unknown> | undefined {
  return (obj as FabricObjectWithData).data;
}

/** 设置子对象的 role 和其他数据 */
function setChildData(
  obj: FabricObject,
  data: Record<string, unknown>,
): void {
  (obj as FabricObjectWithData).data = {
    ...getChildData(obj),
    ...data,
  };
}

/** 获取子对象的 role */
export function getChildRole(obj: FabricObject): string | undefined {
  const d = getChildData(obj);
  return d?.role as string | undefined;
}

/** 是否为 Group 类型 */
function isGroup(obj: FabricObject): obj is Group {
  return obj instanceof Group;
}

/** 获取 Group 的子对象列表 */
export function getGroupChildren(obj: FabricObject): FabricObject[] {
  if (isGroup(obj)) {
    return obj.getObjects();
  }
  return [];
}

// ===========================================================================
// BaseElementRenderer
// ===========================================================================

/**
 * 元素渲染器抽象基类。
 *
 * 每种 SysML 图元类型有独立的 Renderer 子类实现，
 * 负责将语义元素转换为 Fabric.js 可视化对象。
 *
 * @typeParam T - 语义元素类型，必须是 SemanticElement 的子类型
 */
export abstract class BaseElementRenderer<T extends SemanticElement> {
  protected canvas: ICanvasEngine;

  constructor(canvas: ICanvasEngine) {
    this.canvas = canvas;
  }

  /**
   * 将语义元素渲染为 Fabric.js 可视化对象。
   *
   * @param element - 语义元素
   * @param style - 节点样式（可选，默认使用 DEFAULT_NODE_STYLE）
   * @returns Fabric.js 对象（通常为 Group）
   */
  abstract render(element: T, style?: NodeStyle): FabricObject;

  /**
   * 更新已有的 Fabric.js 对象。
   * 当语义元素数据或样式变更时调用。
   *
   * @param fObj - 已有的 Fabric.js 对象（由 render 创建）
   * @param element - 更新后的语义元素
   * @param style - 新的节点样式（可选）
   */
  abstract update(fObj: FabricObject, element: T, style?: NodeStyle): void;

  /**
   * 获取元素的端口锚点列表。
   * 用于连线端点吸附计算。
   *
   * @param fObj - Fabric.js 对象
   * @returns 端口锚点数组
   */
  abstract getPortAnchors(fObj: FabricObject): PortAnchor[];

  /**
   * 计算元素的推荐渲染尺寸。
   *
   * @param element - 语义元素
   * @returns 推荐宽高（像素）
   */
  abstract calculateSize(element: T): { width: number; height: number };

  /**
   * 将 NodeStyle 应用到 FabricObject 及其子对象。
   *
   * 遍历 Group 的子对象，根据其 role 应用对应的样式属性：
   * - 'background': 设置 fill, stroke, strokeWidth, rx, ry
   * - 'name', 'label', 'text', 'attribute', 'expression', 'id': 设置 fill, fontFamily, fontSize
   * - 'port': 设置 fill（颜色保持不变）
   *
   * @param fObj - 目标 FabricObject
   * @param nodeStyle - 节点样式
   */
  applyStyle(fObj: FabricObject, nodeStyle: NodeStyle): void {
    // 设置 Group 级别的 opacity 和 shadow
    fObj.set({
      opacity: nodeStyle.opacity,
    });

    if (nodeStyle.showShadow) {
      fObj.set({
        shadow: {
          color: 'rgba(0,0,0,0.3)',
          blur: 5,
          offsetX: 3,
          offsetY: 3,
        } as FabricObject['shadow'],
      });
    } else {
      fObj.set({ shadow: null });
    }

    // 应用到子对象
    const children = getGroupChildren(fObj);
    for (const child of children) {
      this.applyStyleToChild(child, nodeStyle);
    }
  }

  /**
   * 根据子对象 role 应用对应的样式属性。
   */
  private applyStyleToChild(child: FabricObject, style: NodeStyle): void {
    const role = getChildRole(child);

    switch (role) {
      case ChildRole.Background:
      case ChildRole.PackageTab:
      case ChildRole.FoldCorner:
        child.set({
          fill: style.fillColor,
          stroke: style.strokeColor,
          strokeWidth: style.strokeWidth,
        });
        // 对 Rect 类型设置圆角
        if ('rx' in child) {
          child.set({ rx: style.borderRadius, ry: style.borderRadius });
        }
        break;

      case ChildRole.Name:
      case ChildRole.Label:
      case ChildRole.Text:
      case ChildRole.Attribute:
      case ChildRole.Expression:
      case ChildRole.Id:
      case ChildRole.ActorLabel:
        child.set({
          fill: style.fontColor,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
        });
        break;

      default:
        break;
    }
  }

  // ===========================================================================
  // 辅助方法（供子类使用）
  // ===========================================================================

  /**
   * 设置 FabricObject 的共有属性（id、elementType、role）。
   */
  protected setObjectData(
    obj: FabricObject,
    data: Record<string, unknown>,
  ): void {
    setChildData(obj, data);
  }

  /**
   * 获取 FabricObject 的自定义数据。
   */
  protected getObjectData(obj: FabricObject): Record<string, unknown> | undefined {
    return getChildData(obj);
  }

  /**
   * 创建带样式的基础 Group。
   */
  protected createStyledGroup(
    children: FabricObject[],
    element: T,
    style: NodeStyle,
    width: number,
    height: number,
  ): Group {
    const group = new Group(children, {
      left: 0,
      top: 0,
      width,
      height,
      subTargetCheck: false,
      selectable: true,
      evented: true,
    });

    // 设置 Group 的 data（InteractionHandler 需要 type 字段分类对象）
    setChildData(group, {
      id: element.id,
      type: 'element' as const,
      elementType: element.type,
    });

    // 应用样式
    this.applyStyle(group, style);

    return group;
  }

  /**
   * 在 Group 的子对象中按 role 查找。
   */
  protected findChildByRole(
    group: Group,
    role: string,
  ): FabricObject | undefined {
    return group.getObjects().find((c) => getChildRole(c) === role);
  }

  /**
   * 合并默认样式和传入样式。
   */
  protected mergeStyle(style?: NodeStyle): NodeStyle {
    return { ...DEFAULT_NODE_STYLE, ...style };
  }

  /**
   * 根据文本长度估算文本对象的宽度。
   */
  protected estimateTextWidth(text: string, fontSize: number): number {
    // 粗略估算：每个字符约占 fontSize * 0.6 px
    return Math.max(text.length * fontSize * 0.6, 40);
  }
}
