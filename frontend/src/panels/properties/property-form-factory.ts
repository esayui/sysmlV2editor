// ===========================================================================
// PropertyFormFactory — 根据 ElementType 生成属性表单
// 来源: 详细设计 §3.6.3
// ===========================================================================

import type {
  SemanticElement,
  PartDefProperties,
  RequirementProperties,
  ConstraintProperties,
  ConstraintParameter,
  AttributeDef,
  PortRef,
} from '@/types/semantic-model';
import type { DiagramNode } from '@/types/canvas-model';
import type {
  PropertyForm,
  PropertySection,
  PropertyField,
  TableColumn,
  SelectOption,
} from './types';

// ---- 下拉选项常量 ----

const DIRECTION_OPTIONS: SelectOption[] = [
  { label: 'in', value: 'in' },
  { label: 'out', value: 'out' },
  { label: 'inout', value: 'inout' },
];

const REQUIREMENT_CATEGORY_OPTIONS: SelectOption[] = [
  { label: 'functional', value: 'functional' },
  { label: 'non-functional', value: 'non-functional' },
  { label: 'performance', value: 'performance' },
  { label: 'interface', value: 'interface' },
  { label: 'constraint', value: 'constraint' },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { label: 'high', value: 'high' },
  { label: 'medium', value: 'medium' },
  { label: 'low', value: 'low' },
];

const MULTIPLICITY_OPTIONS: SelectOption[] = [
  { label: '1', value: '1' },
  { label: '0..1', value: '0..1' },
  { label: '*', value: '*' },
  { label: '1..*', value: '1..*' },
];

// ---- 属性提取工具 ----

/** 安全提取 PartDef 属性 */
function extractPartDefProps(
  element: SemanticElement,
): PartDefProperties {
  const p = element.properties as Partial<PartDefProperties>;
  return {
    isAbstract: p.isAbstract ?? false,
    superTypes: p.superTypes ?? [],
    attributes: p.attributes ?? [],
    ports: p.ports ?? [],
  };
}

/** 安全提取 Requirement 属性 */
function extractRequirementProps(
  element: SemanticElement,
): RequirementProperties {
  const p = element.properties as Partial<RequirementProperties>;
  return {
    requirementId: p.requirementId ?? '',
    text: p.text ?? '',
    category: p.category ?? 'functional',
    priority: p.priority ?? 'medium',
    verifiedBy: p.verifiedBy ?? [],
  };
}

/** 安全提取 Constraint 属性 */
function extractConstraintProps(
  element: SemanticElement,
): ConstraintProperties {
  const p = element.properties as Partial<ConstraintProperties>;
  return {
    expression: p.expression ?? '',
    parameters: p.parameters ?? [],
  };
}

/** 安全提取 Port 属性 */
function extractPortProps(
  element: SemanticElement,
): { direction: string; portType: string } {
  const p = element.properties as Record<string, unknown>;
  return {
    direction: (p.direction as string) ?? 'inout',
    portType: (p.type as string) ?? '',
  };
}

// ---- 校验函数 ----

function nameNotEmpty(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length === 0) return '名称不能为空';
  return null;
}

function nameNotDuplicate(
  value: unknown,
  siblingNames?: string[],
): string | null {
  if (!siblingNames || siblingNames.length === 0) return null;
  const s = typeof value === 'string' ? value.trim() : '';
  if (siblingNames.includes(s)) return '名称与同级元素重复';
  return null;
}

function notNegative(value: unknown): string | null {
  const n = Number(value);
  if (isNaN(n) || n < 0) return '不能为负数';
  return null;
}

// ---- 表格列定义 ----

const TYPE_OPTIONS = [
  { label: 'Real', value: 'Real' },
  { label: 'Integer', value: 'Integer' },
  { label: 'String', value: 'String' },
  { label: 'Boolean', value: 'Boolean' },
  { label: 'Complex', value: 'Complex' },
];

