// ===========================================================================
// BlockRenderer — SysML 标准块渲染器
// 外观: 顶部名称栏(深色) + 属性分隔线 + 属性列表 + 端口指示
// ===========================================================================

import { Rect, Text, Group, FabricObject, Line } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { PartDefProperties, PortRef, AttributeDef } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import { BaseElementRenderer, type PortAnchor, ChildRole } from './base-renderer';

const BLOCK_MIN_WIDTH = 180;
const BLOCK_MIN_HEIGHT = 70;
const HEADER_HEIGHT = 34;
const ATTRIBUTE_ROW_HEIGHT = 20;
const PADDING = 12;
const PORT_SIZE = 12;

export class BlockRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);
    const props = element.properties as Partial<PartDefProperties>;
    const children: FabricObject[] = [];
    const headerColor = this.darken(mergedStyle.fillColor, 0.08);

    // -- 背景矩形 --
    const bg = new Rect({
      left: 0, top: 0, width: size.width, height: size.height,
      rx: mergedStyle.borderRadius, ry: mergedStyle.borderRadius,
      fill: mergedStyle.fillColor,
      stroke: mergedStyle.strokeColor,
      strokeWidth: mergedStyle.strokeWidth,
    });
    this.setObjectData(bg, { role: ChildRole.Background });
    children.push(bg);

    // -- 名称栏 (深色头部) --
    const header = new Rect({
      left: 0, top: 0, width: size.width, height: HEADER_HEIGHT,
      rx: mergedStyle.borderRadius, ry: mergedStyle.borderRadius,
      fill: headerColor,
      stroke: '', strokeWidth: 0,
    });
    // 覆盖底部圆角使其平坦
    this.setObjectData(header, { role: 'header' });
    children.push(header);

    // -- 分隔线 --
    const sepLine = new Line(
      [0, HEADER_HEIGHT, size.width, HEADER_HEIGHT],
      { stroke: mergedStyle.strokeColor, strokeWidth: 1, selectable: false, evented: false },
    );
    this.setObjectData(sepLine, { role: 'separator' });
    children.push(sepLine);

    // -- 名称 (白色加粗，居中于头部) --
    const nameText = new Text(element.name, {
      left: PADDING,
      top: (HEADER_HEIGHT - mergedStyle.fontSize) / 2,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: '#FFFFFF',
      fontWeight: 'bold',
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

    // -- «block» 构造型 --
    const stereoText = new Text('«block»', {
      left: size.width - 60,
      top: 4,
      fontSize: 9,
      fontFamily: mergedStyle.fontFamily,
      fill: 'rgba(255,255,255,0.7)',
      fontStyle: 'italic',
    });
    this.setObjectData(stereoText, { role: 'stereotype' });
    children.push(stereoText);

    // -- 属性列表 --
    const attrs = props.attributes ?? [];
    let attrY = HEADER_HEIGHT + 6;
    for (let i = 0; i < attrs.length; i++) {
      const label = this.formatAttribute(attrs[i]);
      const attrText = new Text(label, {
        left: PADDING + 4,
        top: attrY,
        fontSize: mergedStyle.fontSize - 1,
        fontFamily: mergedStyle.fontFamily,
        fill: '#333333',
      });
      this.setObjectData(attrText, { role: ChildRole.Attribute, attrIndex: i });
      children.push(attrText);
      attrY += ATTRIBUTE_ROW_HEIGHT;
    }

    // -- 端口指示 --
    const ports = props.ports ?? [];
    for (const port of ports) {
      const portRect = this.createPortIndicator(port, size.width, size.height);
      this.setObjectData(portRect, { role: ChildRole.Port, portId: port.id, portDirection: port.direction });
      children.push(portRect);
    }

    const group = this.createStyledGroup(children, element, mergedStyle, size.width, size.height);
    return group;
  }

  update(fObj: FabricObject, element: SemanticElement, style?: NodeStyle): void {
    const mergedStyle = this.mergeStyle(style);
    const children = (fObj as Group).getObjects();
    const nameObj = children.find((c) => this.getObjectData(c)?.role === ChildRole.Name) as Text | undefined;
    if (nameObj) nameObj.set({ text: element.name });
    this.applyStyle(fObj, mergedStyle);
    fObj.setCoords();
  }

  getPortAnchors(fObj: FabricObject): PortAnchor[] {
    const gb = fObj.getBoundingRect();
    const children = (fObj as Group).getObjects();
    const ports = children.filter((c) => this.getObjectData(c)?.role === ChildRole.Port);
    return ports.map((port) => {
      const data = this.getObjectData(port);
      const pb = port.getBoundingRect();
      return {
        id: (data?.portId as string) ?? '',
        position: this.getPortPosition(pb, gb),
        point: { x: pb.left - gb.left + pb.width / 2, y: pb.top - gb.top + pb.height / 2 },
        direction: (data?.portDirection as 'in' | 'out' | 'inout') ?? 'inout',
      };
    });
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const props = element.properties as Partial<PartDefProperties>;
    const attrs = props.attributes ?? [];
    const nameW = this.estimateTextWidth(element.name, 14) + PADDING * 2 + 60;
    let maxAttrW = 0;
    for (const a of attrs) {
      maxAttrW = Math.max(maxAttrW, this.estimateTextWidth(this.formatAttribute(a), 13) + PADDING * 3);
    }
    const w = Math.max(BLOCK_MIN_WIDTH, nameW, maxAttrW);
    const h = HEADER_HEIGHT + 6 + attrs.length * ATTRIBUTE_ROW_HEIGHT + PADDING;
    return { width: w, height: Math.max(h, BLOCK_MIN_HEIGHT) };
  }

  private formatAttribute(attr: AttributeDef): string {
    const mult = attr.multiplicity ? ` [${attr.multiplicity}]` : '';
    const def = attr.defaultValue ? ` = ${attr.defaultValue}` : '';
    return `${attr.name}: ${attr.type}${mult}${def}`;
  }

  private createPortIndicator(port: PortRef, bw: number, bh: number): Rect {
    const color = port.direction === 'in' ? '#4A90D9' : port.direction === 'out' ? '#D94A4A' : '#9B59B6';
    let x = 0, y = 0;
    if (port.direction === 'in') { x = -PORT_SIZE / 2; y = bh - PORT_SIZE / 2; }
    else if (port.direction === 'out') { x = bw - PORT_SIZE / 2; y = bh - PORT_SIZE / 2; }
    else { x = (bw - PORT_SIZE) / 2; y = bh - PORT_SIZE / 2; }

    return new Rect({
      left: x, top: y, width: PORT_SIZE, height: PORT_SIZE,
      fill: color, stroke: '#333', strokeWidth: 1, rx: 2, ry: 2,
    });
  }

  private getPortPosition(pb: { left: number; top: number; width: number; height: number }, gb: { width: number; height: number }): PortAnchor['position'] {
    const cy = pb.top + pb.height / 2;
    if (cy <= PORT_SIZE + 4) return 'top';
    if (cy >= gb.height - PORT_SIZE - 4) return 'bottom';
    const cx = pb.left + pb.width / 2;
    if (cx <= PORT_SIZE + 4) return 'left';
    if (cx >= gb.width - PORT_SIZE - 4) return 'right';
    return 'center';
  }

  private darken(hex: string, amount: number): string {
    try {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v * (1 - amount)))).toString(16).padStart(2, '0')).join('')}`;
    } catch { return hex; }
  }
}
