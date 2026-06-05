// ===========================================================================
// CommentRenderer — Comment 渲染器（折角矩形）
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Text, Group, FabricObject, Polygon } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const COMMENT_MIN_WIDTH = 160;
const COMMENT_MIN_HEIGHT = 60;
const FOLD_SIZE = 16;
const PADDING = 10;

/**
 * Comment 渲染器。
 *
 * 生成折角矩形，黄色背景：
 * ```
 * +--------------------------+
 * | Comment text             |
 * |                          |
 * |                    /     |
 * |                  /       |
 * +----------------+---------+
 * ```
 *
 * 折角通过 Polygon 绘制路径实现。
 */
export class CommentRenderer extends BaseElementRenderer<SemanticElement> {
  // 默认黄色，但可通过 NodeStyle 覆盖
  private static readonly DEFAULT_FILL = '#FFFFCC';
  private static readonly DEFAULT_STROKE = '#CCCC00';

  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    // 如果用户未指定样式，使用 Comment 默认样式
    const mergedStyle: NodeStyle = style
      ? { ...style }
      : {
          fillColor: CommentRenderer.DEFAULT_FILL,
          strokeColor: CommentRenderer.DEFAULT_STROKE,
          strokeWidth: 1.5,
          fontSize: 14,
          fontFamily: 'sans-serif',
          fontColor: '#333333',
          opacity: 1.0,
          borderRadius: 0,
          showShadow: false,
        };

    const size = this.calculateSize(element);
    const textContent = element.description || element.name;

    const children: FabricObject[] = [];

    // -- 折角矩形背景（Polygon） --
    const bgPolygon = this.createFoldedPolygon(
      size.width,
      size.height,
      FOLD_SIZE,
      mergedStyle,
    );
    this.setObjectData(bgPolygon, { role: ChildRole.Background });
    children.push(bgPolygon);

    // -- 折角三角形（阴影/对比色） --
    const foldTriangle = this.createFoldTriangle(
      size.width,
      size.height,
      FOLD_SIZE,
      mergedStyle,
    );
    this.setObjectData(foldTriangle, { role: ChildRole.FoldCorner });
    children.push(foldTriangle);

    // -- 注释文本 --
    const textObj = new Text(textContent, {
      left: PADDING,
      top: PADDING,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
    });
    this.setObjectData(textObj, { role: ChildRole.Text });
    children.push(textObj);

    const group = new Group(children, {
      left: 0,
      top: 0,
      width: size.width,
      height: size.height,
      subTargetCheck: false,
      selectable: true,
      evented: true,
    });

    this.setObjectData(group, {
      id: element.id,
      elementType: element.type,
    });

    group.set({ opacity: mergedStyle.opacity });
    if (mergedStyle.showShadow) {
      group.set({
        shadow: {
          color: 'rgba(0,0,0,0.3)',
          blur: 5,
          offsetX: 3,
          offsetY: 3,
        } as FabricObject['shadow'],
      });
    }

    return group;
  }

  update(
    fObj: FabricObject,
    element: SemanticElement,
    style?: NodeStyle,
  ): void {
    const mergedStyle = style
      ? this.mergeStyle(style)
      : this.mergeStyle({
          fillColor: CommentRenderer.DEFAULT_FILL,
          strokeColor: CommentRenderer.DEFAULT_STROKE,
          strokeWidth: 1.5,
          fontSize: 14,
          fontFamily: 'sans-serif',
          fontColor: '#333333',
          opacity: 1.0,
          borderRadius: 0,
          showShadow: false,
        });
    const children = (fObj as Group).getObjects();

    // 更新文本
    const textObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Text,
    ) as Text | undefined;
    if (textObj) {
      textObj.set({
        text: element.description || element.name,
      });
    }

    // 应用样式
    this.applyStyle(fObj, mergedStyle);
    fObj.setCoords();
  }

  getPortAnchors(fObj: FabricObject): PortAnchor[] {
    const bounds = fObj.getBoundingRect();
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    return [
      {
        id: 'comment-top',
        position: 'top',
        point: { x: cx, y: 0 },
        direction: 'inout',
      },
      {
        id: 'comment-right',
        position: 'right',
        point: { x: bounds.width, y: cy },
        direction: 'inout',
      },
      {
        id: 'comment-bottom',
        position: 'bottom',
        point: { x: cx, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'comment-left',
        position: 'left',
        point: { x: 0, y: cy },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const textContent = element.description || element.name;
    const textWidth = this.estimateTextWidth(textContent, 14) + PADDING * 2;
    return {
      width: Math.max(COMMENT_MIN_WIDTH, textWidth),
      height: COMMENT_MIN_HEIGHT,
    };
  }

  // ===========================================================================
  // 折角矩形路径
  // ===========================================================================

  /**
   * 创建折角矩形 Polygon（主矩形，不含折角部分）。
   *
   * 路径（顺时针）：
   * (0, 0) → (W, 0) → (W, H - F) → (W - F, H) → (0, H) → close
   */
  private createFoldedPolygon(
    w: number,
    h: number,
    fold: number,
    style: NodeStyle,
  ): Polygon {
    const points: { x: number; y: number }[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h - fold },
      { x: w - fold, y: h },
      { x: 0, y: h },
    ];

    return new Polygon(points, {
      left: 0,
      top: 0,
      fill: style.fillColor,
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
    });
  }

  /**
   * 创建折角三角形（补全视觉）。
   */
  private createFoldTriangle(
    w: number,
    h: number,
    fold: number,
    style: NodeStyle,
  ): Polygon {
    // 折角三角形：(W-F, H) → (W, H-F) → (W, H)
    const points: { x: number; y: number }[] = [
      { x: w - fold, y: h },
      { x: w, y: h - fold },
      { x: w, y: h },
    ];

    // 折角部分用稍亮的颜色
    return new Polygon(points, {
      left: 0,
      top: 0,
      fill: this.lightenColor(style.fillColor),
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
    });
  }

  /** 简单颜色变亮 */
  private lightenColor(hex: string): string {
    if (hex.startsWith('#') && hex.length === 7) {
      const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 20);
      const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 20);
      const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 20);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return hex;
  }
}
