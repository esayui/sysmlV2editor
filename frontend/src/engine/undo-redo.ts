// ===========================================================================
// Undo/Redo Engine — Command 模式的撤销/重做引擎
// 来源: 详细设计 §3.10
// ===========================================================================

import useStore from '@/store/index';
import type { AppStore } from '@/store/types';
import type {
  SemanticElement,
  Relationship,
} from '@/types/semantic-model';
import type {
  DiagramNode,
  DiagramEdge,
  Point,
} from '@/types/canvas-model';

// ---- Interfaces ----

/** 操作历史条目的可读表示 */
export interface HistoryEntry {
  commandType: string;
  timestamp: number;
  description: string;
}

/** Command 接口 —— 所有可撤销操作必须实现 */
export interface ICommand {
  readonly type: string;
  readonly timestamp: number;

  execute(): void;
  undo(): void;
  canMergeWith(other: ICommand): boolean;
  merge(other: ICommand): ICommand;
  getDescription(): string;
}

/** 撤销/重做引擎接口 */
export interface IUndoRedoEngine {
  execute(command: ICommand): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  getHistory(): HistoryEntry[];
}

// ---- DeleteElement Snapshot ----

/** 删除元素时捕获的完整快照 */
interface DeleteSnapshot {
  elements: SemanticElement[];
  relationships: Relationship[];
  nodeEntries: Array<{ diagramId: string; node: DiagramNode }>;
  edgeEntries: Array<{ diagramId: string; edge: DiagramEdge }>;
}

// ===========================================================================
// Command 实现
// ===========================================================================

/**
 * MoveElementsCommand —— 移动一个或多个节点
 *
 * 支持合并：200ms 内连续拖拽同一批元素合并为一个 command。
 */
export class MoveElementsCommand implements ICommand {
  readonly type = 'move-elements';
  readonly timestamp: number;

  constructor(
    private store: AppStore,
    private moves: Array<{ nodeId: string; from: Point; to: Point }>,
  ) {
    this.timestamp = Date.now();
  }

  execute(): void {
    for (const m of this.moves) {
      this.store.updateNodePosition(m.nodeId, m.to.x, m.to.y);
    }
  }

  undo(): void {
    for (const m of this.moves) {
      this.store.updateNodePosition(m.nodeId, m.from.x, m.from.y);
    }
  }

  canMergeWith(other: ICommand): boolean {
    if (!(other instanceof MoveElementsCommand)) return false;
    return other.timestamp - this.timestamp < 200;
  }

  merge(other: ICommand): ICommand {
    const otherMove = other as MoveElementsCommand;
    // 合并两个 moves 列表：相同 nodeId 用新值覆盖
    const mergedMoves = [...this.moves];
    for (const om of otherMove.moves) {
      const existingIdx = mergedMoves.findIndex(
        (m) => m.nodeId === om.nodeId,
      );
      if (existingIdx >= 0) {
        // 保留原有 from，更新 to
        mergedMoves[existingIdx] = {
          ...mergedMoves[existingIdx],
          to: om.to,
        };
      } else {
        mergedMoves.push(om);
      }
    }
    return new MoveElementsCommand(this.store, mergedMoves);
  }

  getDescription(): string {
    const names = this.moves.map((m) => m.nodeId).join(', ');
    return `移动节点: ${names}`;
  }
}

/**
 * CreateElementCommand —— 创建元素
 *
 * 同时添加语义元素和对应的画布节点。
 */
export class CreateElementCommand implements ICommand {
  readonly type = 'create-element';
  readonly timestamp: number;

  constructor(
    private store: AppStore,
    private element: SemanticElement,
    private node: DiagramNode,
    private diagramId: string,
  ) {
    this.timestamp = Date.now();
  }

  execute(): void {
    this.store.addElement(this.element);
    this.store.addNodeToDiagram(this.diagramId, this.node);
  }

  undo(): void {
    this.store.removeNodeFromDiagram(this.diagramId, this.node.id);
    this.store.removeElement(this.element.id);
  }

  canMergeWith(_other: ICommand): boolean {
    return false;
  }

  merge(other: ICommand): ICommand {
    return other;
  }

  getDescription(): string {
    return `创建元素: ${this.element.name} (${this.element.type})`;
  }
}

/**
 * DeleteElementCommand —— 删除元素
 *
 * 在构造时捕获完整快照（元素 + 子元素 + 关系 + 节点 + 连线），
 * undo 时全部恢复。
 */
export class DeleteElementCommand implements ICommand {
  readonly type = 'delete-element';
  readonly timestamp: number;
  private snapshot: DeleteSnapshot;

  constructor(
    private store: AppStore,
    private targetElementId: string,
  ) {
    this.timestamp = Date.now();
    this.snapshot = this.buildSnapshot();
  }

