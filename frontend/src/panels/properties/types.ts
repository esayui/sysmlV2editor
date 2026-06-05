// ===========================================================================
// Properties Panel Types
// 来源: 详细设计 §3.6.2
// ===========================================================================

import type { ElementType } from '@/types/semantic-model';

/** 下拉选择选项 */
export interface SelectOption {
  label: string;
  value: string;
}

/** 表格列定义（用于 attributes / parameters 等动态表格） */
export interface TableColumn {
  key: string;
  title: string;
  /** 列内编辑控件的类型 */
  editType: 'text' | 'select';
  options?: SelectOption[];
}

/** 表单字段定义 */
export interface PropertyField {
  /** 字段唯一 ID */
  id: string;
  /** 显示标签 */
  label: string;
  /** 控件类型 */
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'textarea'
    | 'color'
    | 'boolean'
    | 'reference'
    | 'tags'
    | 'table';
  /** 当前值 */
  value: unknown;
  /** 是否只读 */
  readonly: boolean;
  /** type='select' 或 'tags' 时的选项 */
  options?: SelectOption[];
  /** type='table' 时的列定义 */
  columns?: TableColumn[];
  /** type='table' 时的行数据 */
  rows?: Record<string, unknown>[];
  /** 校验函数：返回 null 表示通过，返回 string 为错误消息 */
  validator?: (value: unknown, siblingNames?: string[]) => string | null;
}

/** 属性面板的一个分区 */
export interface PropertySection {
  id: string;
  label: string;
  fields: PropertyField[];
}

/** 完整的属性表单 */
export interface PropertyForm {
  elementId: string;
  elementType: ElementType;
  sections: PropertySection[];
}
