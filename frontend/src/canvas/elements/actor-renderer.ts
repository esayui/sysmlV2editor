// ===========================================================================
// ActorRenderer — Actor 渲染器（火柴人图标）
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Circle, Line, Text, Group, FabricObject } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const ACTOR_WIDTH = 40;
const HEAD_RADIUS = 8;
const HEAD_CENTER_Y = 12;
const BODY_TOP_Y = 22;
const BODY_BOTTOM_Y = 50;
const ARM_Y = 32;
const LABEL_OFFSET_Y = 56;
const PADDING = 4;

/**
 * Actor 渲染器。
 *
 * 生成火柴人图标 + 下方标签：
 * ```
 *    O       (头 - Circle)
 *   /|\      (身体 - Line)
 *   / \      (腿 - Line)
 * ActorName  (标签 - Text)
 * ```
 */
export class ActorRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);
    const centerX = size.width / 2;

    const children: FabricObject[] = [];

    // -- 头（圆圈） --
    const headCenter = new Circle({
      left: centerX - HEAD_RADIUS,
      top: HEAD_CENTER_Y - HEAD_RADIUS,
      radius: HEAD_RADIUS,
      fill: 'transparent',
      stroke: mergedStyle.fontColor,
      strokeWidth: 1.5,
    });
    this.setObjectData(headCenter, { role: ChildRole.ActorHead });
    children.push(headCenter);

    // -- 身体（竖线） --
    const bodyLine = new Line(
      [centerX, BODY_TOP_Y, centerX, BODY_BOTTOM_Y],
      {
        stroke: mergedStyle.fontColor,
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
      },
    );
    this.setObjectData(bodyLine, { role: ChildRole.ActorBody });
    children.push(bodyLine);

    // -- 手臂（横线） --
    const armLine = new Line(
      [centerX - 12, ARM_Y, centerX + 12, ARM_Y],
      {
        stroke: mergedStyle.fontColor,
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
      },
    );
    this.setObjectData(armLine, { role: ChildRole.ActorBody });
    children.push(armLine);

    // -- 左腿 --
    const leftLeg = new Line(
      [centerX, BODY_BOTTOM_Y, centerX - 10, BODY_BOTTOM_Y + 14],
      {
        stroke: mergedStyle.fontColor,
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
      },
    );
    this.setObjectData(leftLeg, { role: ChildRole.ActorBody });
    children.push(leftLeg);

    // -- 右腿 --
    const rightLeg = new Line(
      [centerX, BODY_BOTTOM_Y, centerX + 10, BODY_BOTTOM_Y + 14],
      {
        stroke: mergedStyle.fontColor,
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
      },
    );
    this.setObjectData(rightLeg, { role: ChildRole.ActorBody });
    children.push(rightLeg);

    // -- 标签文字 --
    const nameText = new Text(element.name, {
      left: 0,
      top: LABEL_OFFSET_Y,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
      textAlign: 'center',
    });
    // 计算标签居中
    const textWidth = this.estimateTextWidth(element.name, mergedStyle.fontSize);
    nameText.set({ left: (size.width - textWidth) / 2 });
    this.setObjectData(nameText, { role: ChildRole.ActorLabel });
    children.push(nameText);

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
    const mergedStyle = this.mergeStyle(style);
    const children = (fObj as Group).getObjects();

    // 更新标签文字
    const nameObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.ActorLabel,
    ) as Text | undefined;
    if (nameObj) {
      nameObj.set({ text: element.name });
      const textWidth = this.estimateTextWidth(
        element.name,
        mergedStyle.fontSize,
      );
      const size = this.calculateSize(element);
      nameObj.set({ left: (size.width - textWidth) / 2 });
    }

    this.applyStyle(fObj, mergedStyle);
    fObj.setCoords();
  }

  getPortAnchors(fObj: FabricObject): PortAnchor[] {
    const bounds = fObj.getBoundingRect();
    const cx = bounds.width / 2;

    return [
      {
        id: 'actor-top',
        position: 'top',
        point: { x: cx, y: 0 },
        direction: 'inout',
      },
      {
        id: 'actor-bottom',
        position: 'bottom',
        point: { x: cx, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'actor-center',
        position: 'center',
        point: { x: cx, y: bounds.height * 0.45 },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const textWidth = this.estimateTextWidth(element.name, 14);
    const width = Math.max(ACTOR_WIDTH, textWidth + PADDING);
    const height = LABEL_OFFSET_Y + 24;
    return { width, height };
  }
}