  /**
   * 从当前 store 状态构建完整快照
   */
  private buildSnapshot(): DeleteSnapshot {
    const state = this.store;
    const { elements, relationships } = state.semanticModel;
    const { diagrams } = state.canvasModel;

    // 1. 收集要删除的元素（自身 + 所有后代）
    const idsToRemove = this.collectDescendantIds(elements, this.targetElementId);

    // 2. 收集要删除的关系
    const relsToRemove = relationships.filter(
      (r) => idsToRemove.has(r.sourceId) || idsToRemove.has(r.targetId),
    );
    const relIdsToRemove = new Set(relsToRemove.map((r) => r.id));

    // 3. 收集各 Diagram 中要删除的节点
    const nodeEntries: Array<{ diagramId: string; node: DiagramNode }> = [];
    for (const diag of diagrams) {
      for (const node of diag.nodes) {
        if (idsToRemove.has(node.semanticElementId)) {
          nodeEntries.push({ diagramId: diag.id, node });
        }
      }
    }

    // 4. 收集各 Diagram 中要删除的连线
    const edgeEntries: Array<{ diagramId: string; edge: DiagramEdge }> = [];
    for (const diag of diagrams) {
      for (const edge of diag.edges) {
        if (relIdsToRemove.has(edge.semanticRelationshipId)) {
          edgeEntries.push({ diagramId: diag.id, edge });
        }
      }
    }

    return {
      elements: elements.filter((e) => idsToRemove.has(e.id)),
      relationships: relsToRemove,
      nodeEntries,
      edgeEntries,
    };
  }

  /**
   * 收集需要级联删除的元素 ID 集合
   */
  private collectDescendantIds(
    elements: SemanticElement[],
    rootId: string,
  ): Set<string> {
    const result = new Set<string>();
    const queue = [rootId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined) break;
      result.add(currentId);

      const children = elements.filter((e) => e.ownerId === currentId);
      for (const child of children) {
        if (!result.has(child.id)) {
          queue.push(child.id);
        }
      }
    }

    return result;
  }

  execute(): void {
    const s = this.snapshot;

    // 1. 从各 Diagram 中移除连线
    for (const entry of s.edgeEntries) {
      this.store.removeEdgeFromDiagram(entry.diagramId, entry.edge.id);
    }

    // 2. 从各 Diagram 中移除节点
    for (const entry of s.nodeEntries) {
      this.store.removeNodeFromDiagram(entry.diagramId, entry.node.id);
    }

    // 3. 移除语义关系
    for (const rel of s.relationships) {
      this.store.removeRelationship(rel.id);
    }

    // 4. 移除语义元素（主元素最后删，保证级联语义正确）
    this.store.removeElement(this.targetElementId);
  }

  undo(): void {
    const s = this.snapshot;

    // 1. 恢复所有语义元素
    for (const elem of s.elements) {
      this.store.addElement(elem);
    }

    // 2. 恢复所有语义关系
    for (const rel of s.relationships) {
      this.store.addRelationship(rel);
    }

    // 3. 恢复所有画布节点
    for (const entry of s.nodeEntries) {
      this.store.addNodeToDiagram(entry.diagramId, entry.node);
    }

    // 4. 恢复所有画布连线
    for (const entry of s.edgeEntries) {
      this.store.addEdgeToDiagram(entry.diagramId, entry.edge);
    }
  }

  canMergeWith(_other: ICommand): boolean {
    return false;
  }

  merge(other: ICommand): ICommand {
    return other;
  }

  getDescription(): string {
    return `删除元素: ${this.targetElementId}`;
  }
}

/**
 * ChangePropertyCommand —— 修改元素属性
 *
 * 支持合并：同一元素同一属性在 200ms 内连续修改会合并。
 */
export class ChangePropertyCommand implements ICommand {
  readonly type = 'change-property';
  readonly timestamp: number;

  constructor(
    private store: AppStore,
    private elementId: string,
    private property: string,
    private oldValue: unknown,
    private newValue: unknown,
  ) {
    this.timestamp = Date.now();
  }

  execute(): void {
    this.store.updateElement(this.elementId, {
      [this.property]: this.newValue,
    } as Partial<SemanticElement>);
  }

  undo(): void {
    this.store.updateElement(this.elementId, {
      [this.property]: this.oldValue,
    } as Partial<SemanticElement>);
  }

  canMergeWith(other: ICommand): boolean {
    if (!(other instanceof ChangePropertyCommand)) return false;
    if (other.elementId !== this.elementId) return false;
    if (other.property !== this.property) return false;
    return other.timestamp - this.timestamp < 200;
  }

  merge(other: ICommand): ICommand {
    const otherChange = other as ChangePropertyCommand;
    // 保留最早的 oldValue，使用最新的 newValue
    return new ChangePropertyCommand(
      this.store,
      this.elementId,
      this.property,
      this.oldValue,
      otherChange.newValue,
    );
  }