const ATTRIBUTE_COLUMNS: TableColumn[] = [
  { key: 'name', title: '名称', editType: 'text' },
  { key: 'type', title: '类型', editType: 'select', options: TYPE_OPTIONS },
  { key: 'multiplicity', title: '多重性', editType: 'select', options: MULTIPLICITY_OPTIONS },
];

const PARAMETER_COLUMNS: TableColumn[] = [
  { key: 'name', title: '名称', editType: 'text' },
  { key: 'type', title: '类型', editType: 'text' },
  { key: 'unit', title: '单位', editType: 'text' },
];

const PORT_COLUMNS: TableColumn[] = [
  { key: 'name', title: '名称', editType: 'text' },
  { key: 'direction', title: '方向', editType: 'select', options: DIRECTION_OPTIONS },
  { key: 'type', title: '类型', editType: 'text' },
];

// ===========================================================================
// PropertyFormFactory
// ===========================================================================

export class PropertyFormFactory {
  /**
   * 根据语义元素和画布节点生成完整的属性表单
   */
  static createForm(
    element: SemanticElement,
    canvasNode: DiagramNode | null,
  ): PropertyForm {
    const sections: PropertySection[] = [];

    // 1. 通用属性
    const siblingNames = PropertyFormFactory._collectSiblingNames(element);
    sections.push(PropertyFormFactory._createCommonSection(element, siblingNames));

    // 2. 样式属性（仅当有画布节点时）
    if (canvasNode) {
      sections.push(PropertyFormFactory._createStyleSection(canvasNode));
    }

    // 3. 类型特有属性
    const specificSection = PropertyFormFactory._getSpecificSection(element);
    if (specificSection) {
      sections.push(specificSection);
    }

    return {
      elementId: element.id,
      elementType: element.type,
      sections,
    };
  }

  // ---- 通用属性 ----

  private static _createCommonSection(
    element: SemanticElement,
    siblingNames: string[],
  ): PropertySection {
    return {
      id: 'common',
      label: '通用',
      fields: [
        {
          id: 'name',
          label: '名称',
          type: 'text',
          value: element.name,
          readonly: false,
          validator: (v: unknown) => {
            const emptyErr = nameNotEmpty(v);
            if (emptyErr) return emptyErr;
            // Only check duplicates if the name actually changed
            if (typeof v === 'string' && v.trim() !== element.name) {
              return nameNotDuplicate(v, siblingNames);
            }
            return null;
          },
        },
        {
          id: 'description',
          label: '描述',
          type: 'textarea',
          value: element.description,
          readonly: false,
        },
        {
          id: 'qualifiedName',
          label: '限定名',
          type: 'text',
          value: element.qualifiedName,
          readonly: true,
        },
      ],
    };
  }

  private static _collectSiblingNames(_element: SemanticElement): string[] {
    // This is a static method that needs store access to work properly.
    // We return an empty array here; the actual sibling check is done in the component
    // where store access is available.
    return [];
  }

  // ---- 样式属性 ----

  private static _createStyleSection(
    canvasNode: DiagramNode,
  ): PropertySection {
    const s = canvasNode.style;
    return {
      id: 'style',
      label: '样式',
      fields: [
        {
          id: 'fillColor',
          label: '填充色',
          type: 'color',
          value: s.fillColor,
          readonly: false,
        },
        {
          id: 'strokeColor',
          label: '边框色',
          type: 'color',
          value: s.strokeColor,
          readonly: false,
        },
        {
          id: 'fontSize',
          label: '字号',
          type: 'number',
          value: s.fontSize,
          readonly: false,
          validator: notNegative,
        },
        {
          id: 'strokeWidth',
          label: '边框宽度',
          type: 'number',
          value: s.strokeWidth,
          readonly: false,
          validator: notNegative,
        },
      ],
    };
  }

  // ---- 类型特有属性 ----

