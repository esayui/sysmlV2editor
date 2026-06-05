// ===========================================================================
// PackageRenderer — Package 渲染器（文件夹/Tab 形状）
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

const TAB_WIDTH = 80;
const TAB_HEIGHT = 20;
const PACKAGE_MIN_WIDTH = 160;
const PACKAGE_MIN_HEIGHT = 80;
const BODY_TOP_OFFSET = TAB_HEIGHT - 1;
const PADDING = 10;

/**
 * Package 渲染器。
 *
 * 生成带 Tab 的文件夹形矩形：
 * ```
 * +------+
 * | Pkg  |
 * +------+---------------+
 * |                      |
 * |   (内容区域)          |
 * |                      |
 * +----------------------+
 * ```
 */
export class PackageRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const size = this.calculateSize(element);

    const children: FabricObject[] = [];

    // -- Tab（文件夹标签） --
    const tabRect = new Rect({
      left: 0,
      top: 0,
      width: TAB_WIDTH,
      height: TAB_HEIGHT,
      rx: mergedStyle.borderRadius,
      ry: mergedStyle.borderRadius,
      fill: mergedStyle.fillColor,
      stroke: mergedStyle.strokeColor,
      strokeWidth: mergedStyle.strokeWidth,
    });
    this.setObjectData(tabRect, { role: ChildRole.PackageTab });
    children.push(tabRect);

    // -- 主体矩形 --
    const bodyRect = new Rect({
      left: 0,
      top: BODY_TOP_OFFSET,
      width: size.width,
      height: size.height - BODY_TOP_OFFSET,
      rx: mergedStyle.borderRadius,
      ry: mergedStyle.borderRadius,
      fill: mergedStyle.fillColor,
      stroke: mergedStyle.strokeColor,
      strokeWidth: mergedStyle.strokeWidth,
    });
    this.setObjectData(bodyRect, { role: ChildRole.Background });
    children.push(bodyRect);

    // -- Tab 中的名称文本 --
    const nameText = new Text(element.name, {
      left: PADDING,
      top: 3,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
      fontWeight: 'bold',
    });
    this.setObjectData(nameText, { role: ChildRole.Name });
    children.push(nameText);

    // 遮盖 bodyRect 顶部穿过 tab 的边框线（用填充色遮盖）
    const coverRect = new Rect({
      left: 1,
      top: BODY_TOP_OFFSET - 1,
      width: TAB_WIDTH - 2,
      height: 3,
      fill: mergedStyle.fillColor,
      stroke: null as unknown as string,
    });
    this.setObjectData(coverRect, { role: ChildRole.Background });
    children.push(coverRect);

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
    const bounds = fObj.getBoundingRect();
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;

    return [
      {
        id: 'pkg-top',
        position: 'top',
        point: { x: centerX, y: 0 },
        direction: 'inout',
      },
      {
        id: 'pkg-right',
        position: 'right',
        point: { x: bounds.width, y: centerY },
        direction: 'inout',
      },
      {
        id: 'pkg-bottom',
        position: 'bottom',
        point: { x: centerX, y: bounds.height },
        direction: 'inout',
      },
      {
        id: 'pkg-left',
        position: 'left',
        point: { x: 0, y: centerY },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const nameWidth = this.estimateTextWidth(element.name, 14) + PADDING * 2;
    const width = Math.max(PACKAGE_MIN_WIDTH, nameWidth, TAB_WIDTH + 20);
    const height = PACKAGE_MIN_HEIGHT;
    return { width, height };
  }
}