  getDescription(): string {
    return `修改属性: ${this.elementId}.${this.property}`;
  }
}

/**
 * CreateConnectionCommand —— 创建连线
 *
 * 同时添加语义关系和画布连线。
 */
export class CreateConnectionCommand implements ICommand {
  readonly type = 'create-connection';
  readonly timestamp: number;

  constructor(
    private store: AppStore,
    private edge: DiagramEdge,
    private relationship: Relationship,
    private diagramId: string,
  ) {
    this.timestamp = Date.now();
  }

  execute(): void {
    this.store.addRelationship(this.relationship);
    this.store.addEdgeToDiagram(this.diagramId, this.edge);
  }

  undo(): void {
    this.store.removeEdgeFromDiagram(this.diagramId, this.edge.id);
    this.store.removeRelationship(this.relationship.id);
  }

  canMergeWith(_other: ICommand): boolean {
    return false;
  }

  merge(other: ICommand): ICommand {
    return other;
  }

  getDescription(): string {
    const relType = this.relationship.type;
    return `创建连线: ${relType} (${this.relationship.sourceId} → ${this.relationship.targetId})`;
  }
}

// ===========================================================================
// UndoRedoEngine
// ===========================================================================

/**
 * UndoRedoEngine —— 命令栈撤销/重做引擎
 *
 * 维护 undoStack 和 redoStack 两个命令栈，
 * 执行命令时自动检测与栈顶命令是否可合并。
 * 栈容量由 maxStackSize 限制（默认 200），超出时从底部丢弃最旧命令。
 */
export class UndoRedoEngine implements IUndoRedoEngine {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private maxStackSize: number;

  constructor(maxStackSize = 200) {
    this.maxStackSize = maxStackSize;
  }

  /** 执行一个命令并推入撤销栈 */
  execute(command: ICommand): void {
    // 检查是否可与撤销栈顶合并
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.canMergeWith(command)) {
      // 先执行新命令以应用其效果，再合并栈顶以保持 undo 语义完整
      command.execute();
      const merged = top.merge(command);
      this.undoStack[this.undoStack.length - 1] = merged;
    } else {
      // 不可合并：执行并推入
      command.execute();
      this.undoStack.push(command);

      // 超容量时从底部丢弃最旧命令
      while (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }
    }

    // 执行新命令后清空重做栈
    this.redoStack = [];
  }

  /** 撤销最近一次操作 */
  undo(): void {
    if (this.undoStack.length === 0) return;
    const command = this.undoStack.pop()!;
    command.undo();
    this.redoStack.push(command);
  }

  /** 重做最近一次撤销的操作 */
  redo(): void {
    if (this.redoStack.length === 0) return;
    const command = this.redoStack.pop()!;
    command.execute();
    this.undoStack.push(command);
  }

  /** 是否有可撤销的操作 */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** 是否有可重做的操作 */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 清空所有历史 */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** 获取可读的操作历史列表 */
  getHistory(): HistoryEntry[] {
    return this.undoStack.map((cmd) => ({
      commandType: cmd.type,
      timestamp: cmd.timestamp,
      description: cmd.getDescription(),
    }));
  }
}

/** 默认引擎实例（供全局使用） */
export const undoRedoEngine = new UndoRedoEngine();

// ===========================================================================
// 便捷函数（在 React 组件中调用）
// ===========================================================================

/**
 * 创建并执行移动命令
 *
 * @example
 *   executeMove([{ nodeId: 'n1', from: {x:0,y:0}, to: {x:100,y:200} }]);
 */
export function executeMove(
  moves: Array<{ nodeId: string; from: Point; to: Point }>,
): void {
  undoRedoEngine.execute(new MoveElementsCommand(useStore.getState(), moves));
}

/**
 * 创建并执行创建元素命令
 */
export function executeCreateElement(
  element: SemanticElement,
  node: DiagramNode,
  diagramId: string,
): void {
  undoRedoEngine.execute(
    new CreateElementCommand(useStore.getState(), element, node, diagramId),
  );
}

/**
 * 创建并执行删除元素命令
 */
export function executeDeleteElement(elementId: string): void {
  undoRedoEngine.execute(
    new DeleteElementCommand(useStore.getState(), elementId),
  );
}

/**
 * 创建并执行属性修改命令
 */
export function executeChangeProperty(
  elementId: string,
  property: string,
  oldValue: unknown,
  newValue: unknown,
): void {
  undoRedoEngine.execute(
    new ChangePropertyCommand(
      useStore.getState(),
      elementId,
      property,
      oldValue,
      newValue,
    ),
  );
}

/**
 * 创建并执行创建连线命令
 */
export function executeCreateConnection(
  edge: DiagramEdge,
  relationship: Relationship,
  diagramId: string,
): void {
  undoRedoEngine.execute(
    new CreateConnectionCommand(useStore.getState(), edge, relationship, diagramId),
  );
}
