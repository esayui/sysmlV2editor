// ===========================================================================
// BlockRenderer — SysML 标准块渲染器
// 外观: 顶部名称栏(深色) + 属性分隔线 + 属性列表 + 端口指示
// ===========================================================================

import { Rect, Text, Group, FabricObject, Line, FabricText } from 'fabric';
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

    // -- «block» 构造型 (居中) --
    const stereoText = new Text('«block»', {
      left: 0,
      top: 3,
      fontSize: 10,
      fontFamily: mergedStyle.fontFamily,
      fill: 'rgba(255,255,255,0.8)',
      fontStyle: 'italic',
      textAlign: 'center',
      width: size.width,
    });
    this.setObjectData(stereoText, { role: 'stereotype' });
    children.push(stereoText);

    // -- 名称 (居中，白色加粗，超宽时用 FabricText 换行) --
    const maxNameWidth = size.width * 0.8;
    const nameText = new FabricText(element.name, {
      left: (size.width - maxNameWidth) / 2,
      top: 15,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: '#FFFFFF',
      fontWeight: 'bold',
      textAlign: 'center',
      width: maxNameWidth,
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

    // 根据实际文本高度动态调整布局
    const actualNameHeight = (nameText as unknown as { height?: number }).height ?? mergedStyle.fontSize + 4;
    const headerActualHeight = Math.max(HEADER_HEIGHT, 15 + actualNameHeight + 6);
    header.set({ height: headerActualHeight });
    sepLine.set({ y2: headerActualHeight, top: 0, left: 0, x1: 0, y1: headerActualHeight, x2: size.width });
    const totalH = headerActualHeight + 6 + (props.attributes ?? []).length * ATTRIBUTE_ROW_HEIGHT + PADDING;
    bg.set({ height: Math.max(totalH, BLOCK_MIN_HEIGHT) });

    // -- 属性列表 --
    const attrs = props.attributes ?? [];
    let attrY = headerActualHeight + 6;
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
    const group = fObj as Group;
    const children = group.getObjects();
    const nameObj = children.find((c) => this.getObjectData(c)?.role === ChildRole.Name) as Text | undefined;
    if (nameObj) {
      const bw = group.width;
      const maxW = bw * 0.8;
      nameObj.set({ text: element.name, width: maxW, left: (bw - maxW) / 2 });
    }
    // Update stereotype if element type changed
    const stereoObj = children.find((c) => this.getObjectData(c)?.role === 'stereotype') as Text | undefined;
    if (stereoObj) {
      const stereotypeMap: Record<string, string> = {
        PartDefinition: '«block»', ItemDefinition: '«item»',
        InterfaceDefinition: '«interface»', AttributeDefinition: '«attribute»',
        EnumerationDefinition: '«enumeration»',
      };
      stereoObj.set({ text: stereotypeMap[element.type] ?? '«block»' });
    }
    this.applyStyle(group, mergedStyle);
    group.setCoords();
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
    // 名称可能换行，预估更宽的宽度
    const nameW = Math.min(this.estimateTextWidth(element.name, 14), 400) + PADDING * 2 + 20;
    let maxAttrW = 0;
    for (const a of attrs) {
      maxAttrW = Math.max(maxAttrW, this.estimateTextWidth(this.formatAttribute(a), 13) + PADDING * 3);
    }
    const w = Math.max(BLOCK_MIN_WIDTH, nameW, maxAttrW);
    // 头部高度: 构造型行 + 名称行 + padding
    const estHeaderH = HEADER_HEIGHT + (element.name.length > 20 ? 18 : 0);
    const h = estHeaderH + 6 + attrs.length * ATTRIBUTE_ROW_HEIGHT + PADDING;
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
