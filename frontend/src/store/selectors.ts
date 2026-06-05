// ===========================================================================
// Selectors — Zustand 派生数据选择器
// 来源: 详细设计 §3.8
// ===========================================================================

import type { SemanticElement, Relationship } from '@/types/semantic-model';
import type { DiagramNode, DiagramEdge } from '@/types/canvas-model';
import type { AppStore } from './types';

/**
 * 获取当前选中的语义元素
 * 返回 selectedElementIds 中第一个匹配的元素，未选中时返回 null
 */
export function useSelectedElement(
  state: AppStore,
): SemanticElement | null {
  const firstId = state.selectedElementIds[0];
  if (!firstId) return null;
  return (
    state.semanticModel.elements.find((e) => e.id === firstId) ?? null
  );
}

/**
 * 获取当前活动 Diagram 的节点列表
 */
export function useDiagramNodes(state: AppStore): DiagramNode[] {
  const { activeDiagramId, canvasModel } = state;
  if (!activeDiagramId) return [];
  const diagram = canvasModel.diagrams.find(
    (d) => d.id === activeDiagramId,
  );
  return diagram ? [...diagram.nodes] : [];
}

/**
 * 获取当前活动 Diagram 的连线列表
 */
export function useDiagramEdges(state: AppStore): DiagramEdge[] {
  const { activeDiagramId, canvasModel } = state;
  if (!activeDiagramId) return [];
  const diagram = canvasModel.diagrams.find(
    (d) => d.id === activeDiagramId,
  );
  return diagram ? [...diagram.edges] : [];
}

/**
 * 获取指定元素的子元素
 * 这是一个工厂函数，返回一个可在 useStore() 中使用的 selector
 *
 * 用法: const children = useStore(useElementChildren(elementId));
 */
export function useElementChildren(
  elementId: string,
): (state: AppStore) => SemanticElement[] {
  return (state: AppStore) =>
    state.semanticModel.elements.filter((e) => e.ownerId === elementId);
}

/**
 * 获取脏状态（是否有未保存修改）
 */
export function useDirtyStatus(state: AppStore): boolean {
  return state.isDirty;
}

/**
 * 获取所有顶级元素（无 ownerId 的元素）
 */
export function useRootElements(
  state: AppStore,
): SemanticElement[] {
  return state.semanticModel.elements.filter((e) => e.ownerId === null);
}

/**
 * 获取与指定元素相关的所有关系
 */
export function useElementRelationships(
  elementId: string,
): (state: AppStore) => Relationship[] {
  return (state: AppStore) =>
    state.semanticModel.relationships.filter(
      (r) => r.sourceId === elementId || r.targetId === elementId,
    );
}
