// ===========================================================================
// PropertiesPanel — 属性面板 React 组件
// 来源: 详细设计 §3.6, 任务 M-FE-06
// ===========================================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  Collapse,
  Input,
  InputNumber,
  Select,
  Switch,
  ColorPicker,
  Button,
  Space,
  Empty,
  Typography,
  Divider,
} from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import useStore from '@/store/index';
import type { SemanticElement } from '@/types/semantic-model';
import type { DiagramNode, NodeStyle } from '@/types/canvas-model';
import { PropertyFormFactory } from './property-form-factory';
import type { PropertyForm, PropertySection, PropertyField } from './types';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ---- 元素类型显示配置 ----

interface ElementTypeMeta {
  label: string;
  icon: string;
}

const ELEMENT_TYPE_META: Partial<Record<string, ElementTypeMeta>> = {
  PartDefinition: { label: 'Part Definition', icon: '◣' },
  PartUsage: { label: 'Part Usage', icon: '◢' },
  ItemDefinition: { label: 'Item Definition', icon: '◣' },
  ItemUsage: { label: 'Item Usage', icon: '◢' },
  PortDefinition: { label: 'Port Definition', icon: '◉' },
  PortUsage: { label: 'Port Usage', icon: '◎' },
  InterfaceDefinition: { label: 'Interface Def.', icon: '▣' },
  InterfaceUsage: { label: 'Interface Usage', icon: '▢' },
  AttributeDefinition: { label: 'Attribute Def.', icon: '▶' },
  AttributeUsage: { label: 'Attribute Usage', icon: '▷' },
  EnumerationDefinition: { label: 'Enumeration Def.', icon: '■' },
  ActionDefinition: { label: 'Action', icon: '▶' },
  ActionUsage: { label: 'Action Usage', icon: '▷' },
  StateDefinition: { label: 'State', icon: '⬤' },
  StateUsage: { label: 'State Usage', icon: '◯' },
  Transition: { label: 'Transition', icon: '→' },
  Actor: { label: 'Actor', icon: '☺' },
  UseCase: { label: 'Use Case', icon: '⬭' },
  RequirementDefinition: { label: 'Requirement', icon: '◈' },
  RequirementUsage: { label: 'Requirement Usage', icon: '◇' },
  StakeholderRequirement: { label: 'Stakeholder Req.', icon: '◆' },
  ConstraintDefinition: { label: 'Constraint', icon: '⧊' },
  ConstraintUsage: { label: 'Constraint Usage', icon: '⧋' },
  Package: { label: 'Package', icon: '📦' },
  Comment: { label: 'Comment', icon: '💬' },
};

// ---- 辅助函数 ----

/** 在所有 Diagram 中查找关联某语义元素的画布节点 */
function findCanvasNodeByElementId(
  elementId: string,
): DiagramNode | null {
  const state = useStore.getState();
  for (const diagram of state.canvasModel.diagrams) {
    const node = diagram.nodes.find(
      (n) => n.semanticElementId === elementId,
    );
    if (node) return node;
  }
  return null;
}

/** 在所有 Diagram 中查找多个语义元素对应的画布节点 */
function findCanvasNodesByElementIds(
  elementIds: string[],
): DiagramNode[] {
  const state = useStore.getState();
  const result: DiagramNode[] = [];
  for (const diagram of state.canvasModel.diagrams) {
    for (const node of diagram.nodes) {
      if (elementIds.includes(node.semanticElementId)) {
        result.push(node);
      }
    }
  }
  return result;
}

/** 获取同级元素名称列表（同 ownerId 且排除自身） */
function getSiblingNames(element: SemanticElement): string[] {
  const state = useStore.getState();
  return state.semanticModel.elements
    .filter(
      (e) =>
        e.ownerId === element.ownerId &&
        e.id !== element.id,
    )
    .map((e) => e.name);
}

/** 面板容器样式 */
const panelStyle: React.CSSProperties = {
  height: '100%',
  overflow: 'auto',
  padding: '8px',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
};

// ===========================================================================
// 字段渲染器
// ===========================================================================

interface FieldRendererProps {
  field: PropertyField;
  onChange: (value: unknown) => void;
  errorMessage: string | null;
}

