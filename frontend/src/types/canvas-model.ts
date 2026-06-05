// ===========================================================================
// Canvas Model — 画布模型类型定义
// 来源: 详细设计 §5.2
// ===========================================================================

// ---- 顶层结构 ----

export interface CanvasModel {
  /** 关联的语义模型 ID */
  semanticModelId: string;

  /** 所有图 */
  diagrams: Diagram[];
}

// ---- 图 ----

export interface Diagram {
  /** 唯一标识 */
  id: string;

  /** 图名称 */
  name: string;

  /** 图类型 */
  type: DiagramType;

  /** 是否在 tab 栏中打开（关闭 tab ≠ 删除视图，默认 true） */
  isOpen?: boolean;

  /** 图中所有节点 */
  nodes: DiagramNode[];

  /** 图中所有连线 */
  edges: DiagramEdge[];

  /** 视图所属的元素 ID（模型树中显示在该元素下） */
  ownerElementId?: string | null;

  /** 视口状态 */
  viewport: ViewportState;

  /** 创建时间 */
  createdAt: string;

  /** 最后修改时间 */
  modifiedAt: string;
}

export type DiagramType =
  | 'BDD'   // Block Definition Diagram
  | 'IBD'   // Internal Block Diagram
  | 'PKG'   // Package Diagram
  | 'ACT'   // Activity Diagram
  | 'STM'   // State Machine Diagram
  | 'SD'    // Sequence Diagram
  | 'UC'    // Use Case Diagram
  | 'REQ'   // Requirement Diagram
  | 'PAR';  // Parametric Diagram

// ---- 图节点 ----

export interface DiagramNode {
  /** 节点唯一 ID（= canvas_node:<semanticElementId>） */
  id: string;

  /** 关联的语义元素 ID */
  semanticElementId: string;

  /** 画布坐标 */
  x: number;
  y: number;

  /** 节点尺寸（像素） */
  width: number;
  height: number;

  /** 可视样式 */
  style: NodeStyle;

  /** 是否折叠（显示缩略模式） */
  collapsed: boolean;

  /** Z 序 */
  zIndex: number;

  /** 自定义标签位置偏移 */
  labelOffset?: Point;

  /** 是否锁定（不可移动/编辑） */
  locked: boolean;
}

export interface NodeStyle {
  /** 填充色 (#RRGGBB) */
  fillColor: string;

  /** 边框色 */
  strokeColor: string;

  /** 边框线宽 */
  strokeWidth: number;

  /** 字号 */
  fontSize: number;

  /** 字体 */
  fontFamily: string;

  /** 字体颜色 */
  fontColor: string;

  /** 不透明度 (0.0 ~ 1.0) */
  opacity: number;

  /** 圆角半径 */
  borderRadius: number;

  /** 是否显示阴影 */
  showShadow: boolean;
}

// ---- 图连线 ----

export interface DiagramEdge {
  /** 连线唯一 ID（= canvas_edge:<semanticRelationshipId>） */
  id: string;

  /** 关联的语义关系 ID */
  semanticRelationshipId: string;

  /** 源端节点 ID */
  sourceNodeId: string;

  /** 目标端节点 ID */
  targetNodeId: string;

  /** 路径点序列（相对于画布坐标） */
  waypoints: Point[];

  /** 连线样式 */
  style: EdgeStyle;

  /** 标签位置（null = 自动放置在线中点） */
  label?: LabelPosition;

  /** Z 序 */
  zIndex: number;
}

export interface EdgeStyle {
  strokeColor: string;
  strokeWidth: number;
  /** [] = 实线, [8,4] = 虚线 */
  dashPattern: number[];
  startArrow: ArrowType;
  endArrow: ArrowType;
  lineType: 'straight' | 'orthogonal' | 'curved';
}

export type ArrowType = 'none' | 'filled' | 'open' | 'diamond';

// ---- 几何基础 ----

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelPosition {
  /** 相对于连线中点的偏移 */
  offset: Point;
  /** 标签旋转角度 */
  rotation: number;
}

// ---- 视口状态 ----

export interface ViewportState {
  /** 当前缩放倍数 */
  zoom: number;
  /** 水平平移量 */
  panX: number;
  /** 垂直平移量 */
  panY: number;
}

// ---- 画布配置 ----

export interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor: string;
  gridSize: number;
  snapToGrid: boolean;
  /** 最小缩放比例 */
  zoomMin: number;
  /** 最大缩放比例 */
  zoomMax: number;
}

// ---- 默认节点样式 ----

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fillColor: '#FFFFFF',
  strokeColor: '#333333',
  strokeWidth: 2,
  fontSize: 14,
  fontFamily: 'sans-serif',
  fontColor: '#333333',
  opacity: 1.0,
  borderRadius: 4,
  showShadow: false,
};

// ---- 默认画布配置 ----

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  width: 2000,
  height: 1600,
  backgroundColor: '#F8F9FA',
  gridSize: 20,
  snapToGrid: true,
  zoomMin: 0.1,
  zoomMax: 5.0,
};
