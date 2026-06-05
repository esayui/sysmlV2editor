// ===========================================================================
// Store Types — AppStore 接口定义
// 来源: 详细设计 §3.8.2
// ===========================================================================

import type {
  SemanticModel,
  SemanticElement,
  Relationship,
} from '@/types/semantic-model';
import type {
  CanvasModel,
  DiagramNode,
  DiagramEdge,
  Point,
  NodeStyle,
} from '@/types/canvas-model';

// ---- Interaction Mode ----
// 来源: 详细设计 §3.4.2

export type InteractionMode =
  | 'select'        // 选择/移动模式（默认）
  | 'pan'           // 画布平移模式（空格+拖拽）
  | 'connect'       // 连线模式（点击端口拖到另一个端口）
  | 'create-block'  // 创建块模式（点击画布放置）
  | 'create-port'   // 创建端口模式（点击元素边缘放置）
  | 'delete';       // 删除模式（点击元素删除）

// ---- 语义模型 Slice ----

export interface SemanticSlice {
  /** 语义模型 */
  semanticModel: SemanticModel;

  /** 添加元素 */
  addElement: (element: SemanticElement) => void;

  /** 更新元素（patch 合并） */
  updateElement: (id: string, patch: Partial<SemanticElement>) => void;

  /**
   * 删除元素
   * - 级联删除所有子元素（ownerId === id）
   * - 删除所有关联的 relationship
   */
  removeElement: (id: string) => void;

  /** 添加关系 */
  addRelationship: (rel: Relationship) => void;

  /** 删除关系 */
  removeRelationship: (id: string) => void;

  /** 移动元素到新的所有者下 */
  moveElement: (elementId: string, newOwnerId: string) => void;
}

// ---- 画布模型 Slice ----

export interface CanvasSlice {
  /** 画布模型 */
  canvasModel: CanvasModel;

  /** 当前活动的图 ID */
  activeDiagramId: string | null;

  /** 在指定 Diagram 中添加节点 */
  addNodeToDiagram: (diagramId: string, node: DiagramNode) => void;

  /** 更新节点坐标（跨所有 Diagram 查找） */
  updateNodePosition: (nodeId: string, x: number, y: number) => void;

  /** 更新节点样式（跨所有 Diagram 查找） */
  updateNodeStyle: (nodeId: string, style: Partial<NodeStyle>) => void;

  /** 从 Diagram 中移除节点 */
  removeNodeFromDiagram: (diagramId: string, nodeId: string) => void;

  /** 添加连线到 Diagram */
  addEdgeToDiagram: (diagramId: string, edge: DiagramEdge) => void;

  /** 更新连线路径点（跨所有 Diagram 查找） */
  updateEdgeWaypoints: (edgeId: string, waypoints: Point[]) => void;

  /** 从 Diagram 中移除连线 */
  removeEdgeFromDiagram: (diagramId: string, edgeId: string) => void;
}

// ---- UI 状态 Slice ----

export interface UISlice {
  /** 当前选中的元素 ID 列表 */
  selectedElementIds: string[];

  /** 当前交互模式 */
  interactionMode: InteractionMode;

  /** 工具箱搜索过滤文本 */
  toolboxFilter: string;

  /** 模型树搜索过滤文本 */
  treeFilter: string;

  /** 是否有未保存的修改 */
  isDirty: boolean;

  /** 选中一组元素 */
  selectElements: (ids: string[]) => void;

  /** 取消所有选择 */
  clearSelection: () => void;

  /** 设置交互模式 */
  setInteractionMode: (mode: InteractionMode) => void;

  /** 设置工具箱过滤 */
  setToolboxFilter: (filter: string) => void;

  /** 设置模型树过滤 */
  setTreeFilter: (filter: string) => void;

  /** 标记为已修改 */
  markDirty: () => void;

  /** 标记为未修改（保存后调用） */
  markClean: () => void;
}

// ---- 完整 Store 接口 ----

export interface AppStore extends SemanticSlice, CanvasSlice, UISlice {
  // 组合后的完整 Store 接口
  // 所有 Slice 的方法和状态合并在此
}
