// ===========================================================================
// Toolbox Data — 默认工具箱分类与条目
// 来源: 详细设计 §3.5.3
// ===========================================================================

import type { ToolboxCategory, ToolboxItem } from './types';

/**
 * 创建 ToolboxItem 的辅助函数，自动补全 icon 为 undefined。
 * icon 由 ToolboxPanel 运行时通过 getToolboxIcon() 动态生成。
 */
function createItem(
  overrides: Omit<ToolboxItem, 'icon'>,
): ToolboxItem {
  return {
    icon: undefined,
    ...overrides,
  };
}

/** 默认工具箱条目 —— 6 个分类，19 个条目 */
export const defaultToolboxItems: ToolboxCategory[] = [
  // =========================================================================
  // 1. 结构 (Structure) — 默认展开
  // =========================================================================
  {
    id: 'structure',
    label: '结构',
    expanded: true,
    items: [
      createItem({
        id: 'part-def',
        elementType: 'PartDefinition',
        label: '部件定义',
        englishLabel: 'Part Definition',
        hotkey: 'B',
        defaultStyle: {
          fillColor: '#E3F2FD',
          strokeColor: '#1565C0',
        },
      }),
      createItem({
        id: 'part-usage',
        elementType: 'PartUsage',
        label: '部件使用',
        englishLabel: 'Part Usage',
        hotkey: 'Shift+B',
        defaultStyle: {
          fillColor: '#E3F2FD',
          strokeColor: '#1565C0',
          strokeWidth: 1.5,
          fontColor: '#666666',
        },
      }),
      createItem({
        id: 'port-def',
        elementType: 'PortDefinition',
        label: '端口定义',
        englishLabel: 'Port Definition',
        hotkey: 'P',
        defaultStyle: {
          fillColor: '#B2DFDB',
          strokeColor: '#00695C',
        },
      }),
      createItem({
        id: 'port-usage',
        elementType: 'PortUsage',
        label: '端口使用',
        englishLabel: 'Port Usage',
        hotkey: 'Shift+P',
        defaultStyle: {
          fillColor: '#B2DFDB',
          strokeColor: '#00695C',
          strokeWidth: 1.5,
          fontColor: '#666666',
        },
      }),
      createItem({
        id: 'interface-def',
        elementType: 'InterfaceDefinition',
        label: '接口定义',
        englishLabel: 'Interface Definition',
        defaultStyle: {
          fillColor: '#E1BEE7',
          strokeColor: '#6A1B9A',
        },
      }),
      createItem({
        id: 'package',
        elementType: 'Package',
        label: '包',
        englishLabel: 'Package',
        defaultStyle: {
          fillColor: '#F3E5F5',
          strokeColor: '#4A148C',
          borderRadius: 0,
        },
      }),
    ],
  },

  // =========================================================================
  // 2. 行为 (Behavior) — 默认展开
  // =========================================================================
  {
    id: 'behavior',
    label: '行为',
    expanded: true,
    items: [
      createItem({
        id: 'action-def',
        elementType: 'ActionDefinition',
        label: '动作',
        englishLabel: 'Action',
        defaultStyle: {
          fillColor: '#E8F5E9',
          strokeColor: '#2E7D32',
          borderRadius: 12,
        },
      }),
      createItem({
        id: 'state-def',
        elementType: 'StateDefinition',
        label: '状态',
        englishLabel: 'State',
        defaultStyle: {
          fillColor: '#E8F5E9',
          strokeColor: '#2E7D32',
          borderRadius: 8,
        },
      }),
      createItem({
        id: 'use-case',
        elementType: 'UseCase',
        label: '用例',
        englishLabel: 'Use Case',
        defaultStyle: {
          fillColor: '#E8F5E9',
          strokeColor: '#2E7D32',
          borderRadius: 20,
        },
      }),
      createItem({
        id: 'actor',
        elementType: 'Actor',
        label: '参与者',
        englishLabel: 'Actor',
        defaultStyle: {
          fillColor: '#E8F5E9',
          strokeColor: '#2E7D32',
        },
      }),
    ],
  },

  // =========================================================================
  // 3. 需求 (Requirement) — 默认展开
  // =========================================================================
  {
    id: 'requirement',
    label: '需求',
    expanded: true,
    items: [
      createItem({
        id: 'requirement-def',
        elementType: 'RequirementDefinition',
        label: '需求',
        englishLabel: 'Requirement',
        hotkey: 'R',
        defaultStyle: {
          fillColor: '#FFF3E0',
          strokeColor: '#E65100',
        },
      }),
      createItem({
        id: 'stakeholder-req',
        elementType: 'StakeholderRequirement',
        label: '利益相关方需求',
        englishLabel: 'Stakeholder Requirement',
        defaultStyle: {
          fillColor: '#FFF3E0',
          strokeColor: '#E65100',
        },
      }),
    ],
  },

  // =========================================================================
  // 4. 参数 (Parametric) — 默认展开
  // =========================================================================
  {
    id: 'parametric',
    label: '参数',
    expanded: true,
    items: [
      createItem({
        id: 'constraint-def',
        elementType: 'ConstraintDefinition',
        label: '约束',
        englishLabel: 'Constraint',
        defaultStyle: {
          fillColor: '#F3E5F5',
          strokeColor: '#7B1FA2',
        },
      }),
    ],
  },

  // =========================================================================
  // 5. 关系 (Relationships) — 默认展开
  // =========================================================================
  {
    id: 'relationship',
    label: '关系',
    expanded: true,
    items: [
      createItem({
        id: 'connection',
        elementType: 'Connection' as ToolboxItem['elementType'],
        label: '连接',
        englishLabel: 'Connection',
        hotkey: 'C',
      }),
      createItem({
        id: 'binding',
        elementType: 'Binding' as ToolboxItem['elementType'],
        label: '绑定',
        englishLabel: 'Binding',
      }),
      createItem({
        id: 'object-flow',
        elementType: 'ObjectFlow' as ToolboxItem['elementType'],
        label: '流',
        englishLabel: 'Flow',
      }),
      createItem({
        id: 'satisfy',
        elementType: 'Satisfy' as ToolboxItem['elementType'],
        label: '满足',
        englishLabel: 'Satisfy',
      }),
      createItem({
        id: 'verify',
        elementType: 'Verify' as ToolboxItem['elementType'],
        label: '验证',
        englishLabel: 'Verify',
      }),
    ],
  },

  // =========================================================================
  // 6. 注释 (Annotation) — 默认折叠
  // =========================================================================
  {
    id: 'annotation',
    label: '注释',
    expanded: false,
    items: [
      createItem({
        id: 'comment',
        elementType: 'Comment',
        label: '注释',
        englishLabel: 'Comment',
        defaultStyle: {
          fillColor: '#FFFDE7',
          strokeColor: '#F9A825',
          borderRadius: 0,
        },
      }),
    ],
  },
];
