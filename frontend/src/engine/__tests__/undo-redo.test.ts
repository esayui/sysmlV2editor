// ===========================================================================
// Undo/Redo Engine Tests
// 来源: 任务清单 M-FE-10
// ===========================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UndoRedoEngine,
  MoveElementsCommand,
  CreateElementCommand,
  DeleteElementCommand,
  ChangePropertyCommand,
  CreateConnectionCommand,
} from '../undo-redo';
import type {
  ICommand,
  IUndoRedoEngine,
} from '../undo-redo';
import useStore from '@/store/index';
import type { AppStore } from '@/store/types';
import type {
  SemanticElement,
  Relationship,
} from '@/types/semantic-model';
import type {
  DiagramNode,
  DiagramEdge,
  Diagram,
} from '@/types/canvas-model';

// ---- Helpers ----

function resetStore(): void {
  useStore.setState({
    semanticModel: {
      id: 'model-1',
      name: 'TestModel',
      elements: [],
      relationships: [],
      packages: [],
    },
    canvasModel: {
      semanticModelId: 'model-1',
      diagrams: [
        {
          id: 'diag-1',
          name: 'Diagram 1',
          type: 'BDD',
          nodes: [],
          edges: [],
          viewport: { zoom: 1, panX: 0, panY: 0 },
          createdAt: '2026-01-01T00:00:00Z',
          modifiedAt: '2026-01-01T00:00:00Z',
        } as Diagram,
      ],
    },
    activeDiagramId: 'diag-1',
    selectedElementIds: [],
    interactionMode: 'select',
    toolboxFilter: '',
    treeFilter: '',
    isDirty: false,
  });
}

function getStore(): AppStore {
  return useStore.getState() as AppStore;
}

function makeElement(overrides: Partial<SemanticElement> = {}): SemanticElement {
  return {
    id: 'elem-1',
    name: 'TestElement',
    qualifiedName: 'TestElement',
    type: 'PartDefinition',
    ownerId: null,
    description: '',
    properties: {},
    ...overrides,
  };
}

function makeNode(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'node-1',
    semanticElementId: 'elem-1',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    style: {
      fillColor: '#FFFFFF',
      strokeColor: '#333333',
      strokeWidth: 2,
      fontSize: 14,
      fontFamily: 'sans-serif',
      fontColor: '#333333',
      opacity: 1.0,
      borderRadius: 4,
      showShadow: false,
    },
    collapsed: false,
    zIndex: 0,
    locked: false,
    ...overrides,
  };
}

function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: 'rel-1',
    type: 'Connection',
    sourceId: 'elem-1',
    targetId: 'elem-2',
    properties: {},
    ...overrides,
  };
}

function makeEdge(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: 'edge-1',
    semanticRelationshipId: 'rel-1',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    waypoints: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    style: {
      strokeColor: '#333333',
      strokeWidth: 2,
      dashPattern: [],
      startArrow: 'none',
      endArrow: 'open',
      lineType: 'straight',
    },
    zIndex: 0,
    ...overrides,
  };
}

// ===== A. 引擎基础功能 =====