/** 根据 field.type 渲染对应的表单控件 */
const FieldRenderer: React.FC<FieldRendererProps> = React.memo(
  ({ field, onChange, errorMessage }) => {
    const status = errorMessage ? 'error' : undefined;

    switch (field.type) {
      case 'text':
      case 'reference':
        return (
          <Input
            value={String(field.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            disabled={field.readonly}
            status={status}
            size="small"
          />
        );

      case 'textarea':
        return (
          <TextArea
            value={String(field.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            disabled={field.readonly}
            rows={3}
            size="small"
          />
        );

      case 'number':
        return (
          <InputNumber
            value={Number(field.value ?? 0)}
            onChange={(v) => onChange(v ?? 0)}
            disabled={field.readonly}
            min={0}
            size="small"
            style={{ width: '100%' }}
            status={status}
          />
        );

      case 'select':
        return (
          <Select
            value={String(field.value ?? '')}
            onChange={(v) => onChange(v)}
            disabled={field.readonly}
            options={field.options}
            size="small"
            style={{ width: '100%' }}
            status={status}
          />
        );

      case 'boolean':
        return (
          <Switch
            checked={Boolean(field.value)}
            onChange={(v) => onChange(v)}
            disabled={field.readonly}
            size="small"
          />
        );

      case 'color':
        return (
          <ColorPicker
            value={String(field.value ?? '#FFFFFF')}
            onChange={(color) => onChange(color.toHexString())}
            disabled={field.readonly}
            size="small"
            style={{ width: '100%' }}
          />
        );

      case 'tags':
        return (
          <Select
            mode="tags"
            value={
              Array.isArray(field.value)
                ? (field.value as string[])
                : []
            }
            onChange={(v) => onChange(v)}
            disabled={field.readonly}
            size="small"
            style={{ width: '100%' }}
            placeholder="输入后回车添加"
          />
        );

      case 'table':
        return <DynamicTable field={field} onChange={onChange} />;

      default:
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            不支持的字段类型
          </Text>
        );
    }
  },
);

FieldRenderer.displayName = 'FieldRenderer';

// ---- 动态表格（attributes / parameters） ----

interface DynamicTableProps {
  field: PropertyField;
  onChange: (value: unknown) => void;
}

const DynamicTable: React.FC<DynamicTableProps> = ({ field, onChange }) => {
  const rows = Array.isArray(field.rows)
    ? (field.rows as Record<string, unknown>[])
    : [];
  const columns = field.columns ?? [];

  const handleCellChange = useCallback(
    (rowIndex: number, columnKey: string, value: unknown) => {
      const newRows = rows.map((row, idx) =>
        idx === rowIndex ? { ...row, [columnKey]: value } : row,
      );
      onChange(newRows);
    },
    [rows, onChange],
  );

  const handleAddRow = useCallback(() => {
    const newRow: Record<string, unknown> = {};
    for (const col of columns) {
      newRow[col.key] = '';
    }
    newRow.key = `row-${Date.now()}`;
    const newRows = [...rows, newRow];
    onChange(newRows);
  }, [rows, columns, onChange]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      const newRows = rows.filter((_, idx) => idx !== rowIndex);
      onChange(newRows);
    },
    [rows, onChange],
  );

  const renderCellInput = (
    row: Record<string, unknown>,
    rowIndex: number,
    col: (typeof columns)[number],
  ) => {
    const cellValue = row[col.key];

    if (col.editType === 'select') {
      return (
        <Select
          value={String(cellValue ?? '')}
          onChange={(v) => handleCellChange(rowIndex, col.key, v)}
          options={col.options}
          size="small"
          style={{ width: '100%' }}
          disabled={field.readonly}
        />
      );
    }

    return (
      <Input
        value={String(cellValue ?? '')}
        onChange={(e) =>
          handleCellChange(rowIndex, col.key, e.target.value)
        }
        size="small"
        disabled={field.readonly}
      />
    );
  };

  return (
    <div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ background: '#fafafa' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '4px 8px',
                  textAlign: 'left',
                  borderBottom: '1px solid #e8e8e8',
                  fontWeight: 500,
                }}
              >
                {col.title}
              </th>
            ))}
            {!field.readonly && (
              <th
                style={{
                  width: 36,
                  padding: '4px 8px',
                  borderBottom: '1px solid #e8e8e8',
                }}
              />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={String(row.key ?? rowIndex)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '2px 4px',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  {renderCellInput(row, rowIndex, col)}
                </td>
              ))}
              {!field.readonly && (
                <td
                  style={{
                    padding: '2px 4px',
                    borderBottom: '1px solid #f0f0f0',
                    textAlign: 'center',
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteRow(rowIndex)}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!field.readonly && (
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAddRow}
          style={{ marginTop: 4, width: '100%' }}
        >
          添加
        </Button>
      )}
    </div>
  );
};

// ===========================================================================
// Section 渲染
// ===========================================================================

interface SectionRendererProps {
  section: PropertySection;
  errors: Record<string, string | null>;
  onFieldChange: (fieldId: string, value: unknown) => void;
}

