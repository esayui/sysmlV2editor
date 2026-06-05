// ===========================================================================
// RendererRegistry — 渲染器注册表（工厂模式）
// 来源: 详细设计 §3.2.4
// ===========================================================================

import { FabricObject } from 'fabric';
import type { SemanticElement, ElementType } from '@/types/semantic-model';
import type { Point } from '@/types/canvas-model';
import type { BaseElementRenderer } from './base-renderer';

/**
 * 渲染器注册表。
 *
 * 管理 ElementType → BaseElementRenderer 的映射，
 * 提供工厂方法从语义元素创建画布对象。
 */
export class RendererRegistry {
  private renderers: Map<ElementType, BaseElementRenderer<SemanticElement>> =
    new Map();

  /**
   * 注册一个渲染器。
   *
   * @param type - 元素类型
   * @param renderer - 渲染器实例
   */
  register(
    type: ElementType,
    renderer: BaseElementRenderer<SemanticElement>,
  ): void {
    this.renderers.set(type, renderer);
  }

  /**
   * 获取指定类型的渲染器。
   *
   * @param type - 元素类型
   * @returns 渲染器实例
   * @throws 如果未注册对应类型的渲染器
   */
  get(type: ElementType): BaseElementRenderer<SemanticElement> {
    const renderer = this.renderers.get(type);
    if (!renderer) {
      throw new Error(
        `[RendererRegistry] No renderer registered for element type: "${type}"`,
      );
    }
    return renderer;
  }

  /**
   * 检查是否已注册指定类型的渲染器。
   */
  has(type: ElementType): boolean {
    return this.renderers.has(type);
  }

  /**
   * 获取已注册的所有元素类型。
   */
  getRegisteredTypes(): ElementType[] {
    return Array.from(this.renderers.keys());
  }

  /**
   * 工厂方法：从语义元素创建画布对象。
   *
   * 1. 根据 element.type 查找对应的 Renderer
   * 2. 调用 renderer.render(element) 生成 FabricObject
   * 3. 如果指定了 position，设置对象坐标
   *
   * @param element - 语义元素
   * @param position - 画布坐标（可选）
   * @returns Fabric.js 可视化对象
   * @throws 如果元素类型未注册渲染器
   */
  createCanvasObject(
    element: SemanticElement,
    position?: Point,
  ): FabricObject {
    const renderer = this.get(element.type);
    const fObj = renderer.render(element);

    if (position) {
      fObj.set({ left: position.x, top: position.y });
    }

    fObj.setCoords();
    return fObj;
  }
}

/**
 * 全局渲染器注册表单例。
 * 在应用启动时注册所有渲染器。
 */
export const globalRegistry = new RendererRegistry();
