// ===========================================================================
// Toolbox Types — 工具箱面板类型定义
// 来源: 详细设计 §3.5.2
// ===========================================================================

import type { ReactNode } from 'react';
import type { ElementType } from '@/types/semantic-model';
import type { NodeStyle } from '@/types/canvas-model';

/**
 * 工具箱中可创建的元素类型标识。
 * 包含 ElementType（语义元素）和部分 RelationshipType（关系创建类型）。
 */
export type ToolboxItemType =
  | ElementType
  | 'Connection'
  | 'Binding'
  | 'ObjectFlow'
  | 'Satisfy'
  | 'Verify';

/** 工具箱分类 */
export interface ToolboxCategory {
  /** 分类唯一标识（如 'structure'） */
  id: string;
  /** 中文显示名称 */
  label: string;
  /** 分类图标（可选） */
  icon?: ReactNode;
  /** 是否展开 */
  expanded: boolean;
  /** 分类下的工具箱条目 */
  items: ToolboxItem[];
}

/** 工具箱条目（可创建的元素/关系） */
export interface ToolboxItem {
  /** 条目唯一标识 */
  id: string;
  /** 元素类型 */
  elementType: ToolboxItemType;
  /** 中文标签 */
  label: string;
  /** 英文标签（用于搜索匹配） */
  englishLabel: string;
  /** 图标（可选，组件运行时补全） */
  icon?: ReactNode;
  /** 快捷键提示（如 'B'） */
  hotkey?: string;
  /** 默认图形样式 */
  defaultStyle?: Partial<NodeStyle>;
}