describe('UndoRedoEngine — 基础功能', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();
  });

  interface NoopCommand extends ICommand {
    executeFn: ReturnType<typeof vi.fn>;
    undoFn: ReturnType<typeof vi.fn>;
  }

  function makeNoopCommand(type = 'test'): NoopCommand {
    const executeFn = vi.fn();
    const undoFn = vi.fn();
    return {
      type,
      timestamp: Date.now(),
      execute: executeFn,
      undo: undoFn,
      canMergeWith: () => false,
      merge: (other: ICommand) => other,
      getDescription: () => `noop: ${type}`,
      executeFn,
      undoFn,
    };
  }

  it('1.1 引擎初始状态：两个栈都为空', () => {
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
    expect(engine.getHistory()).toEqual([]);
  });

  it('1.2 execute() 调用 command.execute() 并推入撤销栈', () => {
    const cmd = makeNoopCommand();
    engine.execute(cmd);

    expect(cmd.executeFn).toHaveBeenCalledTimes(1);
    expect(engine.canUndo()).toBe(true);
  });

  it('1.3 undo() 弹出撤销栈顶并调用 command.undo()，推入重做栈', () => {
    const cmd = makeNoopCommand();
    engine.execute(cmd);

    engine.undo();
    expect(cmd.undoFn).toHaveBeenCalledTimes(1);
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(true);
  });

  it('1.4 redo() 弹出重做栈顶并调用 command.execute()，推入撤销栈', () => {
    const cmd = makeNoopCommand();
    engine.execute(cmd);

    engine.undo();
    const executeCallsBefore = cmd.executeFn.mock.calls.length;

    engine.redo();
    expect(cmd.executeFn).toHaveBeenCalledTimes(executeCallsBefore + 1);
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);
  });

  it('1.5 undo() 在空栈上不执行任何操作', () => {
    expect(() => engine.undo()).not.toThrow();
    expect(engine.canRedo()).toBe(false);
  });

  it('1.6 redo() 在空栈上不执行任何操作', () => {
    expect(() => engine.redo()).not.toThrow();
    expect(engine.canUndo()).toBe(false);
  });

  it('1.7 clear() 清空两个栈', () => {
    const cmd = makeNoopCommand();
    engine.execute(cmd);
    engine.undo(); // 此时 undoStack=[], redoStack=[cmd]

    engine.clear();
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
    expect(engine.getHistory()).toEqual([]);
  });

  it('1.8 undo 后执行新命令 → 重做栈被清空', () => {
    // 验证质量关："Undo then new command → redo stack cleared"

    const cmd1 = makeNoopCommand('cmd1');
    engine.execute(cmd1);

    engine.undo();
    expect(engine.canRedo()).toBe(true); // redo 栈中有 cmd1

    // 执行新命令
    const cmd2 = makeNoopCommand('cmd2');
    engine.execute(cmd2);

    expect(engine.canRedo()).toBe(false); // redo 栈被清空
    expect(engine.canUndo()).toBe(true);
  });

  it('1.8 execute → undo → canUndo=false → redo → 状态回到 execute 后', () => {
    const cmd = makeNoopCommand();
    engine.execute(cmd);
    expect(engine.canUndo()).toBe(true);

    engine.undo();
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(true);

    engine.redo();
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);

    // execute 被调用了 2 次（初始 + redo）
    expect(cmd.executeFn).toHaveBeenCalledTimes(2);
  });

  it('1.9 maxStackSize 限制撤销栈容量', () => {
    const smallEngine = new UndoRedoEngine(3);

    for (let i = 0; i < 5; i++) {
      smallEngine.execute(makeNoopCommand(`cmd${i}`));
    }

    // 最旧的 2 个被丢弃，保留 3 个
    const history = smallEngine.getHistory();
    expect(history).toHaveLength(3);
    // 历史中应该只包含最新的 3 个命令
    expect(history[0].commandType).toBe('cmd2');
    expect(history[1].commandType).toBe('cmd3');
    expect(history[2].commandType).toBe('cmd4');
  });

  it('1.10 getHistory() 返回可读的历史条目列表', () => {
    const cmd = makeNoopCommand('move-elements');
    engine.execute(cmd);

    const history = engine.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toHaveProperty('commandType');
    expect(history[0]).toHaveProperty('timestamp');
    expect(history[0]).toHaveProperty('description');
    expect(typeof history[0].description).toBe('string');
  });
});

// ===== B. MoveElementsCommand =====

