// ===========================================================================
// Semantic Slice — 语义模型状态管理
// 来源: 详细设计 §3.8.3
// ===========================================================================

import type { StateCreator } from 'zustand';
import type {
  SemanticElement,
  Relationship,
} from '@/types/semantic-model';
import type { AppStore, SemanticSlice } from '../types';

/** 创建空的 SemanticModel */
function createEmptySemanticModel() {
  return {
    id: '',
    name: '',
    elements: [] as SemanticElement[],
    relationships: [] as Relationship[],
    packages: [],
  };
}

/**
 * 收集待级联删除的元素 ID 集合
 * 从给定元素 ID 开始，递归收集所有 ownerId 指向它们的后代元素
 */
function collectDescendantIds(
  elements: SemanticElement[],
  rootId: string,
): Set<string> {
  const result = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;
    result.add(currentId);

    const children = elements.filter((e) => e.ownerId === currentId);
    for (const child of children) {
      if (!result.has(child.id)) {
        queue.push(child.id);
      }
    }
  }

  return result;
}

export const createSemanticSlice: StateCreator<
  AppStore,
  [],
  [],
  SemanticSlice
> = (set) => ({
  semanticModel: createEmptySemanticModel(),

  addElement: (element: SemanticElement) =>
    set((state) => ({
      semanticModel: {
        ...state.semanticModel,
        elements: [...state.semanticModel.elements, element],
      },
      isDirty: true,
    })),

  updateElement: (id: string, patch: Partial<SemanticElement>) =>
    set((state) => ({
      semanticModel: {
        ...state.semanticModel,
        elements: state.semanticModel.elements.map((e) =>
          e.id === id ? { ...e, ...patch } : e,
        ),
      },
      isDirty: true,
    })),

  removeElement: (id: string) =>
    set((state) => {
      const { elements, relationships } = state.semanticModel;

      // 1. 收集所有需要级联删除的元素 ID（自身 + 所有后代）
      const idsToRemove = collectDescendantIds(elements, id);

      // 2. 收集所有涉及这些元素的关系
      const relIdsToRemove = new Set<string>();
      for (const rel of relationships) {
        if (idsToRemove.has(rel.sourceId) || idsToRemove.has(rel.targetId)) {
          relIdsToRemove.add(rel.id);
        }
      }

      return {
        semanticModel: {
          ...state.semanticModel,
          elements: elements.filter((e) => !idsToRemove.has(e.id)),
          relationships: relationships.filter(
            (r) => !relIdsToRemove.has(r.id),
          ),
        },
        isDirty: true,
      };
    }),

  addRelationship: (rel: Relationship) =>
    set((state) => ({
      semanticModel: {
        ...state.semanticModel,
        relationships: [...state.semanticModel.relationships, rel],
      },
      isDirty: true,
    })),

  removeRelationship: (id: string) =>
    set((state) => ({
      semanticModel: {
        ...state.semanticModel,
        relationships: state.semanticModel.relationships.filter(
          (r) => r.id !== id,
        ),
      },
      isDirty: true,
    })),

  moveElement: (elementId: string, newOwnerId: string) =>
    set((state) => ({
      semanticModel: {
        ...state.semanticModel,
        elements: state.semanticModel.elements.map((e) =>
          e.id === elementId ? { ...e, ownerId: newOwnerId } : e,
        ),
      },
      isDirty: true,
    })),
});
