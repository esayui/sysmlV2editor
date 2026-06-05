// ===========================================================================
// ConstraintRenderer — Constraint 渲染器（圆角矩形带参数）
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Rect, Text, Group, FabricObject } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type {
  ConstraintProperties,
  ConstraintParameter,
} from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const CONSTRAINT_MIN_WIDTH = 160;
const CONSTRAINT_MIN_HEIGHT = 70;
const HEADER_HEIGHT = 28;
const PARAM_ROW_HEIGHT = 16;
const PADDING = 10;

/**
 * Constraint 渲染器。
 *
 * 生成圆角矩形：
 * - 顶部：约束名称
 * - 中部：约束表达式
 * - 边缘：参数锚点
 *
 * 适用于 ConstraintDefinition, ConstraintUsage。
 */
export class ConstraintRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);
    const props = element.properties as Partial<ConstraintProperties>;

    const children: FabricObject[] = [];

    // -- 背景矩形（圆角） --
    const bgRect = new Rect({
      left: 0,
      top: 0,
      width: size.width,
      height: size.height,
      rx: mergedStyle.borderRadius,
      ry: mergedStyle.borderRadius,
      fill: mergedStyle.fillColor,
      stroke: mergedStyle.strokeColor,
      strokeWidth: mergedStyle.strokeWidth,
    });
    this.setObjectData(bgRect, { role: ChildRole.Background });
    children.push(bgRect);

    // -- 名称文本 --
    const nameText = new Text(element.name, {
      left: PADDING,
      top: 4,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
      fontWeight: 'bold',
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

    // -- 分隔线（使用 Rect 模拟） --
    const divider = new Rect({
      left: PADDING,
      top: HEADER_HEIGHT - 2,
      width: size.width - PADDING * 2,
      height: 1,
      fill: mergedStyle.strokeColor,
      stroke: null as unknown as string,
    });
    this.setObjectData(divider, { role: ChildRole.Background });
    children.push(divider);

    // -- 约束表达式 --
    const expr = props.expression ?? '';
    if (expr) {
      const exprText = new Text(expr, {
        left: PADDING + 4,
        top: HEADER_HEIGHT + 4,
        fontSize: mergedStyle.fontSize - 2,
        fontFamily: mergedStyle.fontFamily,
        fill: mergedStyle.fontColor,
        fontStyle: 'italic',
      });
      this.setObjectData(exprText, { role: ChildRole.Expression });
      children.push(exprText);
    }

    // -- 参数列表 --
    const params = props.parameters ?? [];
    let paramY = HEADER_HEIGHT + (expr ? 24 : 6);
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const paramLabel = this.formatParameter(param);
      const paramText = new Text(paramLabel, {
        left: PADDING + 4,
        top: paramY,
        fontSize: mergedStyle.fontSize - 2,
        fontFamily: mergedStyle.fontFamily,
        fill: mergedStyle.fontColor,
      });
      this.setObjectData(paramText, { role: ChildRole.Attribute, paramIndex: i });
      children.push(paramText);
      paramY += PARAM_ROW_HEIGHT;
    }

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
    const props = element.properties as Partial<ConstraintProperties>;

    // 更新名称
    const nameObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Name,
    ) as Text | undefined;
    if (nameObj) {
      nameObj.set({ text: element.name });
    }

    // 更新表达式
    const exprObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Expression,
    ) as Text | undefined;
    if (exprObj && props.expression) {
      exprObj.set({ text: props.expression });
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
        id: 'constraint-top',
        position: 'top',
        point: { x: cx, y: 0 },
        direction: 'inout',
      },
      {
        id: 'constraint-right',
        position: 'right',
        point: { x: bounds.width, y: cy },
        direction: 'inout',
      },
      {
        id: 'constraint-bottom',
        position: 'bottom',
        point: { x: cx, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'constraint-left',
        position: 'left',
        point: { x: 0, y: cy },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const props = element.properties as Partial<ConstraintProperties>;
    const expr = props.expression ?? '';
    const params = props.parameters ?? [];

    const nameWidth = this.estimateTextWidth(element.name, 14) + PADDING * 2;
    let maxWidth = nameWidth;

    if (expr) {
      maxWidth = Math.max(
        maxWidth,
        this.estimateTextWidth(expr, 12) + PADDING * 3,
      );
    }

    for (const param of params) {
      const label = this.formatParameter(param);
      maxWidth = Math.max(
        maxWidth,
        this.estimateTextWidth(label, 12) + PADDING * 3,
      );
    }

    const height =
      HEADER_HEIGHT +
      (expr ? 24 : 6) +
      params.length * PARAM_ROW_HEIGHT +
      PADDING;

    return {
      width: Math.max(CONSTRAINT_MIN_WIDTH, maxWidth),
      height: Math.max(CONSTRAINT_MIN_HEIGHT, height),
    };
  }

  private formatParameter(param: ConstraintParameter): string {
    const unit = param.unit ? ` [${param.unit}]` : '';
    return `${param.name}: ${param.type}${unit}`;
  }
}