describe('MoveElementsCommand', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();

    // 添加初始节点
    const node = makeNode({ id: 'node-1', x: 0, y: 0 });
    getStore().addNodeToDiagram('diag-1', node);
  });

  it('2.1 execute() 移动节点到新位置', () => {
    const cmd = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 100, y: 200 } },
    ]);

    engine.execute(cmd);

    const found = findNodeInDiagrams(getStore(), 'node-1');
    expect(found).toBeDefined();
    expect(found!.x).toBe(100);
    expect(found!.y).toBe(200);
  });

  it('2.2 undo() 恢复到原始位置', () => {
    const cmd = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 100, y: 200 } },
    ]);

    engine.execute(cmd);
    engine.undo();

    const found = findNodeInDiagrams(getStore(), 'node-1');
    expect(found).toBeDefined();
    expect(found!.x).toBe(0);
    expect(found!.y).toBe(0);
  });

  it('2.3 redo() 重新移动到新位置', () => {
    const cmd = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 100, y: 200 } },
    ]);

    engine.execute(cmd);
    engine.undo();
    engine.redo();

    const found = findNodeInDiagrams(getStore(), 'node-1');
    expect(found).toBeDefined();
    expect(found!.x).toBe(100);
    expect(found!.y).toBe(200);
  });

  it('2.4 canMergeWith: 同类型且时间差 < 200ms → true', () => {
    const cmd1 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);

    // 模拟时间差较小
    const cmd2 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 50, y: 50 }, to: { x: 100, y: 100 } },
    ]);
    // 覆写 timestamp 使其在 200ms 内
    Object.defineProperty(cmd2, 'timestamp', { value: cmd1.timestamp + 100 });

    expect(cmd1.canMergeWith(cmd2)).toBe(true);
  });

  it('2.5 canMergeWith: 时间差 > 200ms → false', () => {
    const cmd1 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);

    const cmd2 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 50, y: 50 }, to: { x: 100, y: 100 } },
    ]);
    Object.defineProperty(cmd2, 'timestamp', { value: cmd1.timestamp + 300 });

    expect(cmd1.canMergeWith(cmd2)).toBe(false);
  });

  it('2.6 merge: 合并两个 MoveElementsCommand', () => {
    const cmd1 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);
    Object.defineProperty(cmd1, 'timestamp', { value: 1000 });

    const cmd2 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 50, y: 50 }, to: { x: 100, y: 100 } },
    ]);
    Object.defineProperty(cmd2, 'timestamp', { value: 1100 });

    const merged = cmd1.merge(cmd2) as MoveElementsCommand;

    expect(merged).toBeInstanceOf(MoveElementsCommand);
    // validate by executing
    engine.execute(merged);
    const found = findNodeInDiagrams(getStore(), 'node-1');
    expect(found!.x).toBe(100);
    expect(found!.y).toBe(100);
  });

  it('2.7 merge 合并不同 nodeId', () => {
    // 添加第 2 个节点
    const node2 = makeNode({ id: 'node-2', x: 10, y: 10 });
    getStore().addNodeToDiagram('diag-1', node2);

    const cmd1 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);

    const cmd2 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-2', from: { x: 10, y: 10 }, to: { x: 60, y: 60 } },
    ]);

    const merged = cmd1.merge(cmd2) as MoveElementsCommand;
    engine.execute(merged);

    const freshStore = getStore();
    const n1 = findNodeInDiagrams(freshStore, 'node-1');
    const n2 = findNodeInDiagrams(freshStore, 'node-2');
    expect(n1!.x).toBe(50);
    expect(n1!.y).toBe(50);
    expect(n2!.x).toBe(60);
    expect(n2!.y).toBe(60);
  });

  it('2.8 引擎合并逻辑：连续两次 execute 的 move 自动合并', () => {
    const cmd1 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
    ]);

    const cmd2 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 50, y: 50 }, to: { x: 100, y: 100 } },
    ]);

    // 强制 cmd2 的时间戳在 200ms 内
    const now = Date.now();
    Object.defineProperty(cmd1, 'timestamp', { value: now });
    Object.defineProperty(cmd2, 'timestamp', { value: now + 100 });

    engine.execute(cmd1);
    engine.execute(cmd2);

    // 应该只有一个历史条目（合并了）
    const history = engine.getHistory();
    expect(history).toHaveLength(1);

    // undo 一次就回到初始位置
    engine.undo();
    const found = findNodeInDiagrams(getStore(), 'node-1');
    expect(found!.x).toBe(0);
    expect(found!.y).toBe(0);
  });

  it('2.9 连续拖拽 3 次 → undo 一次回到初始位置', () => {
    const now = Date.now();
    const cmd1 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 0, y: 0 }, to: { x: 30, y: 30 } },
    ]);
    Object.defineProperty(cmd1, 'timestamp', { value: now });

    const cmd2 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 30, y: 30 }, to: { x: 60, y: 60 } },
    ]);
    Object.defineProperty(cmd2, 'timestamp', { value: now + 50 });

    const cmd3 = new MoveElementsCommand(getStore(), [
      { nodeId: 'node-1', from: { x: 60, y: 60 }, to: { x: 100, y: 100 } },
    ]);
    Object.defineProperty(cmd3, 'timestamp', { value: now + 100 });

    engine.execute(cmd1);
    engine.execute(cmd2);
    engine.execute(cmd3);

    // 只有一个历史条目
    expect(engine.getHistory()).toHaveLength(1);

    // undo 一次 → 回到初始位置
    engine.undo();
    const found = findNodeInDiagrams(getStore(), 'node-1');
    expect(found!.x).toBe(0);
    expect(found!.y).toBe(0);

    // redo → 回到最终位置
    engine.redo();
    const found2 = findNodeInDiagrams(getStore(), 'node-1');
    expect(found2!.x).toBe(100);
    expect(found2!.y).toBe(100);
  });
});

// ===== C. CreateElementCommand =====

