// ===========================================================================
// PortRenderer — PortDefinition / PortUsage 渲染器
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

const PORT_SIZE = 10;
const PORT_MIN_WIDTH = 40;
const PORT_LABEL_OFFSET = 14;

/**
 * Port 渲染器。
 *
 * 生成小方块（10x10），颜色按方向区分：
 * - in = 蓝色 (#4A90D9)
 * - out = 红色 (#D94A4A)
 * - inout = 紫色 (#9B59B6)
 *
 * 适用于 PortDefinition, PortUsage。
 */
export class PortRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const direction = this.getDirection(element);
    const portColor = this.getPortColor(direction);

    const children: FabricObject[] = [];

    // -- 端口方块 --
    const portRect = new Rect({
      left: 0,
      top: 0,
      width: PORT_SIZE,
      height: PORT_SIZE,
      fill: portColor,
      stroke: '#333333',
      strokeWidth: 1,
      rx: 1,
      ry: 1,
    });
    this.setObjectData(portRect, {
      role: ChildRole.Background,
      portDirection: direction,
    });
    children.push(portRect);

    // -- 端口名称（右侧） --
    const nameText = new Text(element.name, {
      left: PORT_LABEL_OFFSET,
      top: -2,
      fontSize: mergedStyle.fontSize - 2,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

    const totalWidth = Math.max(
      PORT_MIN_WIDTH,
      PORT_LABEL_OFFSET + this.estimateTextWidth(element.name, mergedStyle.fontSize - 2),
    );
    const totalHeight = PORT_SIZE + 4;

    const group = new Group(children, {
      left: 0,
      top: 0,
      width: totalWidth,
      height: totalHeight,
      subTargetCheck: false,
      selectable: true,
      evented: true,
    });

    this.setObjectData(group, {
      id: element.id,
      elementType: element.type,
    });

    // 应用样式（仅 opacity 和 shadow 在 group 级别）
    group.set({ opacity: mergedStyle.opacity });

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

    // 更新端口颜色（方向可能变更）
    const direction = this.getDirection(element);
    const bgObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Background,
    ) as Rect | undefined;
    if (bgObj) {
      bgObj.set({ fill: this.getPortColor(direction) });
    }

    // 应用样式
    this.applyStyle(fObj, mergedStyle);
    fObj.setCoords();
  }

  getPortAnchors(fObj: FabricObject): PortAnchor[] {
    const direction = this.getDirectionFromObject(fObj);

    return [
      {
        id: 'port-center',
        position: 'center',
        point: { x: PORT_SIZE / 2, y: PORT_SIZE / 2 },
        direction,
      },
      {
        id: 'port-top',
        position: 'top',
        point: { x: PORT_SIZE / 2, y: 0 },
        direction,
      },
      {
        id: 'port-bottom',
        position: 'bottom',
        point: { x: PORT_SIZE / 2, y: PORT_SIZE },
        direction,
      },
      {
        id: 'port-left',
        position: 'left',
        point: { x: 0, y: PORT_SIZE / 2 },
        direction,
      },
      {
        id: 'port-right',
        position: 'right',
        point: { x: PORT_SIZE, y: PORT_SIZE / 2 },
        direction,
      },
    ];
  }

  calculateSize(_element: SemanticElement): { width: number; height: number } {
    return { width: PORT_SIZE, height: PORT_SIZE };
  }

  // ===========================================================================
  // 辅助方法
  // ===========================================================================

  private getDirection(
    element: SemanticElement,
  ): 'in' | 'out' | 'inout' {
    const dir = (element.properties as Record<string, unknown>).direction as
      | string
      | undefined;
    if (dir === 'in' || dir === 'out' || dir === 'inout') return dir;
    return 'inout';
  }

  private getDirectionFromObject(fObj: FabricObject): 'in' | 'out' | 'inout' {
    const children = (fObj as Group).getObjects();
    const bgObj = children.find(
      (c) => this.getObjectData(c)?.role === ChildRole.Background,
    );
    if (bgObj) {
      const data = this.getObjectData(bgObj);
      return (data?.portDirection as 'in' | 'out' | 'inout') ?? 'inout';
    }
    return 'inout';
  }

  private getPortColor(direction: 'in' | 'out' | 'inout'): string {
    switch (direction) {
      case 'in':
        return '#4A90D9';
      case 'out':
        return '#D94A4A';
      case 'inout':
        return '#9B59B6';
    }
  }
}