  private static _getSpecificSection(
    element: SemanticElement,
  ): PropertySection | null {
    switch (element.type) {
      case 'PartDefinition':
      case 'PartUsage':
      case 'ItemDefinition':
      case 'ItemUsage':
        return PropertyFormFactory._createPartDefSection(element);

      case 'PortDefinition':
      case 'PortUsage':
        return PropertyFormFactory._createPortSection(element);

      case 'RequirementDefinition':
      case 'RequirementUsage':
      case 'StakeholderRequirement':
        return PropertyFormFactory._createRequirementSection(element);

      case 'ConstraintDefinition':
      case 'ConstraintUsage':
        return PropertyFormFactory._createConstraintSection(element);

      default:
        return null;
    }
  }

  // ---- PartDefinition / PartUsage ----

  private static _createPartDefSection(
    element: SemanticElement,
  ): PropertySection {
    const props = extractPartDefProps(element);

    const fields: PropertyField[] = [
      {
        id: 'partdef_isAbstract',
        label: '是否为抽象',
        type: 'boolean',
        value: props.isAbstract,
        readonly: false,
      },
      {
        id: 'partdef_superTypes',
        label: '父类型',
        type: 'tags',
        value: props.superTypes,
        readonly: false,
      },
      {
        id: 'partdef_attributes',
        label: '属性',
        type: 'table',
        value: props.attributes,
        readonly: false,
        columns: ATTRIBUTE_COLUMNS,
        rows: props.attributes.map((a: AttributeDef) => ({
          key: a.name,
          name: a.name,
          type: a.type,
          multiplicity: a.multiplicity,
          defaultValue: a.defaultValue ?? '',
        })),
      },
      {
        id: 'partdef_ports',
        label: '端口',
        type: 'table',
        value: props.ports,
        readonly: true,
        columns: PORT_COLUMNS,
        rows: props.ports.map((p: PortRef) => ({
          key: p.id,
          name: p.name,
          direction: p.direction,
          type: p.type,
        })),
      },
    ];

    return {
      id: 'partdef-specific',
      label: 'Part Definition',
      fields,
    };
  }

  // ---- PortDefinition / PortUsage ----

  private static _createPortSection(
    element: SemanticElement,
  ): PropertySection {
    const props = extractPortProps(element);

    return {
      id: 'port-specific',
      label: 'Port',
      fields: [
        {
          id: 'port_direction',
          label: '方向',
          type: 'select',
          value: props.direction,
          readonly: false,
          options: DIRECTION_OPTIONS,
        },
        {
          id: 'port_type',
          label: '类型',
          type: 'text',
          value: props.portType,
          readonly: false,
        },
      ],
    };
  }

  // ---- Requirement ----

  private static _createRequirementSection(
    element: SemanticElement,
  ): PropertySection {
    const props = extractRequirementProps(element);

    return {
      id: 'requirement-specific',
      label: 'Requirement',
      fields: [
        {
          id: 'req_requirementId',
          label: 'Requirement ID',
          type: 'text',
          value: props.requirementId,
          readonly: false,
        },
        {
          id: 'req_category',
          label: '分类',
          type: 'select',
          value: props.category,
          readonly: false,
          options: REQUIREMENT_CATEGORY_OPTIONS,
        },
        {
          id: 'req_priority',
          label: '优先级',
          type: 'select',
          value: props.priority,
          readonly: false,
          options: PRIORITY_OPTIONS,
        },
        {
          id: 'req_text',
          label: '需求正文',
          type: 'textarea',
          value: props.text,
          readonly: false,
        },
      ],
    };
  }

  // ---- Constraint ----

  private static _createConstraintSection(
    element: SemanticElement,
  ): PropertySection {
    const props = extractConstraintProps(element);

    const fields: PropertyField[] = [
      {
        id: 'constraint_expression',
        label: '表达式',
        type: 'textarea',
        value: props.expression,
        readonly: false,
      },
      {
        id: 'constraint_parameters',
        label: '参数',
        type: 'table',
        value: props.parameters,
        readonly: false,
        columns: PARAMETER_COLUMNS,
        rows: props.parameters.map((p: ConstraintParameter) => ({
          key: p.name,
          name: p.name,
          type: p.type,
          unit: p.unit ?? '',
        })),
      },
    ];

    return {
      id: 'constraint-specific',
      label: 'Constraint',
      fields,
    };
  }
}