describe('CreateElementCommand', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();
  });

  it('3.1 execute() 添加元素和节点', () => {
    const store = getStore();
    const elem = makeElement({ id: 'new-elem' });
    const node = makeNode({ id: 'new-node', semanticElementId: 'new-elem' });
    const cmd = new CreateElementCommand(store, elem, node, 'diag-1');

    engine.execute(cmd);

    const state = getStore();
    expect(state.semanticModel.elements).toHaveLength(1);
    expect(state.semanticModel.elements[0].id).toBe('new-elem');

    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.nodes).toHaveLength(1);
    expect(diag.nodes[0].id).toBe('new-node');
  });

  it('3.2 undo() 删除元素和节点', () => {
    const store = getStore();
    const elem = makeElement({ id: 'new-elem' });
    const node = makeNode({ id: 'new-node', semanticElementId: 'new-elem' });
    const cmd = new CreateElementCommand(store, elem, node, 'diag-1');

    engine.execute(cmd);
    engine.undo();

    const state = getStore();
    expect(state.semanticModel.elements).toHaveLength(0);

    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.nodes).toHaveLength(0);
  });

  it('3.3 redo() 重新添加', () => {
    const store = getStore();
    const elem = makeElement({ id: 'new-elem' });
    const node = makeNode({ id: 'new-node', semanticElementId: 'new-elem' });
    const cmd = new CreateElementCommand(store, elem, node, 'diag-1');

    engine.execute(cmd);
    engine.undo();
    engine.redo();

    const state = getStore();
    expect(state.semanticModel.elements).toHaveLength(1);
    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.nodes).toHaveLength(1);
  });

  it('3.4 canMergeWith 始终返回 false', () => {
    const store = getStore();
    const cmd = new CreateElementCommand(
      store,
      makeElement({ id: 'e1' }),
      makeNode({ id: 'n1', semanticElementId: 'e1' }),
      'diag-1',
    );
    expect(cmd.canMergeWith(cmd)).toBe(false);
  });

  it('3.5 完整循环: execute → undo → redo 验证状态一致', () => {
    const store = getStore();
    const elem = makeElement({ id: 'cycle-elem' });
    const node = makeNode({ id: 'cycle-node', semanticElementId: 'cycle-elem' });
    const cmd = new CreateElementCommand(store, elem, node, 'diag-1');

    // execute
    engine.execute(cmd);
    expect(getStore().semanticModel.elements).toHaveLength(1);

    // undo
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(0);

    // redo
    engine.redo();
    expect(getStore().semanticModel.elements).toHaveLength(1);

    // undo again
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(0);
  });
});

// ===== D. DeleteElementCommand =====

