// ===========================================================================
// UI Slice — UI 状态管理
// 来源: 详细设计 §3.8
// ===========================================================================

import type { StateCreator } from 'zustand';
import type { AppStore, InteractionMode, UISlice } from '../types';

export const createUISlice: StateCreator<AppStore, [], [], UISlice> = (
  set,
) => ({
  selectedElementIds: [],
  interactionMode: 'select' as InteractionMode,
  toolboxFilter: '',
  treeFilter: '',
  isDirty: false,

  selectElements: (ids: string[]) =>
    set({
      selectedElementIds: ids,
    }),

  clearSelection: () =>
    set({
      selectedElementIds: [],
    }),

  setInteractionMode: (mode: InteractionMode) =>
    set({
      interactionMode: mode,
    }),

  setToolboxFilter: (filter: string) =>
    set({
      toolboxFilter: filter,
    }),

  setTreeFilter: (filter: string) =>
    set({
      treeFilter: filter,
    }),

  markDirty: () =>
    set({
      isDirty: true,
    }),

  markClean: () =>
    set({
      isDirty: false,
    }),
});
