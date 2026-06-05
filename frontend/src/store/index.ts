// ===========================================================================
// State Store — Zustand 全局状态管理中心
// 来源: 详细设计 §3.8.3
// ===========================================================================

import { create } from 'zustand';
import type { AppStore } from './types';
import { createSemanticSlice } from './slices/semantic-slice';
import { createCanvasSlice } from './slices/canvas-slice';
import { createUISlice } from './slices/ui-slice';

/**
 * 全局 Store
 *
 * 使用 Zustand Slice 模式组合语义模型、画布模型、UI 状态三个切片。
 * 所有状态变更通过 Store 提供的 actions 进行，确保不可变更新。
 */
const useStore = create<AppStore>()((...a) => ({
  ...createSemanticSlice(...a),
  ...createCanvasSlice(...a),
  ...createUISlice(...a),
}));

export default useStore;

// Re-export types
export type { AppStore, InteractionMode } from './types';
export * from './selectors';