describe('DeleteElementCommand', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();

    // 设置层级结构: parent -> child -> grandchild
    const parent = makeElement({ id: 'parent', ownerId: null });
    const child = makeElement({ id: 'child', ownerId: 'parent' });
    const grandchild = makeElement({ id: 'grandchild', ownerId: 'child' });
    const unrelated = makeElement({ id: 'unrelated', ownerId: null });

    getStore().addElement(parent);
    getStore().addElement(child);
    getStore().addElement(grandchild);
    getStore().addElement(unrelated);

    // 添加关系
    const rel = makeRelationship({
      id: 'rel-pc',
      sourceId: 'parent',
      targetId: 'child',
    });
    getStore().addRelationship(rel);

    // 添加节点到画布
    getStore().addNodeToDiagram(
      'diag-1',
      makeNode({ id: 'node-parent', semanticElementId: 'parent' }),
    );
    getStore().addNodeToDiagram(
      'diag-1',
      makeNode({ id: 'node-child', semanticElementId: 'child' }),
    );
    getStore().addNodeToDiagram(
      'diag-1',
      makeNode({ id: 'node-grandchild', semanticElementId: 'grandchild' }),
    );
    getStore().addNodeToDiagram(
      'diag-1',
      makeNode({ id: 'node-unrelated', semanticElementId: 'unrelated' }),
    );

    // 添加连线
    getStore().addEdgeToDiagram(
      'diag-1',
      makeEdge({
        id: 'edge-pc',
        semanticRelationshipId: 'rel-pc',
        sourceNodeId: 'node-parent',
        targetNodeId: 'node-child',
      }),
    );
  });

  it('4.1 execute() 删除元素及所有后代、关系、节点、连线', () => {
    const store = getStore();
    const cmd = new DeleteElementCommand(store, 'parent');

    engine.execute(cmd);

    const state = getStore();

    // parent, child, grandchild 被删除
    const elemIds = state.semanticModel.elements.map((e) => e.id);
    expect(elemIds).not.toContain('parent');
    expect(elemIds).not.toContain('child');
    expect(elemIds).not.toContain('grandchild');
    // unrelated 保留
    expect(elemIds).toContain('unrelated');

    // 关系被删除
    expect(state.semanticModel.relationships).toHaveLength(0);

    // 节点被删除
    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    const nodeIds = diag.nodes.map((n) => n.id);
    expect(nodeIds).not.toContain('node-parent');
    expect(nodeIds).not.toContain('node-child');
    expect(nodeIds).not.toContain('node-grandchild');
    expect(nodeIds).toContain('node-unrelated');

    // 连线被删除
    expect(diag.edges).toHaveLength(0);
  });

  it('4.2 undo() 完整恢复所有元素、关系、节点、连线', () => {
    const store = getStore();
    const cmd = new DeleteElementCommand(store, 'parent');

    engine.execute(cmd);
    engine.undo();

    const state = getStore();

    // 所有元素恢复
    const elemIds = state.semanticModel.elements.map((e) => e.id);
    expect(elemIds).toContain('parent');
    expect(elemIds).toContain('child');
    expect(elemIds).toContain('grandchild');
    expect(elemIds).toContain('unrelated');

    // 关系恢复
    expect(state.semanticModel.relationships).toHaveLength(1);
    expect(state.semanticModel.relationships[0].id).toBe('rel-pc');

    // 节点恢复
    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.nodes).toHaveLength(4);

    // 连线恢复
    expect(diag.edges).toHaveLength(1);
  });

  it('4.3 redo() 重新删除', () => {
    const store = getStore();
    const cmd = new DeleteElementCommand(store, 'parent');

    engine.execute(cmd);
    engine.undo();
    engine.redo();

    const state = getStore();
    const elemIds = state.semanticModel.elements.map((e) => e.id);
    expect(elemIds).not.toContain('parent');
    expect(elemIds).toContain('unrelated');
  });

  it('4.4 canMergeWith 始终返回 false', () => {
    const store = getStore();
    const cmd = new DeleteElementCommand(store, 'parent');
    expect(cmd.canMergeWith(cmd)).toBe(false);
  });

  it('4.5 删除叶子元素（无子元素）正常工作', () => {
    const store = getStore();
    const cmd = new DeleteElementCommand(store, 'unrelated');

    engine.execute(cmd);

    const state = getStore();
    const elemIds = state.semanticModel.elements.map((e) => e.id);
    expect(elemIds).not.toContain('unrelated');
    expect(elemIds).toContain('parent');
  });

  it('4.6 完整循环: execute → undo → redo → undo 验证状态一致', () => {
    // 记录初始状态
    const initialState = getStore();
    const initialElemCount = initialState.semanticModel.elements.length;
    const initialRelCount = initialState.semanticModel.relationships.length;
    const initialDiag = initialState.canvasModel.diagrams.find(
      (d) => d.id === 'diag-1',
    )!;
    const initialNodeCount = initialDiag.nodes.length;
    const initialEdgeCount = initialDiag.edges.length;

    const cmd = new DeleteElementCommand(getStore(), 'parent');

    // execute → 删除
    engine.execute(cmd);
    expect(getStore().semanticModel.elements.length).toBeLessThan(initialElemCount);

    // undo → 恢复
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(initialElemCount);
    expect(getStore().semanticModel.relationships).toHaveLength(initialRelCount);
    const diagAfterUndo = getStore().canvasModel.diagrams.find(
      (d) => d.id === 'diag-1',
    )!;
    expect(diagAfterUndo.nodes).toHaveLength(initialNodeCount);
    expect(diagAfterUndo.edges).toHaveLength(initialEdgeCount);

    // redo → 再次删除
    engine.redo();
    expect(getStore().semanticModel.elements.length).toBeLessThan(initialElemCount);

    // undo → 再次恢复
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(initialElemCount);
  });
});

// ===== E. ChangePropertyCommand =====

