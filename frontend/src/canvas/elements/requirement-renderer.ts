// ===========================================================================
// RequirementRenderer — Requirement 渲染器（缺角矩形）
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Text, Group, FabricObject, Polygon } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { RequirementProperties } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const REQ_MIN_WIDTH = 180;
const REQ_MIN_HEIGHT = 80;
const NOTCH_SIZE = 16;
const HEADER_HEIGHT = 28;
const PADDING = 10;

/**
 * Requirement 渲染器。
 *
 * 生成缺角矩形：
 * ```
 * +---+---------------------+
 * |ID |                     |
 * +---+                     |
 * | Requirement text        |
 * |                         |
 * +-------------------------+
 * ```
 *
 * 使用 Polygon 绘制缺角路径。
 *
 * 适用于 RequirementDefinition, RequirementUsage, StakeholderRequirement。
 */
export class RequirementRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);
    const props = element.properties as Partial<RequirementProperties>;
    const reqId = props.requirementId ?? '';

    const children: FabricObject[] = [];

    // -- 缺角矩形背景（Polygon） --
    const bgPolygon = this.createNotchedPolygon(
      size.width,
      size.height,
      NOTCH_SIZE,
      mergedStyle,
    );
    this.setObjectData(bgPolygon, { role: ChildRole.Background });
    children.push(bgPolygon);

    // -- 需求 ID 文本（左上角） --
    if (reqId) {
      const idText = new Text(reqId, {
        left: PADDING,
        top: 4,
        fontSize: mergedStyle.fontSize - 2,
        fontFamily: mergedStyle.fontFamily,
        fill: mergedStyle.fontColor,
        fontWeight: 'bold',
      });
      this.setObjectData(idText, { role: ChildRole.Id });
      children.push(idText);
    }

    // -- 需求正文 --
    const reqText = props.text ?? element.description;
    const textContent = reqText || element.name;
    const bodyText = new Text(textContent, {
      left: PADDING,
      top: HEADER_HEIGHT,
      fontSize: mergedStyle.fontSize - 2,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
    });
    this.setObjectData(bodyText, { role: ChildRole.Text });
    children.push(bodyText);

    const group = this.createStyledGroup(
      children,
      element,
      mergedStyle,
      size.width,
      size.height,
    );

    return group;
  }

  update(
    fObj: FabricObject,
    element: SemanticElement,
    style?: NodeStyle,
  ): void {
    const mergedStyle = this.mergeStyle(style);
    const children = (fObj as Group).getObjects();
    const props = element.properties as Partial<RequirementProperties>;

    // 更新 ID
    const idObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Id,
    ) as Text | undefined;
    if (idObj) {
      idObj.set({ text: props.requirementId ?? '' });
    }

    // 更新正文
    const textObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Text,
    ) as Text | undefined;
    if (textObj) {
      textObj.set({ text: props.text ?? element.description ?? element.name });
    }

    this.applyStyle(fObj, mergedStyle);
    fObj.setCoords();
  }

  getPortAnchors(fObj: FabricObject): PortAnchor[] {
    const bounds = fObj.getBoundingRect();
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    return [
      {
        id: 'req-top',
        position: 'top',
        point: { x: cx, y: 0 },
        direction: 'inout',
      },
      {
        id: 'req-right',
        position: 'right',
        point: { x: bounds.width, y: cy },
        direction: 'inout',
      },
      {
        id: 'req-bottom',
        position: 'bottom',
        point: { x: cx, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'req-left',
        position: 'left',
        point: { x: 0, y: cy },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const props = element.properties as Partial<RequirementProperties>;
    const textContent = props.text ?? element.description ?? element.name;
    const textWidth = this.estimateTextWidth(textContent, 12) + PADDING * 2;
    const width = Math.max(REQ_MIN_WIDTH, textWidth);
    const height = REQ_MIN_HEIGHT;
    return { width, height };
  }

  // ===========================================================================
  // 缺角矩形路径
  // ===========================================================================

  /**
   * 创建缺角矩形 Polygon。
   *
   * 路径（顺时针）：
   * (0, NOTCH_SIZE) → (NOTCH_SIZE, NOTCH_SIZE) → (NOTCH_SIZE, 0) →
   * (W, 0) → (W, H) → (0, H) → close
   */
  private createNotchedPolygon(
    w: number,
    h: number,
    notch: number,
    style: NodeStyle,
  ): Polygon {
    const points: { x: number; y: number }[] = [
      { x: 0, y: notch },
      { x: notch, y: notch },
      { x: notch, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];

    const polygon = new Polygon(points, {
      left: 0,
      top: 0,
      fill: style.fillColor,
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
    });

    return polygon;
  }
}
