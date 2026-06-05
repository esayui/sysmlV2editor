// ===========================================================================
// Toolbox Icons — 工具箱元素图标生成
// ===========================================================================

import React from 'react';

/** 分类 → 配色映射 */
const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  structure: { bg: '#E3F2FD', fg: '#1565C0' },
  behavior: { bg: '#E8F5E9', fg: '#2E7D32' },
  requirement: { bg: '#FFF3E0', fg: '#E65100' },
  parametric: { bg: '#F3E5F5', fg: '#7B1FA2' },
  relationship: { bg: '#ECEFF1', fg: '#546E7A' },
  annotation: { bg: '#FFFDE7', fg: '#F9A825' },
};

/** 元素类型 → 2 字母缩写 */
const ELEMENT_ABBREVIATIONS: Record<string, string> = {
  // 结构
  PartDefinition: 'BD',
  PartUsage: 'BU',
  PortDefinition: 'PD',
  PortUsage: 'PU',
  InterfaceDefinition: 'IF',
  Package: 'PK',
  // 行为
  ActionDefinition: 'AC',
  StateDefinition: 'ST',
  UseCase: 'UC',
  Actor: 'AT',
  // 需求
  RequirementDefinition: 'RQ',
  StakeholderRequirement: 'SR',
  // 参数
  ConstraintDefinition: 'CN',
  // 关系
  Connection: 'CO',
  Binding: 'BN',
  ObjectFlow: 'FL',
  Satisfy: 'SA',
  Verify: 'VE',
  // 注释
  Comment: 'CM',
};

/**
 * 根据元素类型和所属分类生成小色块图标。
 * 每个图标为带分类色系背景的 2 字母缩写。
 */
export function getToolboxIcon(
  elementType: string,
  categoryId: string,
): React.ReactNode {
  const colors = CATEGORY_COLORS[categoryId] ?? CATEGORY_COLORS.structure;
  const label =
    ELEMENT_ABBREVIATIONS[elementType] ??
    elementType.substring(0, 2).toUpperCase();

  return (
    <span
      className="toolbox-item-icon-inner"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 4,
        backgroundColor: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'monospace',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