const SectionRenderer: React.FC<SectionRendererProps> = React.memo(
  ({ section, errors, onFieldChange }) => {
    return (
      <div style={{ marginBottom: 8 }}>
        {section.fields.map((field) => (
          <div
            key={field.id}
            style={{
              marginBottom: 10,
              display: 'flex',
              alignItems: field.type === 'boolean' ? 'center' : 'flex-start',
              gap: 8,
            }}
          >
            <label
              style={{
                width: 80,
                minWidth: 80,
                fontSize: 12,
                color: '#666',
                paddingTop: field.type === 'table' ? 0 : 4,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {field.label}
            </label>
            <div style={{ flex: 1 }}>
              <FieldRenderer
                field={field}
                onChange={(v) => onFieldChange(field.id, v)}
                errorMessage={errors[field.id] ?? null}
              />
              {errors[field.id] && (
                <Text
                  type="danger"
                  style={{ fontSize: 11, display: 'block', marginTop: 2 }}
                >
                  {errors[field.id]}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

SectionRenderer.displayName = 'SectionRenderer';

// ===========================================================================
// 无选择占位
// ===========================================================================

const NoSelection: React.FC = React.memo(() => (
  <div style={{ ...panelStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Empty
      description="未选中任何元素"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  </div>
));

NoSelection.displayName = 'NoSelection';

// ===========================================================================
// Panel Header
// ===========================================================================

interface PanelHeaderProps {
  element: SemanticElement;
}

const PanelHeader: React.FC<PanelHeaderProps> = React.memo(({ element }) => {
  const meta = ELEMENT_TYPE_META[element.type];
  const typeLabel = meta?.label ?? element.type;
  const icon = meta?.icon ?? '';

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid #e8e8e8',
        marginBottom: 8,
      }}
    >
      <Space direction="vertical" size={0}>
        <Space size={4}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {typeLabel}
          </Text>
        </Space>
        <Title level={5} style={{ margin: 0, fontSize: 14 }}>
          {element.name || '(未命名)'}
        </Title>
      </Space>
    </div>
  );
});

PanelHeader.displayName = 'PanelHeader';

// ===========================================================================
// 单个元素属性面板
// ===========================================================================

interface SingleElementPanelProps {
  element: SemanticElement;
}

const SingleElementPanel: React.FC<SingleElementPanelProps> = React.memo(
  ({ element }) => {
    const canvasNode = useMemo(
      () => findCanvasNodeByElementId(element.id),
      [element.id],
    );

    const [errors, setErrors] = useState<Record<string, string | null>>({});

    const form: PropertyForm = useMemo(
      () => PropertyFormFactory.createForm(element, canvasNode),
      [element, canvasNode],
    );

    const siblingNames = useMemo(() => getSiblingNames(element), [element]);

    /** 获取字段的校验错误 */
    const getFieldError = useCallback(
      (field: PropertyField): string | null => {
        if (!field.validator) return null;
        return field.validator(field.value, siblingNames);
      },
      [siblingNames],
    );

    /** 处理字段变更 */
    const handleFieldChange = useCallback(
      (fieldId: string, value: unknown) => {
        // 判断字段属于哪个 section
        const isCommon =
          fieldId === 'name' || fieldId === 'description' || fieldId === 'qualifiedName';
        const isStyle =
          fieldId === 'fillColor' ||
          fieldId === 'strokeColor' ||
          fieldId === 'fontSize' ||
          fieldId === 'strokeWidth';

        if (isCommon) {
          if (fieldId === 'name') {
            // 校验
            const error = nameNotEmpty(value);
            if (error) {
              setErrors((prev) => ({ ...prev, [fieldId]: error }));
              return;
            }
            // 检查重复
            if (typeof value === 'string' && value.trim() !== element.name) {
              if (siblingNames.includes(value.trim())) {
                setErrors((prev) => ({
                  ...prev,
                  [fieldId]: '名称与同级元素重复',
                }));
                return;
              }
            }
            setErrors((prev) => ({ ...prev, [fieldId]: null }));
            useStore.getState().updateElement(element.id, {
              name: String(value),
            });
          } else if (fieldId === 'description') {
            setErrors((prev) => ({ ...prev, [fieldId]: null }));
            useStore.getState().updateElement(element.id, {
              description: String(value),
            });
          }
          // qualifiedName is readonly
          return;
        }

        if (isStyle && canvasNode) {
          const styleKey = fieldId as keyof NodeStyle;
          setErrors((prev) => ({ ...prev, [fieldId]: null }));
          useStore
            .getState()
            .updateNodeStyle(canvasNode.id, {
              [styleKey]: value,
            } as Partial<NodeStyle>);
          return;
        }

        // 类型特有字段
        handleSpecificFieldChange(element, fieldId, value, setErrors);
      },
      [element, canvasNode, siblingNames],
    );

    // 初始化时检查所有字段的校验状态
    const fieldErrors = useMemo(() => {
      const result: Record<string, string | null> = {};
      for (const section of form.sections) {
        for (const field of section.fields) {
          result[field.id] = errors[field.id] ?? getFieldError(field);
        }
      }
      return result;
    }, [form, errors, getFieldError]);

    return (
      <div style={panelStyle}>
        <PanelHeader element={element} />

        {canvasNode && (
          <div
            style={{
              padding: '4px 12px',
              marginBottom: 4,
            }}
          >
            <Text type="secondary" style={{ fontSize: 11 }}>
              画布坐标: ({canvasNode.x}, {canvasNode.y}) | 尺寸:{' '}
              {canvasNode.width}x{canvasNode.height}
            </Text>
          </div>
        )}

        <Collapse
          defaultActiveKey={form.sections.map((s) => s.id)}
          size="small"
          ghost
        >
          {form.sections.map((section) => (
            <Collapse.Panel
              key={section.id}
              header={
                <span style={sectionHeaderStyle}>{section.label}</span>
              }
            >
              <SectionRenderer
                section={section}
                errors={fieldErrors}
                onFieldChange={handleFieldChange}
              />
            </Collapse.Panel>
          ))}
        </Collapse>
      </div>
    );
  },
);

SingleElementPanel.displayName = 'SingleElementPanel';

// ---- 处理类型特有字段变更 ----

function nameNotEmpty(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length === 0) return '名称不能为空';
  return null;
}

function handleSpecificFieldChange(
  element: SemanticElement,
  fieldId: string,
  value: unknown,
  setErrors: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >,
): void {
  setErrors((prev) => ({ ...prev, [fieldId]: null }));

  const oldProps = element.properties as Record<string, unknown>;

  // PartDef fields
  if (fieldId === 'partdef_isAbstract') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, isAbstract: Boolean(value) },
    });
  } else if (fieldId === 'partdef_superTypes') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, superTypes: value },
    });
  } else if (fieldId === 'partdef_attributes') {
    // Convert table rows back to AttributeDef array
    const rows = value as Record<string, unknown>[];
    const attributes = rows.map((row) => ({
      name: String(row.name ?? ''),
      type: String(row.type ?? ''),
      multiplicity: String(row.multiplicity ?? '1'),
      defaultValue: row.defaultValue
        ? String(row.defaultValue)
        : undefined,
    }));
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, attributes },
    });
  }
  // Port fields
  else if (fieldId === 'port_direction') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, direction: String(value) },
    });
  } else if (fieldId === 'port_type') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, type: String(value) },
    });
  }
  // Requirement fields
  else if (fieldId === 'req_requirementId') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, requirementId: String(value) },
    });
  } else if (fieldId === 'req_category') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, category: String(value) },
    });
  } else if (fieldId === 'req_priority') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, priority: String(value) },
    });
  } else if (fieldId === 'req_text') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, text: String(value) },
    });
  }
  // Constraint fields
  else if (fieldId === 'constraint_expression') {
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, expression: String(value) },
    });
  } else if (fieldId === 'constraint_parameters') {
    const rows = value as Record<string, unknown>[];
    const params = rows.map((row) => ({
      name: String(row.name ?? ''),
      type: String(row.type ?? ''),
      unit: row.unit ? String(row.unit) : undefined,
    }));
    useStore.getState().updateElement(element.id, {
      properties: { ...oldProps, parameters: params },
    });
  }
}

