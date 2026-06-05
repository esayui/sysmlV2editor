// ===========================================================================
// BlockRenderer — PartDefinition / ItemDefinition 渲染器
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Rect, Text, Group, FabricObject } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type {
  PartDefProperties,
  PortRef,
  AttributeDef,
} from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

/** Block 默认尺寸 */
const BLOCK_MIN_WIDTH = 160;
const BLOCK_MIN_HEIGHT = 80;
const HEADER_HEIGHT = 30;
const ATTRIBUTE_ROW_HEIGHT = 18;
const PORT_SIZE = 10;
const PADDING = 10;

/**
 * Block 渲染器。
 *
 * 生成圆角矩形块，包含：
 * - 顶部：元素名称
 * - 中部：属性列表
 * - 边缘：端口指示方块
 *
 * 适用于 PartDefinition, ItemDefinition, InterfaceDefinition,
 * AttributeDefinition, EnumerationDefinition。
 */
export class BlockRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);
    const props = element.properties as Partial<PartDefProperties>;

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
      top: 6,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
      fontWeight: 'bold',
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

    // -- 属性列表 --
    const attrs = props.attributes ?? [];
    let attrY = HEADER_HEIGHT;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const label = this.formatAttribute(attr);
      const attrText = new Text(label, {
        left: PADDING + 4,
        top: attrY,
        fontSize: mergedStyle.fontSize - 2,
        fontFamily: mergedStyle.fontFamily,
        fill: mergedStyle.fontColor,
      });
      this.setObjectData(attrText, { role: ChildRole.Attribute, attrIndex: i });
      children.push(attrText);
      attrY += ATTRIBUTE_ROW_HEIGHT;
    }

    // -- 端口指示 --
    const ports = props.ports ?? [];
    for (const port of ports) {
      const portRect = this.createPortIndicator(
        port,
        size.width,
        size.height,
        mergedStyle,
      );
      this.setObjectData(portRect, { role: ChildRole.Port, portId: port.id });
      children.push(portRect);
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
    const groupBounds = fObj.getBoundingRect();
    const children = (fObj as Group).getObjects();
    const ports = children.filter(
      (c) => this.getObjectData(c)?.role === ChildRole.Port,
    );
    const result: PortAnchor[] = [];

    for (const port of ports) {
      const data = this.getObjectData(port);
      const portId = (data?.portId as string) ?? '';
      const direction = (data?.portDirection as 'in' | 'out' | 'inout') ?? 'inout';

      // Use getBoundingRect for absolute coordinates, then subtract group offset
      const portBounds = port.getBoundingRect();
      const relLeft = portBounds.left - groupBounds.left;
      const relTop = portBounds.top - groupBounds.top;
      const pw = portBounds.width;
      const ph = portBounds.height;
      const centerX = relLeft + pw / 2;
      const centerY = relTop + ph / 2;

      // 判断端口位置
      let position: PortAnchor['position'] = 'center';
      if (centerY <= PORT_SIZE + 2) position = 'top';
      else if (centerY >= groupBounds.height - PORT_SIZE - 2) position = 'bottom';
      else if (centerX <= PORT_SIZE + 2) position = 'left';
      else if (centerX >= groupBounds.width - PORT_SIZE - 2) position = 'right';

      result.push({
        id: portId,
        position,
        point: { x: centerX, y: centerY },
        direction,
      });
    }

    return result;
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const props = element.properties as Partial<PartDefProperties>;
    const attrs = props.attributes ?? [];
    const ports = props.ports ?? [];

    const nameWidth = this.estimateTextWidth(element.name, 14) + PADDING * 2;

    // 计算属性文本宽度
    let maxAttrWidth = 0;
    for (const attr of attrs) {
      const label = this.formatAttribute(attr);
      const aw = this.estimateTextWidth(label, 12) + PADDING * 3;
      maxAttrWidth = Math.max(maxAttrWidth, aw);
    }

    const width = Math.max(BLOCK_MIN_WIDTH, nameWidth, maxAttrWidth);
    const height =
      HEADER_HEIGHT +
      attrs.length * ATTRIBUTE_ROW_HEIGHT +
      PADDING +
      (ports.length > 0 ? PORT_SIZE + 4 : 0);

    return { width, height: Math.max(height, BLOCK_MIN_HEIGHT) };
  }

  // ===========================================================================
  // 内部辅助
  // ===========================================================================

  private formatAttribute(attr: AttributeDef): string {
    const mult = attr.multiplicity ? `[${attr.multiplicity}]` : '';
    const defVal = attr.defaultValue ? ` = ${attr.defaultValue}` : '';
    return `${attr.name}: ${attr.type}${mult}${defVal}`;
  }

  private createPortIndicator(
    port: PortRef,
    blockWidth: number,
    blockHeight: number,
    _style: NodeStyle,
  ): Rect {
    const portColor =
      port.direction === 'in'
        ? '#4A90D9'
        : port.direction === 'out'
          ? '#D94A4A'
          : '#9B59B6';

    // 根据方向确定位置
    let x = 0;
    let y = 0;
    switch (port.direction) {
      case 'in':
        x = PADDING;
        y = blockHeight - PORT_SIZE - 4;
        break;
      case 'out':
        x = blockWidth - PORT_SIZE - PADDING;
        y = blockHeight - PORT_SIZE - 4;
        break;
      case 'inout':
        x = (blockWidth - PORT_SIZE) / 2;
        y = blockHeight - PORT_SIZE - 4;
        break;
    }

    const rect = new Rect({
      left: x,
      top: y,
      width: PORT_SIZE,
      height: PORT_SIZE,
      fill: portColor,
      stroke: '#333333',
      strokeWidth: 1,
      rx: 1,
      ry: 1,
    });

    // Store port metadata on the object
    this.setObjectData(rect, {
      role: ChildRole.Port,
      portId: port.id,
      portDirection: port.direction,
    });

    return rect;
  }
}