describe('ChangePropertyCommand', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();

    const elem = makeElement({ id: 'elem-1', name: 'Original' });
    getStore().addElement(elem);
  });

  it('5.1 execute() 修改属性值', () => {
    const store = getStore();
    const cmd = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Original',
      'Changed',
    );

    engine.execute(cmd);
    expect(getStore().semanticModel.elements[0].name).toBe('Changed');
  });

  it('5.2 undo() 恢复旧值', () => {
    const store = getStore();
    const cmd = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Original',
      'Changed',
    );

    engine.execute(cmd);
    engine.undo();

    expect(getStore().semanticModel.elements[0].name).toBe('Original');
  });

  it('5.3 redo() 重新应用新值', () => {
    const store = getStore();
    const cmd = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Original',
      'Changed',
    );

    engine.execute(cmd);
    engine.undo();
    engine.redo();

    expect(getStore().semanticModel.elements[0].name).toBe('Changed');
  });

  it('5.4 canMergeWith: 同元素同属性 200ms 内 → true', () => {
    const store = getStore();
    const cmd1 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'A',
      'B',
    );

    const cmd2 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'B',
      'C',
    );
    Object.defineProperty(cmd2, 'timestamp', { value: cmd1.timestamp + 100 });

    expect(cmd1.canMergeWith(cmd2)).toBe(true);
  });

  it('5.5 canMergeWith: 不同属性 → false', () => {
    const store = getStore();
    const cmd1 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'A',
      'B',
    );

    const cmd2 = new ChangePropertyCommand(
      store,
      'elem-1',
      'description',
      '',
      'new desc',
    );

    expect(cmd1.canMergeWith(cmd2)).toBe(false);
  });

  it('5.6 canMergeWith: 不同元素 → false', () => {
    const store = getStore();
    const cmd1 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'A',
      'B',
    );

    const cmd2 = new ChangePropertyCommand(
      store,
      'elem-2',
      'name',
      'X',
      'Y',
    );

    expect(cmd1.canMergeWith(cmd2)).toBe(false);
  });

  it('5.7 merge: 保留最早 oldValue，使用最新 newValue', () => {
    const store = getStore();
    const cmd1 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Original',
      'Mid',
    );

    const cmd2 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Mid',
      'Final',
    );

    const merged = cmd1.merge(cmd2) as ChangePropertyCommand;

    // 执行合并后的命令
    engine.execute(merged);
    expect(getStore().semanticModel.elements[0].name).toBe('Final');

    // undo 应该回到 'Original'
    engine.undo();
    expect(getStore().semanticModel.elements[0].name).toBe('Original');
  });

  it('5.8 引擎自动合并连续属性修改', () => {
    const store = getStore();
    const now = Date.now();

    const cmd1 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Original',
      'A',
    );
    Object.defineProperty(cmd1, 'timestamp', { value: now });

    const cmd2 = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'A',
      'B',
    );
    Object.defineProperty(cmd2, 'timestamp', { value: now + 50 });

    engine.execute(cmd1);
    engine.execute(cmd2);

    // 应该合并为一条历史
    expect(engine.getHistory()).toHaveLength(1);

    // 元素名应为最后一次的值
    expect(getStore().semanticModel.elements[0].name).toBe('B');

    // undo 一次回到 Original
    engine.undo();
    expect(getStore().semanticModel.elements[0].name).toBe('Original');
  });

  it('5.9 完整循环: execute → undo → redo', () => {
    const store = getStore();
    const cmd = new ChangePropertyCommand(
      store,
      'elem-1',
      'name',
      'Original',
      'Changed',
    );

    engine.execute(cmd);
    expect(getStore().semanticModel.elements[0].name).toBe('Changed');

    engine.undo();
    expect(getStore().semanticModel.elements[0].name).toBe('Original');

    engine.redo();
    expect(getStore().semanticModel.elements[0].name).toBe('Changed');
  });
});

// ===== F. CreateConnectionCommand =====

describe('CreateConnectionCommand', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();

    // 添加两个元素及其节点（连线的前提）
    const elem1 = makeElement({ id: 'elem-1' });
    const elem2 = makeElement({ id: 'elem-2' });
    getStore().addElement(elem1);
    getStore().addElement(elem2);

    getStore().addNodeToDiagram(
      'diag-1',
      makeNode({ id: 'node-1', semanticElementId: 'elem-1' }),
    );
    getStore().addNodeToDiagram(
      'diag-1',
      makeNode({ id: 'node-2', semanticElementId: 'elem-2' }),
    );
  });

  it('6.1 execute() 添加关系和连线', () => {
    const store = getStore();
    const rel = makeRelationship({
      id: 'rel-1',
      sourceId: 'elem-1',
      targetId: 'elem-2',
    });
    const edge = makeEdge({
      id: 'edge-1',
      semanticRelationshipId: 'rel-1',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
    });
    const cmd = new CreateConnectionCommand(store, edge, rel, 'diag-1');

    engine.execute(cmd);

    const state = getStore();
    expect(state.semanticModel.relationships).toHaveLength(1);
    expect(state.semanticModel.relationships[0].id).toBe('rel-1');

    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.edges).toHaveLength(1);
    expect(diag.edges[0].id).toBe('edge-1');
  });

  it('6.2 undo() 删除关系和连线', () => {
    const store = getStore();
    const rel = makeRelationship({
      id: 'rel-1',
      sourceId: 'elem-1',
      targetId: 'elem-2',
    });
    const edge = makeEdge({
      id: 'edge-1',
      semanticRelationshipId: 'rel-1',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
    });
    const cmd = new CreateConnectionCommand(store, edge, rel, 'diag-1');

    engine.execute(cmd);
    engine.undo();

    const state = getStore();
    expect(state.semanticModel.relationships).toHaveLength(0);

    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.edges).toHaveLength(0);
  });

  it('6.3 redo() 重新添加', () => {
    const store = getStore();
    const rel = makeRelationship({
      id: 'rel-1',
      sourceId: 'elem-1',
      targetId: 'elem-2',
    });
    const edge = makeEdge({
      id: 'edge-1',
      semanticRelationshipId: 'rel-1',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
    });
    const cmd = new CreateConnectionCommand(store, edge, rel, 'diag-1');

    engine.execute(cmd);
    engine.undo();
    engine.redo();

    const state = getStore();
    expect(state.semanticModel.relationships).toHaveLength(1);
    const diag = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    expect(diag.edges).toHaveLength(1);
  });

  it('6.4 canMergeWith 始终返回 false', () => {
    const store = getStore();
    const rel = makeRelationship({ id: 'r1' });
    const edge = makeEdge({ id: 'e1', semanticRelationshipId: 'r1' });
    const cmd = new CreateConnectionCommand(store, edge, rel, 'diag-1');
    expect(cmd.canMergeWith(cmd)).toBe(false);
  });

  it('6.5 完整循环: execute → undo → redo', () => {
    const store = getStore();
    const rel = makeRelationship({
      id: 'rel-cycle',
      sourceId: 'elem-1',
      targetId: 'elem-2',
    });
    const edge = makeEdge({
      id: 'edge-cycle',
      semanticRelationshipId: 'rel-cycle',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
    });
    const cmd = new CreateConnectionCommand(store, edge, rel, 'diag-1');

    engine.execute(cmd);
    expect(getStore().semanticModel.relationships).toHaveLength(1);

    engine.undo();
    expect(getStore().semanticModel.relationships).toHaveLength(0);

    engine.redo();
    expect(getStore().semanticModel.relationships).toHaveLength(1);
  });
});