// ===========================================================================
// 多选元素属性面板
// ===========================================================================

interface MultiSelectPanelProps {
  selectedIds: string[];
}

const MultiSelectPanel: React.FC<MultiSelectPanelProps> = React.memo(
  ({ selectedIds }) => {
    const canvasNodes = useMemo(
      () => findCanvasNodesByElementIds(selectedIds),
      [selectedIds],
    );

    const handleStyleChange = useCallback(
      (styleUpdate: Partial<NodeStyle>) => {
        for (const node of canvasNodes) {
          useStore.getState().updateNodeStyle(node.id, styleUpdate);
        }
      },
      [canvasNodes],
    );

    // Only show if there's at least one canvas node
    const nodesOnCanvas = canvasNodes.length;

    return (
      <div style={panelStyle}>
        <Divider style={{ margin: '4px 0 12px' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            已选中 {selectedIds.length} 个元素
          </Text>
        </Divider>

        {nodesOnCanvas === 0 && (
          <Empty
            description="所选元素未在画布上显示"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}

        {nodesOnCanvas > 0 && (
          <>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              其中 {nodesOnCanvas} 个在画布上，样式修改将应用到全部
            </Text>
            <Collapse
              defaultActiveKey={['multi-style']}
              size="small"
              ghost
            >
              <Collapse.Panel
                key="multi-style"
                header={
                  <span style={sectionHeaderStyle}>样式</span>
                }
              >
                <MultiStyleEditor
                  canvasNodes={canvasNodes}
                  onStyleChange={handleStyleChange}
                />
              </Collapse.Panel>
            </Collapse>
          </>
        )}
      </div>
    );
  },
);

MultiSelectPanel.displayName = 'MultiSelectPanel';

// ---- 多选样式编辑器 ----

interface MultiStyleEditorProps {
  canvasNodes: DiagramNode[];
  onStyleChange: (update: Partial<NodeStyle>) => void;
}

/**
 * 多选时的样式编辑器
 * 使用第一个节点的样式作为默认值，修改应用到所有节点
 */
const MultiStyleEditor: React.FC<MultiStyleEditorProps> = React.memo(
  ({ canvasNodes, onStyleChange }) => {
    // Use the style of the first node as default display values
    const firstStyle = canvasNodes[0]?.style;

    if (!firstStyle) return null;

    return (
      <div style={{ marginBottom: 8 }}>
        <FieldRow
          label="填充色"
          field={
            <ColorPicker
              value={firstStyle.fillColor}
              onChange={(color) =>
                onStyleChange({ fillColor: color.toHexString() })
              }
              size="small"
              style={{ width: '100%' }}
            />
          }
        />
        <FieldRow
          label="边框色"
          field={
            <ColorPicker
              value={firstStyle.strokeColor}
              onChange={(color) =>
                onStyleChange({ strokeColor: color.toHexString() })
              }
              size="small"
              style={{ width: '100%' }}
            />
          }
        />
        <FieldRow
          label="字号"
          field={
            <InputNumber
              value={firstStyle.fontSize}
              onChange={(v) =>
                onStyleChange({ fontSize: Number(v ?? 14) })
              }
              min={1}
              size="small"
              style={{ width: '100%' }}
            />
          }
        />
        <FieldRow
          label="边框宽度"
          field={
            <InputNumber
              value={firstStyle.strokeWidth}
              onChange={(v) =>
                onStyleChange({ strokeWidth: Number(v ?? 2) })
              }
              min={0}
              size="small"
              style={{ width: '100%' }}
            />
          }
        />
      </div>
    );
  },
);

MultiStyleEditor.displayName = 'MultiStyleEditor';

// ---- 字段行布局 ----

interface FieldRowProps {
  label: string;
  field: React.ReactNode;
}

const FieldRow: React.FC<FieldRowProps> = React.memo(({ label, field }) => (
  <div
    style={{
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <label
      style={{
        width: 80,
        minWidth: 80,
        fontSize: 12,
        color: '#666',
        textAlign: 'right',
      }}
    >
      {label}
    </label>
    <div style={{ flex: 1 }}>{field}</div>
  </div>
));

FieldRow.displayName = 'FieldRow';

// ===========================================================================
// 主组件: PropertiesPanel
// ===========================================================================

/**
 * 属性面板
 *
 * 根据选中状态显示不同的内容：
 * - 未选中：占位提示
 * - 单选：完整的属性表单（通用 + 样式 + 类型特有）
 * - 多选：仅显示样式编辑，应用到所有选中元素
 */
const PropertiesPanel: React.FC = React.memo(() => {
  const selectedElementIds = useStore((s) => s.selectedElementIds);
  const elements = useStore((s) => s.semanticModel.elements);

  // 根据选中 ID 查找实际元素
  const selectedElements = useMemo(() => {
    if (selectedElementIds.length === 0) return [];
    return selectedElementIds
      .map((id) => elements.find((e) => e.id === id))
      .filter((e): e is SemanticElement => e !== undefined);
  }, [selectedElementIds, elements]);

  // 无选中
  if (selectedElements.length === 0) {
    return <NoSelection />;
  }

  // 多选
  if (selectedElements.length > 1) {
    return <MultiSelectPanel selectedIds={selectedElementIds} />;
  }

  // 单选
  return <SingleElementPanel element={selectedElements[0]} />;
});

PropertiesPanel.displayName = 'PropertiesPanel';

export default PropertiesPanel;
