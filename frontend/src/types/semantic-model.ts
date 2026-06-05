// ===========================================================================
// Semantic Model — SysML v2 语义模型类型定义
// 来源: 详细设计 §5.1
// ===========================================================================

// ---- 顶层结构 ----

export interface SemanticModel {
  /** 模型唯一标识 (UUID v4) */
  id: string;

  /** 模型名称 */
  name: string;

  /** 所有语义元素 */
  elements: SemanticElement[];

  /** 所有关系 */
  relationships: Relationship[];

  /** 顶层包（命名空间） */
  packages: Package[];
}

// ---- 语义元素 ----

export interface SemanticElement {
  /** 唯一标识 (UUID v4) */
  id: string;

  /** 元素名称（在所属命名空间内唯一） */
  name: string;

  /** 限定名（如 'Vehicle::Engine::Piston'） */
  qualifiedName: string;

  /** 元素类型 */
  type: ElementType;

  /** 简短名称/别名 */
  shortName?: string;

  /** 所属元素/包的 ID（顶级元素为 null） */
  ownerId: string | null;

  /** 人类可读描述 */
  description: string;

  /** 类型特有属性（不同 element type 有不同字段） */
  properties: Record<string, unknown>;
}

export type ElementType =
  // 结构
  | 'PartDefinition'
  | 'PartUsage'
  | 'ItemDefinition'
  | 'ItemUsage'
  | 'PortDefinition'
  | 'PortUsage'
  | 'InterfaceDefinition'
  | 'InterfaceUsage'
  | 'AttributeDefinition'
  | 'AttributeUsage'
  | 'EnumerationDefinition'

  // 行为
  | 'ActionDefinition'
  | 'ActionUsage'
  | 'StateDefinition'
  | 'StateUsage'
  | 'Transition'
  | 'Actor'
  | 'UseCase'

  // 需求
  | 'RequirementDefinition'
  | 'RequirementUsage'
  | 'StakeholderRequirement'

  // 参数
  | 'ConstraintDefinition'
  | 'ConstraintUsage'

  // 组织
  | 'Package'

  // 注释
  | 'Comment';

// ---- 关系 ----

export interface Relationship {
  /** 唯一标识 */
  id: string;

  /** 关系名称（可选） */
  name?: string;

  /** 关系类型 */
  type: RelationshipType;

  /** 源端元素 ID */
  sourceId: string;

  /** 源端端口 ID（若通过端口连接） */
  sourcePortId?: string;

  /** 目标端元素 ID */
  targetId: string;

  /** 目标端端口 ID */
  targetPortId?: string;

  /** 关系类型特有属性 */
  properties: Record<string, unknown>;
}

export type RelationshipType =
  | 'Connection'          // 结构连接
  | 'Binding'             // 参数绑定
  | 'ObjectFlow'          // 对象流（活动图）
  | 'ControlFlow'         // 控制流（活动图）
  | 'Transition'          // 状态转换
  | 'Message'             // 序列图消息
  | 'Satisfy'             // 满足关系（需求）
  | 'Verify'              // 验证关系（需求）
  | 'Subclassification'   // 分类关系（BDD 继承）
  | 'Subsetting'          // 子集关系
  | 'Redefinition'        // 重定义
  | 'Containment'         // 包含
  | 'Composition'         // 组合
  | 'Allocation';         // 分配

// ---- 包 ----

export interface Package {
  id: string;
  name: string;
  qualifiedName: string;
  ownerId: string | null;
  /** 包内顶层元素 ID 列表 */
  elementIds: string[];
}

// ---- 类型特有属性 (properties 字段内容) ----

/** PartDefinition 的 properties */
export interface PartDefProperties {
  isAbstract: boolean;
  /** 父类型的 qualifiedName 列表 */
  superTypes: string[];
  attributes: AttributeDef[];
  ports: PortRef[];
}

export interface AttributeDef {
  name: string;
  /** 类型 qualifiedName (Real, Integer, String, 或自定义) */
  type: string;
  /** 如 "1", "0..1", "*" */
  multiplicity: string;
  defaultValue?: string;
}

export interface PortRef {
  id: string;
  name: string;
  direction: 'in' | 'out' | 'inout';
  /** 端口类型 */
  type: string;
}

/** Requirement 的 properties */
export interface RequirementProperties {
  /** 如 "REQ-001" */
  requirementId: string;
  /** 需求正文 */
  text: string;
  category: 'functional' | 'non-functional' | 'performance' | 'interface' | 'constraint';
  priority: 'high' | 'medium' | 'low';
  /** 验证方法 */
  verifiedBy: string[];
}

/** Constraint 的 properties */
export interface ConstraintProperties {
  /** 约束表达式 */
  expression: string;
  parameters: ConstraintParameter[];
}

export interface ConstraintParameter {
  name: string;
  type: string;
  unit?: string;
}

// ---- 默认样式常量 ----

export const RELATIONSHIP_STYLE_MAP: Record<RelationshipType, {
  strokeColor: string;
  strokeWidth: number;
  dashPattern: number[];
  startArrow: string;
  endArrow: string;
  lineType: 'straight' | 'orthogonal' | 'curved';
}> = {
  'Connection':       { strokeColor: '#333333', strokeWidth: 2,   dashPattern: [],    startArrow: 'none',   endArrow: 'none',   lineType: 'orthogonal' },
  'Binding':          { strokeColor: '#666666', strokeWidth: 1.5, dashPattern: [6,3],  startArrow: 'none',   endArrow: 'open',   lineType: 'orthogonal' },
  'ObjectFlow':       { strokeColor: '#333333', strokeWidth: 2,   dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'orthogonal' },
  'ControlFlow':      { strokeColor: '#333333', strokeWidth: 2,   dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'orthogonal' },
  'Transition':       { strokeColor: '#333333', strokeWidth: 2,   dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'curved' },
  'Message':          { strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'straight' },
  'Satisfy':          { strokeColor: '#228B22', strokeWidth: 1.5, dashPattern: [8,4],  startArrow: 'none',   endArrow: 'filled', lineType: 'straight' },
  'Verify':           { strokeColor: '#1E90FF', strokeWidth: 1.5, dashPattern: [8,4],  startArrow: 'none',   endArrow: 'filled', lineType: 'straight' },
  'Subclassification':{ strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'straight' },
  'Allocation':       { strokeColor: '#888888', strokeWidth: 1.5, dashPattern: [4,4],  startArrow: 'none',   endArrow: 'open',   lineType: 'straight' },
  'Subsetting':       { strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'straight' },
  'Redefinition':     { strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'straight' },
  'Containment':      { strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [],    startArrow: 'none',   endArrow: 'open',   lineType: 'straight' },
  'Composition':      { strokeColor: '#333333', strokeWidth: 2,   dashPattern: [],    startArrow: 'none',   endArrow: 'filled', lineType: 'straight' },
};
