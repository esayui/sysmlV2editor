// ===========================================================================
// TextRenderer — 纯文本渲染器
// 来源: 详细设计 §3.2.3
// ===========================================================================

import { Text as FabricText, FabricObject } from 'fabric';
import type { SemanticElement } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';
import {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
} from './base-renderer';

const TEXT_MIN_WIDTH = 40;
const TEXT_MIN_HEIGHT = 20;
const PADDING = 4;

/**
 * Text 渲染器。
 *
 * 生成纯文本 Fabric.js Text 对象（非 Group）。
 * 用于自由文本标注，不映射到特定 ElementType。
 *
 * 注意：TextRenderer 不通过 RendererRegistry 注册到特定 ElementType，
 * 而是作为独立渲染器供需要纯文本的场景使用。
 */
export class TextRenderer extends BaseElementRenderer<SemanticElement> {
  render(element: SemanticElement, style?: NodeStyle): FabricObject {
    const mergedStyle = this.mergeStyle(style);
    const textContent = element.description || element.name;

    const textObj = new FabricText(textContent, {
      left: 0,
      top: 0,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
    });

    this.setObjectData(textObj, {
      id: element.id,
      elementType: element.type,
      role: ChildRole.Text,
    });

    textObj.set({ opacity: mergedStyle.opacity });

    return textObj;
  }

  update(
    fObj: FabricObject,
    element: SemanticElement,
    style?: NodeStyle,
  ): void {
    const mergedStyle = this.mergeStyle(style);

    // 更新文字内容
    const textObj = fObj as FabricText;
    const textContent = element.description || element.name;
    textObj.set({
      text: textContent,
      fontSize: mergedStyle.fontSize,
      fontFamily: mergedStyle.fontFamily,
      fill: mergedStyle.fontColor,
      opacity: mergedStyle.opacity,
    });

    fObj.setCoords();
  }

  getPortAnchors(fObj: FabricObject): PortAnchor[] {
    const bounds = fObj.getBoundingRect();
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    return [
      {
        id: 'text-center',
        position: 'center',
        point: { x: cx, y: cy },
        direction: 'inout',
      },
    ];
  }

  calculateSize(element: SemanticElement): { width: number; height: number } {
    const textContent = element.description || element.name;
    const width = this.estimateTextWidth(textContent, 14) + PADDING;
    return {
      width: Math.max(TEXT_MIN_WIDTH, width),
      height: TEXT_MIN_HEIGHT,
    };
  }
}
