// ===========================================================================
// Element Renderers — 桶导出
// 来源: 详细设计 §3.2.3
// ===========================================================================

export {
  BaseElementRenderer,
  type PortAnchor,
  ChildRole,
  getChildRole,
  getGroupChildren,
} from './base-renderer';

export type { ChildRoleType } from './base-renderer';

export { RendererRegistry, globalRegistry } from './renderer-registry';

export { BlockRenderer } from './block-renderer';
export { BlockInstanceRenderer } from './block-instance-renderer';
export { PortRenderer } from './port-renderer';
export { PackageRenderer } from './package-renderer';
export { ActionRenderer } from './action-renderer';
export { StateRenderer } from './state-renderer';
export { ActorRenderer } from './actor-renderer';
export { UseCaseRenderer } from './usecase-renderer';
export { RequirementRenderer } from './requirement-renderer';
export { ConstraintRenderer } from './constraint-renderer';
export { CommentRenderer } from './comment-renderer';
export { TextRenderer } from './text-renderer';

import type { ElementType } from '@/types/semantic-model';
import { globalRegistry } from './renderer-registry';
import { BlockRenderer } from './block-renderer';
import { BlockInstanceRenderer } from './block-instance-renderer';
import { PortRenderer } from './port-renderer';
import { PackageRenderer } from './package-renderer';
import { ActionRenderer } from './action-renderer';
import { StateRenderer } from './state-renderer';
import { ActorRenderer } from './actor-renderer';
import { UseCaseRenderer } from './usecase-renderer';
import { RequirementRenderer } from './requirement-renderer';
import { ConstraintRenderer } from './constraint-renderer';
import { CommentRenderer } from './comment-renderer';
import type { ICanvasEngine } from '../canvas-engine';

/**
 * 注册所有 SysML 元素渲染器到全局注册表。
 *
 * 映射所有 ElementType 值到对应的 Renderer：
 *
 * 结构:
 * - PartDefinition, ItemDefinition, InterfaceDefinition, AttributeDefinition, EnumerationDefinition → BlockRenderer
 * - PartUsage, ItemUsage, InterfaceUsage, AttributeUsage → BlockInstanceRenderer
 * - PortDefinition, PortUsage → PortRenderer
 *
 * 行为:
 * - ActionDefinition, ActionUsage → ActionRenderer
 * - StateDefinition, StateUsage → StateRenderer
 * - Transition → StateRenderer (视为状态相关元素)
 * - Actor → ActorRenderer
 * - UseCase → UseCaseRenderer
 *
 * 需求/参数:
 * - RequirementDefinition, RequirementUsage, StakeholderRequirement → RequirementRenderer
 * - ConstraintDefinition, ConstraintUsage → ConstraintRenderer
 *
 * 组织/注释:
 * - Package → PackageRenderer
 * - Comment → CommentRenderer
 *
 * @param canvas - Canvas Engine 实例
 */
export function registerAllRenderers(canvas: ICanvasEngine): void {
  const blockRenderer = new BlockRenderer(canvas);
  const blockInstanceRenderer = new BlockInstanceRenderer(canvas);
  const portRenderer = new PortRenderer(canvas);
  const packageRenderer = new PackageRenderer(canvas);
  const actionRenderer = new ActionRenderer(canvas);
  const stateRenderer = new StateRenderer(canvas);
  const actorRenderer = new ActorRenderer(canvas);
  const usecaseRenderer = new UseCaseRenderer(canvas);
  const requirementRenderer = new RequirementRenderer(canvas);
  const constraintRenderer = new ConstraintRenderer(canvas);
  const commentRenderer = new CommentRenderer(canvas);

  // -- 结构 --
  globalRegistry.register('PartDefinition', blockRenderer);
  globalRegistry.register('ItemDefinition', blockRenderer);
  globalRegistry.register('InterfaceDefinition', blockRenderer);
  globalRegistry.register('AttributeDefinition', blockRenderer);
  globalRegistry.register('EnumerationDefinition', blockRenderer);

  globalRegistry.register('PartUsage', blockInstanceRenderer);
  globalRegistry.register('ItemUsage', blockInstanceRenderer);
  globalRegistry.register('InterfaceUsage', blockInstanceRenderer);
  globalRegistry.register('AttributeUsage', blockInstanceRenderer);

  globalRegistry.register('PortDefinition', portRenderer);
  globalRegistry.register('PortUsage', portRenderer);

  // -- 行为 --
  globalRegistry.register('ActionDefinition', actionRenderer);
  globalRegistry.register('ActionUsage', actionRenderer);
  globalRegistry.register('StateDefinition', stateRenderer);
  globalRegistry.register('StateUsage', stateRenderer);
  globalRegistry.register('Transition', stateRenderer);
  globalRegistry.register('Actor', actorRenderer);
  globalRegistry.register('UseCase', usecaseRenderer);

  // -- 需求 --
  globalRegistry.register('RequirementDefinition', requirementRenderer);
  globalRegistry.register('RequirementUsage', requirementRenderer);
  globalRegistry.register('StakeholderRequirement', requirementRenderer);

  // -- 参数 --
  globalRegistry.register('ConstraintDefinition', constraintRenderer);
  globalRegistry.register('ConstraintUsage', constraintRenderer);

  // -- 组织/注释 --
  globalRegistry.register('Package', packageRenderer);
  globalRegistry.register('Comment', commentRenderer);
}

/**
 * 所有已注册的 ElementType 列表（用于验证覆盖完整性）。
 */
export const ALL_ELEMENT_TYPES: ElementType[] = [
  'PartDefinition',
  'PartUsage',
  'ItemDefinition',
  'ItemUsage',
  'PortDefinition',
  'PortUsage',
  'InterfaceDefinition',
  'InterfaceUsage',
  'AttributeDefinition',
  'AttributeUsage',
  'EnumerationDefinition',
  'ActionDefinition',
  'ActionUsage',
  'StateDefinition',
  'StateUsage',
  'Transition',
  'Actor',
  'UseCase',
  'RequirementDefinition',
  'RequirementUsage',
  'StakeholderRequirement',
  'ConstraintDefinition',
  'ConstraintUsage',
  'Package',
  'Comment',
];