// ===== G. 综合场景测试 =====

describe('综合场景', () => {
  let engine: UndoRedoEngine;

  beforeEach(() => {
    resetStore();
    engine = new UndoRedoEngine();
  });

  it('7.1 混合操作序列: 创建 → 移动 → 删除 → undo 全部撤销', () => {
    // 1. 创建元素
    const elem = makeElement({ id: 'mixed-elem' });
    const node = makeNode({ id: 'mixed-node', semanticElementId: 'mixed-elem' });
    engine.execute(new CreateElementCommand(getStore(), elem, node, 'diag-1'));

    // 2. 移动元素
    engine.execute(
      new MoveElementsCommand(getStore(), [
        {
          nodeId: 'mixed-node',
          from: { x: 0, y: 0 },
          to: { x: 150, y: 250 },
        },
      ]),
    );

    // 3. 删除元素（必须用最新的 store 读取快照）
    engine.execute(new DeleteElementCommand(getStore(), 'mixed-elem'));

    // 验证：元素被删除
    expect(getStore().semanticModel.elements).toHaveLength(0);

    // undo 1: 恢复删除
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(1);
    const foundAfterUndo1 = findNodeInDiagrams(getStore(), 'mixed-node');
    expect(foundAfterUndo1!.x).toBe(150);
    expect(foundAfterUndo1!.y).toBe(250);

    // undo 2: 撤销移动
    engine.undo();
    const foundAfterUndo2 = findNodeInDiagrams(getStore(), 'mixed-node');
    expect(foundAfterUndo2!.x).toBe(0);
    expect(foundAfterUndo2!.y).toBe(0);

    // undo 3: 撤销创建
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(0);
    expect(engine.canUndo()).toBe(false);
  });

  it('7.2 全部 redo 恢复所有操作', () => {
    const elem = makeElement({ id: 'redo-elem' });
    const node = makeNode({ id: 'redo-node', semanticElementId: 'redo-elem' });
    engine.execute(new CreateElementCommand(getStore(), elem, node, 'diag-1'));
    engine.execute(
      new MoveElementsCommand(getStore(), [
        { nodeId: 'redo-node', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
      ]),
    );

    // undo all
    engine.undo();
    engine.undo();
    expect(getStore().semanticModel.elements).toHaveLength(0);

    // redo all
    engine.redo();
    expect(getStore().semanticModel.elements).toHaveLength(1);

    engine.redo();
    const found = findNodeInDiagrams(getStore(), 'redo-node');
    expect(found!.x).toBe(100);
    expect(found!.y).toBe(100);
  });

  it('7.3 undo 中途执行新命令，重做栈清空', () => {
    const elem1 = makeElement({ id: 'elem-a' });
    const node1 = makeNode({ id: 'node-a', semanticElementId: 'elem-a' });
    engine.execute(new CreateElementCommand(getStore(), elem1, node1, 'diag-1'));

    const elem2 = makeElement({ id: 'elem-b' });
    const node2 = makeNode({ id: 'node-b', semanticElementId: 'elem-b' });
    engine.execute(new CreateElementCommand(getStore(), elem2, node2, 'diag-1'));

    // undo one step
    engine.undo();
    expect(engine.canRedo()).toBe(true);

    // 执行新命令
    const elem3 = makeElement({ id: 'elem-c' });
    const node3 = makeNode({ id: 'node-c', semanticElementId: 'elem-c' });
    engine.execute(new CreateElementCommand(getStore(), elem3, node3, 'diag-1'));

    // 重做栈应该被清空
    expect(engine.canRedo()).toBe(false);

    // undo 栈应该包含 elem-a 和 elem-c
    const history = engine.getHistory();
    expect(history).toHaveLength(2);
  });

  it('7.4 getHistory 返回完整操作历史', () => {
    const elem = makeElement({ id: 'hist-elem', name: 'hist-elem' });
    const node = makeNode({ id: 'hist-node', semanticElementId: 'hist-elem' });
    engine.execute(new CreateElementCommand(getStore(), elem, node, 'diag-1'));

    engine.execute(
      new MoveElementsCommand(getStore(), [
        { nodeId: 'hist-node', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
      ]),
    );

    const history = engine.getHistory();
    expect(history).toHaveLength(2);

    expect(history[0].commandType).toBe('create-element');
    expect(history[0]).toHaveProperty('timestamp');
    expect(history[0].description).toContain('hist-elem');

    expect(history[1].commandType).toBe('move-elements');
    expect(history[1].description).toContain('hist-node');

    // undo 后 history 应该减少
    engine.undo();
    expect(engine.getHistory()).toHaveLength(1);

    // 验证 HistoryEntry 接口成员
    for (const entry of history) {
      expect(typeof entry.commandType).toBe('string');
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.description).toBe('string');
    }
  });
});

// ===== H. 类型和接口完整性 =====

describe('类型和接口完整性', () => {
  it('8.1 ICommand 接口定义了所有必需成员', () => {
    // 类型级验证：构造一个实现 ICommand 的对象
    const cmd: ICommand = {
      type: 'test',
      timestamp: Date.now(),
      execute: () => {},
      undo: () => {},
      canMergeWith: () => false,
      merge: (other) => other,
      getDescription: () => 'test command',
    };

    expect(cmd.type).toBeDefined();
    expect(cmd.timestamp).toBeDefined();
    expect(typeof cmd.execute).toBe('function');
    expect(typeof cmd.undo).toBe('function');
    expect(typeof cmd.canMergeWith).toBe('function');
    expect(typeof cmd.merge).toBe('function');
    expect(typeof cmd.getDescription).toBe('function');
  });

  it('8.2 IUndoRedoEngine 接口定义了所有必需成员', () => {
    const engine: IUndoRedoEngine = new UndoRedoEngine();

    expect(typeof engine.execute).toBe('function');
    expect(typeof engine.undo).toBe('function');
    expect(typeof engine.redo).toBe('function');
    expect(typeof engine.canUndo).toBe('function');
    expect(typeof engine.canRedo).toBe('function');
    expect(typeof engine.clear).toBe('function');
    expect(typeof engine.getHistory).toBe('function');
  });

  it('8.3 所有 Concrete Command 实现 ICommand', () => {
    resetStore();
    const store = getStore();

    const moveCmd = new MoveElementsCommand(store, [
      { nodeId: 'n1', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    ]);
    const createCmd = new CreateElementCommand(
      store,
      makeElement(),
      makeNode(),
      'diag-1',
    );
    const deleteCmd = new DeleteElementCommand(store, 'some-id');
    const changeCmd = new ChangePropertyCommand(
      store,
      'e1',
      'name',
      'old',
      'new',
    );
    const connCmd = new CreateConnectionCommand(
      store,
      makeEdge(),
      makeRelationship(),
      'diag-1',
    );

    // 所有命令都实现了 ICommand 的方法
    for (const cmd of [moveCmd, createCmd, deleteCmd, changeCmd, connCmd]) {
      expect(typeof cmd.type).toBe('string');
      expect(typeof cmd.timestamp).toBe('number');
      expect(typeof cmd.execute).toBe('function');
      expect(typeof cmd.undo).toBe('function');
      expect(typeof cmd.canMergeWith).toBe('function');
      expect(typeof cmd.merge).toBe('function');
      expect(typeof cmd.getDescription).toBe('function');
    }
  });
});

// ---- 辅助函数 ----

/**
 * 跨所有 Diagram 查找节点
 */
function findNodeInDiagrams(
  store: AppStore,
  nodeId: string,
): DiagramNode | undefined {
  for (const diag of store.canvasModel.diagrams) {
    const found = diag.nodes.find((n) => n.id === nodeId);
    if (found) return found;
  }
  return undefined;
}
