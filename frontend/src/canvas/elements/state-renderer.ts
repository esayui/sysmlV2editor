// ===========================================================================
// StateRenderer — StateDefinition / StateUsage 渲染器
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Rect, Text, Group, FabricObject } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const STATE_MIN_WIDTH = 100;
const STATE_MIN_HEIGHT = 50;
const PADDING = 12;

/**
 * State 渲染器。
 *
 * 生成圆角矩形，显示状态名称。
 * 适用于 StateDefinition, StateUsage。
 */
export class StateRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);

    const children: FabricObject[] = [];

    // -- 背景矩形（大圆角） --
    const bgRect = new Rect({
      left: 0,
      top: 0,
      width: size.width,
      height: size.height,
      rx: Math.min(size.width, size.height) / 2,
      ry: Math.min(size.width, size.height) / 2,
      fill: mergedStyle.fillColor,
      stroke: mergedStyle.strokeColor,
      strokeWidth: mergedStyle.strokeWidth,
    });
    this.setObjectData(bgRect, { role: ChildRole.Background });
    children.push(bgRect);

    // -- 名称文本（居中） --
    const nameText = new Text(element.name, {
      left: PADDING,
      top: (size.height - mergedStyle.fontSize) / 2,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

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

    const nameObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Name,
    ) as Text | undefined;
    if (nameObj) {
      nameObj.set({ text: element.name });
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
        id: 'state-top',
        position: 'top',
        point: { x: cx, y: 0 },
        direction: 'inout',
      },
      {
        id: 'state-right',
        position: 'right',
        point: { x: bounds.width, y: cy },
        direction: 'inout',
      },
      {
        id: 'state-bottom',
        position: 'bottom',
        point: { x: cx, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'state-left',
        position: 'left',
        point: { x: 0, y: cy },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const nameWidth = this.estimateTextWidth(element.name, 14) + PADDING * 2;
    return {
      width: Math.max(STATE_MIN_WIDTH, nameWidth),
      height: STATE_MIN_HEIGHT,
    };
  }
}
