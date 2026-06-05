// ===========================================================================
// UseCaseRenderer — UseCase 渲染器（椭圆）
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Ellipse, Text, Group, FabricObject } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const USECASE_MIN_WIDTH = 140;
const USECASE_MIN_HEIGHT = 60;
const PADDING = 14;

/**
 * UseCase 渲染器。
 *
 * 生成椭圆，内部显示用例名称。
 */
export class UseCaseRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);

    const children: FabricObject[] = [];

    // -- 椭圆背景 --
    const ellipse = new Ellipse({
      left: size.width / 2,
      top: size.height / 2,
      rx: size.width / 2,
      ry: size.height / 2,
      fill: mergedStyle.fillColor,
      stroke: mergedStyle.strokeColor,
      strokeWidth: mergedStyle.strokeWidth,
      originX: 'center',
      originY: 'center',
    });
    this.setObjectData(ellipse, { role: ChildRole.Background });
    children.push(ellipse);

    // -- 名称文本（居中） --
    const nameText = new Text(element.name, {
      left: 0,
      top: 0,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
    });
    // 计算文本居中位置
    const textWidth = this.estimateTextWidth(element.name, mergedStyle.fontSize);
    nameText.set({
      left: (size.width - textWidth) / 2,
      top: (size.height - mergedStyle.fontSize) / 2,
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
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

    // 更新名称
    const nameObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Name,
    ) as Text | undefined;
    if (nameObj) {
      nameObj.set({ text: element.name });
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
        id: 'uc-top',
        position: 'top',
        point: { x: cx, y: 0 },
        direction: 'inout',
      },
      {
        id: 'uc-right',
        position: 'right',
        point: { x: bounds.width, y: cy },
        direction: 'inout',
      },
      {
        id: 'uc-bottom',
        position: 'bottom',
        point: { x: cx, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'uc-left',
        position: 'left',
        point: { x: 0, y: cy },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const nameWidth = this.estimateTextWidth(element.name, 14) + PADDING * 2;
    return {
      width: Math.max(USECASE_MIN_WIDTH, nameWidth),
      height: USECASE_MIN_HEIGHT,
    };
  }
}
