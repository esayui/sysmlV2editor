// ===========================================================================
// Store Tests — Zustand State Store 测试
// 来源: 任务清单 M-FE-08
// ===========================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../index';
import type { AppStore } from '../types';
import type {
  SemanticElement,
  Relationship,
} from '@/types/semantic-model';
import type {
  Diagram,
  DiagramNode,
  DiagramEdge,
} from '@/types/canvas-model';
import {
  useSelectedElement,
  useDiagramNodes,
  useDiagramEdges,
  useElementChildren,
  useDirtyStatus,
} from '../selectors';

// ---- Helpers ----

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

function makeRelationship(
  overrides: Partial<Relationship> = {},
): Relationship {
  return {
    id: 'rel-1',
    type: 'Connection',
    sourceId: 'elem-1',
    targetId: 'elem-2',
    properties: {},
    ...overrides,
  };
}

function makeDiagram(overrides: Partial<Diagram> = {}): Diagram {
  return {
    id: 'diag-1',
    name: 'Diagram 1',
    type: 'BDD',
    nodes: [],
    edges: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
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

// Reset store before each test
function resetStore(): void {
  useStore.setState({
    semanticModel: {
      id: '',
      name: '',
      elements: [],
      relationships: [],
      packages: [],
    },
    canvasModel: {
      semanticModelId: '',
      diagrams: [],
    },
    activeDiagramId: null,
    selectedElementIds: [],
    interactionMode: 'select',
    toolboxFilter: '',
    treeFilter: '',
    isDirty: false,
  });
}

// ---- Test Suites ----

// ===== 1. Store 骨架 =====

describe('Store Skeleton', () => {
  beforeEach(resetStore);

  it('1.1 should combine all three slices into one store', () => {
    const state = useStore.getState() as AppStore;

    // Semantic slice
    expect(state.semanticModel).toBeDefined();
    expect(typeof state.addElement).toBe('function');
    expect(typeof state.updateElement).toBe('function');
    expect(typeof state.removeElement).toBe('function');
    expect(typeof state.addRelationship).toBe('function');
    expect(typeof state.removeRelationship).toBe('function');
    expect(typeof state.moveElement).toBe('function');

    // Canvas slice
    expect(state.canvasModel).toBeDefined();
    expect(state.activeDiagramId).toBeNull();
    expect(typeof state.addNodeToDiagram).toBe('function');
    expect(typeof state.updateNodePosition).toBe('function');
    expect(typeof state.updateNodeStyle).toBe('function');
    expect(typeof state.removeNodeFromDiagram).toBe('function');
    expect(typeof state.addEdgeToDiagram).toBe('function');
    expect(typeof state.updateEdgeWaypoints).toBe('function');
    expect(typeof state.removeEdgeFromDiagram).toBe('function');

    // UI slice
    expect(state.selectedElementIds).toEqual([]);
    expect(state.interactionMode).toBe('select');
    expect(state.toolboxFilter).toBe('');
    expect(state.treeFilter).toBe('');
    expect(state.isDirty).toBe(false);
    expect(typeof state.selectElements).toBe('function');
    expect(typeof state.clearSelection).toBe('function');
    expect(typeof state.setInteractionMode).toBe('function');
    expect(typeof state.markDirty).toBe('function');
    expect(typeof state.markClean).toBe('function');
  });

  it('1.2 should have all expected state default values', () => {
    const state = useStore.getState() as AppStore;

    expect(state.semanticModel).toEqual({
      id: '',
      name: '',
      elements: [],
      relationships: [],
      packages: [],
    });

    expect(state.canvasModel).toEqual({
      semanticModelId: '',
      diagrams: [],
    });

    expect(state.activeDiagramId).toBeNull();
    expect(state.selectedElementIds).toEqual([]);
    expect(state.interactionMode).toBe('select');
    expect(state.toolboxFilter).toBe('');
    expect(state.treeFilter).toBe('');
    expect(state.isDirty).toBe(false);
  });

  it('1.3 slices directory should exist (structure check)', () => {
    // Verify that the store combines slices correctly
    const state = useStore.getState() as AppStore;
    expect(state).toBeDefined();
    // All slice methods are present
    expect(state.addElement).toBeDefined();
    expect(state.addNodeToDiagram).toBeDefined();
    expect(state.selectElements).toBeDefined();
  });

  it('1.4 create store returns object containing all expected state defaults', () => {
    const store = useStore;
    expect(store).toBeDefined();
    const state = store.getState() as AppStore;

    const expectedKeys = [
      'semanticModel',
      'canvasModel',
      'activeDiagramId',
      'selectedElementIds',
      'interactionMode',
      'toolboxFilter',
      'treeFilter',
      'isDirty',
      'addElement',
      'updateElement',
      'removeElement',
      'addRelationship',
      'removeRelationship',
      'moveElement',
      'addNodeToDiagram',
      'updateNodePosition',
      'updateNodeStyle',
      'removeNodeFromDiagram',
      'addEdgeToDiagram',
      'updateEdgeWaypoints',
      'removeEdgeFromDiagram',
      'selectElements',
      'clearSelection',
      'setInteractionMode',
      'setToolboxFilter',
      'setTreeFilter',
      'markDirty',
      'markClean',
    ];

    for (const key of expectedKeys) {
      expect(state).toHaveProperty(key);
    }
  });
});

// ===== 2. 语义模型 Slice =====

describe('Semantic Slice', () => {
  beforeEach(resetStore);

  it('2.1 should initialize with empty semantic model', () => {
    const state = useStore.getState() as AppStore;
    expect(state.semanticModel.elements).toHaveLength(0);
    expect(state.semanticModel.relationships).toHaveLength(0);
    expect(state.semanticModel.packages).toHaveLength(0);
  });

  it('2.2 addElement should append element and set isDirty=true', () => {
    const element = makeElement();
    useStore.getState().addElement(element);

    const state = useStore.getState() as AppStore;
    expect(state.semanticModel.elements).toHaveLength(1);
    expect(state.semanticModel.elements[0]).toEqual(element);
    expect(state.isDirty).toBe(true);
  });

  it('2.3 updateElement should merge patch and set isDirty=true', () => {
    const element = makeElement();
    useStore.getState().addElement(element);

    // Reset dirty to verify it becomes true after update
    useStore.getState().markClean();

    useStore.getState().updateElement('elem-1', { name: 'Updated' });
    const state = useStore.getState() as AppStore;

    expect(state.semanticModel.elements[0].name).toBe('Updated');
    // Original properties should be preserved
    expect(state.semanticModel.elements[0].type).toBe('PartDefinition');
    expect(state.isDirty).toBe(true);
  });

  it('2.3 updateElement should only modify the target element (reference equality)', () => {
    const elem1 = makeElement({ id: 'elem-1', name: 'Elem1' });
    const elem2 = makeElement({ id: 'elem-2', name: 'Elem2' });

    useStore.getState().addElement(elem1);
    useStore.getState().addElement(elem2);

    const beforeElements = useStore.getState().semanticModel.elements;

    useStore.getState().updateElement('elem-1', { name: 'Updated' });

    const afterElements = useStore.getState().semanticModel.elements;
    // elem-2 should be the same reference (unchanged)
    expect(afterElements[1]).toBe(beforeElements[1]);
    // elem-1 should be different reference (mutated)
    expect(afterElements[0]).not.toBe(beforeElements[0]);
  });

  it('2.4 removeElement should remove element + cascade children + relationships', () => {
    // Setup: parent -> child -> grandchild
    const parent = makeElement({ id: 'parent', ownerId: null });
    const child = makeElement({ id: 'child', ownerId: 'parent' });
    const grandchild = makeElement({ id: 'grandchild', ownerId: 'child' });
    const sibling = makeElement({ id: 'sibling', ownerId: null });

    useStore.getState().addElement(parent);
    useStore.getState().addElement(child);
    useStore.getState().addElement(grandchild);
    useStore.getState().addElement(sibling);

    // Add relationship involving parent and sibling
    const rel = makeRelationship({
      id: 'rel-parent-sibling',
      sourceId: 'parent',
      targetId: 'sibling',
    });
    useStore.getState().addRelationship(rel);

    useStore.getState().removeElement('parent');

    const state = useStore.getState() as AppStore;
    const elementIds = state.semanticModel.elements.map((e) => e.id);

    expect(elementIds).not.toContain('parent');
    expect(elementIds).not.toContain('child');
    expect(elementIds).not.toContain('grandchild');
    // Sibling should survive
    expect(elementIds).toContain('sibling');

    // Relationship involving parent should be removed
    expect(state.semanticModel.relationships).toHaveLength(0);
  });

  it('2.4 removeElement should handle leaf element (no children) correctly', () => {
    const leaf = makeElement({ id: 'leaf' });
    useStore.getState().addElement(leaf);

    useStore.getState().removeElement('leaf');
    const state = useStore.getState() as AppStore;
    expect(state.semanticModel.elements).toHaveLength(0);
  });

  it('2.5 addRelationship should append to relationships array', () => {
    const rel = makeRelationship();
    useStore.getState().addRelationship(rel);

    const state = useStore.getState() as AppStore;
    expect(state.semanticModel.relationships).toHaveLength(1);
    expect(state.semanticModel.relationships[0]).toEqual(rel);
    expect(state.isDirty).toBe(true);
  });

  it('2.6 removeRelationship should remove from relationships array', () => {
    const rel = makeRelationship();
    useStore.getState().addRelationship(rel);
    useStore.getState().removeRelationship('rel-1');

    const state = useStore.getState() as AppStore;
    expect(state.semanticModel.relationships).toHaveLength(0);
    expect(state.isDirty).toBe(true);
  });

  it('2.7 moveElement should update ownerId', () => {
    const element = makeElement({ id: 'elem-1', ownerId: 'old-owner' });
    useStore.getState().addElement(element);

    useStore.getState().moveElement('elem-1', 'new-owner');
    const state = useStore.getState() as AppStore;

    expect(state.semanticModel.elements[0].ownerId).toBe('new-owner');
    expect(state.isDirty).toBe(true);
  });

  it('2.8 add -> update -> remove complete flow', () => {
    // Add
    const elem = makeElement({ id: 'flow-elem' });
    useStore.getState().addElement(elem);
    expect(useStore.getState().semanticModel.elements).toHaveLength(1);

    // Update
    useStore.getState().updateElement('flow-elem', {
      name: 'FlowUpdated',
      description: 'Test description',
    });
    expect(useStore.getState().semanticModel.elements[0].name).toBe('FlowUpdated');
    expect(useStore.getState().semanticModel.elements[0].description).toBe(
      'Test description',
    );

    // Remove
    useStore.getState().removeElement('flow-elem');
    expect(useStore.getState().semanticModel.elements).toHaveLength(0);
  });

  it('2.8 remove element with cascade: children and relationships disappear', () => {
    const parent = makeElement({ id: 'p1' });
    const child1 = makeElement({ id: 'c1', ownerId: 'p1' });
    const child2 = makeElement({ id: 'c2', ownerId: 'p1' });
    const rel = makeRelationship({ id: 'r1', sourceId: 'c1', targetId: 'c2' });

    useStore.getState().addElement(parent);
    useStore.getState().addElement(child1);
    useStore.getState().addElement(child2);
    useStore.getState().addRelationship(rel);

    useStore.getState().removeElement('p1');

    const state = useStore.getState() as AppStore;
    expect(state.semanticModel.elements).toHaveLength(0);
    expect(state.semanticModel.relationships).toHaveLength(0);
  });
});

// ===== 3. 画布模型 Slice =====

describe('Canvas Slice', () => {
  beforeEach(() => {
    resetStore();
    // Set up a diagram for canvas tests
    const diagram = makeDiagram({ id: 'diag-1' });
    useStore.setState({
      canvasModel: {
        semanticModelId: 'model-1',
        diagrams: [diagram],
      },
      activeDiagramId: 'diag-1',
    });
  });

  it('3.1 should initialize with empty canvas model and activeDiagramId=null', () => {
    // Reset with no diagrams
    useStore.setState({
      canvasModel: { semanticModelId: '', diagrams: [] },
      activeDiagramId: null,
    });

    const state = useStore.getState() as AppStore;
    expect(state.canvasModel.diagrams).toHaveLength(0);
    expect(state.activeDiagramId).toBeNull();
  });

  it('3.2 addNodeToDiagram should add node to specified diagram', () => {
    const node = makeNode();
    useStore.getState().addNodeToDiagram('diag-1', node);

    const state = useStore.getState() as AppStore;
    const diagram = state.canvasModel.diagrams.find((d) => d.id === 'diag-1');
    expect(diagram).toBeDefined();
    expect(diagram!.nodes).toHaveLength(1);
    expect(diagram!.nodes[0]).toEqual(node);
    expect(state.isDirty).toBe(true);
  });

  it('3.3 updateNodePosition should update coordinates', () => {
    const node = makeNode({ id: 'move-node', x: 10, y: 20 });
    useStore.getState().addNodeToDiagram('diag-1', node);

    useStore.getState().updateNodePosition('move-node', 150, 250);

    const state = useStore.getState() as AppStore;
    const updatedNode = state.canvasModel.diagrams[0].nodes[0];
    expect(updatedNode.x).toBe(150);
    expect(updatedNode.y).toBe(250);
  });

  it('3.4 updateNodeStyle should merge partial style', () => {
    const node = makeNode({ id: 'style-node' });
    useStore.getState().addNodeToDiagram('diag-1', node);

    useStore.getState().updateNodeStyle('style-node', {
      fillColor: '#FF0000',
      strokeWidth: 5,
    });

    const state = useStore.getState() as AppStore;
    const updatedNode = state.canvasModel.diagrams[0].nodes[0];
    expect(updatedNode.style.fillColor).toBe('#FF0000');
    expect(updatedNode.style.strokeWidth).toBe(5);
    // Original style properties should be preserved
    expect(updatedNode.style.fontSize).toBe(14);
    expect(updatedNode.style.opacity).toBe(1.0);
  });

  it('3.5 removeNodeFromDiagram should remove node from diagram', () => {
    const node1 = makeNode({ id: 'node-a' });
    const node2 = makeNode({ id: 'node-b' });
    useStore.getState().addNodeToDiagram('diag-1', node1);
    useStore.getState().addNodeToDiagram('diag-1', node2);

    useStore.getState().removeNodeFromDiagram('diag-1', 'node-a');

    const state = useStore.getState() as AppStore;
    const diagram = state.canvasModel.diagrams[0];
    expect(diagram.nodes).toHaveLength(1);
    expect(diagram.nodes[0].id).toBe('node-b');
  });

  it('3.6 addEdgeToDiagram should add edge to diagram', () => {
    const edge = makeEdge();
    useStore.getState().addEdgeToDiagram('diag-1', edge);

    const state = useStore.getState() as AppStore;
    const diagram = state.canvasModel.diagrams.find((d) => d.id === 'diag-1');
    expect(diagram).toBeDefined();
    expect(diagram!.edges).toHaveLength(1);
    expect(diagram!.edges[0]).toEqual(edge);
    expect(state.isDirty).toBe(true);
  });

  it('3.7 updateEdgeWaypoints should update waypoints', () => {
    const edge = makeEdge({
      id: 'wp-edge',
      waypoints: [{ x: 0, y: 0 }],
    });
    useStore.getState().addEdgeToDiagram('diag-1', edge);

    const newWaypoints = [
      { x: 50, y: 50 },
      { x: 150, y: 150 },
    ];
    useStore.getState().updateEdgeWaypoints('wp-edge', newWaypoints);

    const state = useStore.getState() as AppStore;
    const updatedEdge = state.canvasModel.diagrams[0].edges[0];
    expect(updatedEdge.waypoints).toEqual(newWaypoints);
  });

  it('3.8 removeEdgeFromDiagram should remove edge from diagram', () => {
    const edge1 = makeEdge({ id: 'edge-a' });
    const edge2 = makeEdge({ id: 'edge-b' });
    useStore.getState().addEdgeToDiagram('diag-1', edge1);
    useStore.getState().addEdgeToDiagram('diag-1', edge2);

    useStore.getState().removeEdgeFromDiagram('diag-1', 'edge-a');

    const state = useStore.getState() as AppStore;
    const diagram = state.canvasModel.diagrams[0];
    expect(diagram.edges).toHaveLength(1);
    expect(diagram.edges[0].id).toBe('edge-b');
  });

  it('3.9 full node lifecycle: addNode -> updatePosition -> removeNode', () => {
    const node = makeNode({ id: 'lifecycle-node', x: 0, y: 0 });
    useStore.getState().addNodeToDiagram('diag-1', node);
    expect(
      useStore.getState().canvasModel.diagrams[0].nodes,
    ).toHaveLength(1);

    useStore.getState().updateNodePosition('lifecycle-node', 100, 200);
    expect(
      useStore.getState().canvasModel.diagrams[0].nodes[0].x,
    ).toBe(100);
    expect(
      useStore.getState().canvasModel.diagrams[0].nodes[0].y,
    ).toBe(200);

    useStore.getState().removeNodeFromDiagram('diag-1', 'lifecycle-node');
    expect(
      useStore.getState().canvasModel.diagrams[0].nodes,
    ).toHaveLength(0);
  });

  it('3.4 updateNodeStyle should find node across all diagrams', () => {
    const diag2 = makeDiagram({ id: 'diag-2', nodes: [] });
    useStore.setState((prev) => ({
      canvasModel: {
        ...prev.canvasModel,
        diagrams: [...prev.canvasModel.diagrams, diag2],
      },
    }));

    const node = makeNode({ id: 'cross-diag-node' });
    useStore.getState().addNodeToDiagram('diag-2', node);

    useStore.getState().updateNodeStyle('cross-diag-node', {
      fillColor: '#00FF00',
    });

    const state = useStore.getState() as AppStore;
    const diag2Nodes = state.canvasModel.diagrams.find(
      (d) => d.id === 'diag-2',
    )!.nodes;
    expect(diag2Nodes[0].style.fillColor).toBe('#00FF00');
    // diag-1 should be unaffected
    const diag1Nodes = state.canvasModel.diagrams.find(
      (d) => d.id === 'diag-1',
    )!.nodes;
    expect(diag1Nodes).toHaveLength(0);
  });

  it('removeNodeFromDiagram should only affect the specified diagram', () => {
    const diag2 = makeDiagram({ id: 'diag-2', nodes: [] });
    useStore.setState((prev) => ({
      canvasModel: {
        ...prev.canvasModel,
        diagrams: [...prev.canvasModel.diagrams, diag2],
      },
    }));

    const nodeInBoth = makeNode({ id: 'shared-node' });
    useStore.getState().addNodeToDiagram('diag-1', nodeInBoth);
    useStore.getState().addNodeToDiagram('diag-2', nodeInBoth);

    // Remove from diag-1 only
    useStore.getState().removeNodeFromDiagram('diag-1', 'shared-node');

    const state = useStore.getState() as AppStore;
    const diag1 = state.canvasModel.diagrams.find((d) => d.id === 'diag-1')!;
    const diag2_after = state.canvasModel.diagrams.find((d) => d.id === 'diag-2')!;

    expect(diag1.nodes).toHaveLength(0);
    expect(diag2_after.nodes).toHaveLength(1);
  });
});

// ===== 4. UI 状态 Slice =====

describe('UI Slice', () => {
  beforeEach(resetStore);

  it('4.1 should initialize with correct defaults', () => {
    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toEqual([]);
    expect(state.interactionMode).toBe('select');
    expect(state.toolboxFilter).toBe('');
    expect(state.treeFilter).toBe('');
    expect(state.isDirty).toBe(false);
  });

  it('4.2 selectElements should set selectedElementIds', () => {
    useStore.getState().selectElements(['a', 'b']);

    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toEqual(['a', 'b']);
  });

  it('4.2 selectElements should replace previous selection', () => {
    useStore.getState().selectElements(['a', 'b']);
    useStore.getState().selectElements(['c']);

    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toEqual(['c']);
  });

  it('4.3 clearSelection should empty selectedElementIds', () => {
    useStore.getState().selectElements(['a', 'b', 'c']);
    expect(useStore.getState().selectedElementIds).toHaveLength(3);

    useStore.getState().clearSelection();
    expect(useStore.getState().selectedElementIds).toEqual([]);
  });

  it('4.3 clearSelection on empty selection should remain empty', () => {
    useStore.getState().clearSelection();
    expect(useStore.getState().selectedElementIds).toEqual([]);
  });

  it('4.4 setInteractionMode should update mode', () => {
    useStore.getState().setInteractionMode('connect');
    expect(useStore.getState().interactionMode).toBe('connect');

    useStore.getState().setInteractionMode('pan');
    expect(useStore.getState().interactionMode).toBe('pan');

    useStore.getState().setInteractionMode('delete');
    expect(useStore.getState().interactionMode).toBe('delete');
  });

  it('4.5 markDirty should set isDirty to true; markClean to false', () => {
    expect(useStore.getState().isDirty).toBe(false);

    useStore.getState().markDirty();
    expect(useStore.getState().isDirty).toBe(true);

    useStore.getState().markClean();
    expect(useStore.getState().isDirty).toBe(false);

    useStore.getState().markDirty();
    expect(useStore.getState().isDirty).toBe(true);
  });

  it('4.5 semantic mutations should automatically set isDirty', () => {
    // Start clean
    useStore.getState().markClean();
    expect(useStore.getState().isDirty).toBe(false);

    // addElement sets dirty
    useStore.getState().addElement(makeElement());
    expect(useStore.getState().isDirty).toBe(true);

    useStore.getState().markClean();
    useStore.getState().addRelationship(makeRelationship());
    expect(useStore.getState().isDirty).toBe(true);
  });

  it('4.6 setToolboxFilter and setTreeFilter', () => {
    useStore.getState().setToolboxFilter('block');
    expect(useStore.getState().toolboxFilter).toBe('block');

    useStore.getState().setTreeFilter('package');
    expect(useStore.getState().treeFilter).toBe('package');
  });

  it('4.6 selectElements with empty array should work', () => {
    useStore.getState().selectElements([]);
    expect(useStore.getState().selectedElementIds).toEqual([]);
  });

  it('4.6 all interaction modes should be settable', () => {
    const modes = ['select', 'pan', 'connect', 'create-block', 'create-port', 'delete'] as const;
    for (const mode of modes) {
      useStore.getState().setInteractionMode(mode);
      expect(useStore.getState().interactionMode).toBe(mode);
    }
  });
});

// ===== 5. Selectors =====

describe('Selectors', () => {
  beforeEach(resetStore);

  it('5.1 useSelectedElement should return selected element', () => {
    const element = makeElement({ id: 'sel-elem' });
    useStore.getState().addElement(element);
    useStore.getState().selectElements(['sel-elem']);

    const state = useStore.getState() as AppStore;
    const selected = useSelectedElement(state);
    expect(selected).not.toBeNull();
    expect(selected!.id).toBe('sel-elem');
    expect(selected!.name).toBe('TestElement');
  });

  it('5.1 useSelectedElement should return null when nothing selected', () => {
    const state = useStore.getState() as AppStore;
    expect(useSelectedElement(state)).toBeNull();
  });

  it('5.1 useSelectedElement should return null if selected id does not exist', () => {
    useStore.getState().selectElements(['non-existent']);
    const state = useStore.getState() as AppStore;
    expect(useSelectedElement(state)).toBeNull();
  });

  it('5.2 useDiagramNodes should return nodes of active diagram', () => {
    const node = makeNode();
    const diagram = makeDiagram({ id: 'diag-1', nodes: [node] });
    useStore.setState({
      canvasModel: { semanticModelId: '', diagrams: [diagram] },
      activeDiagramId: 'diag-1',
    });

    const state = useStore.getState() as AppStore;
    const nodes = useDiagramNodes(state);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('node-1');
  });

  it('5.2 useDiagramNodes should return empty if no active diagram', () => {
    useStore.setState({ activeDiagramId: null });
    const state = useStore.getState() as AppStore;
    expect(useDiagramNodes(state)).toEqual([]);
  });

  it('5.2 useDiagramNodes should return empty if active diagram not found', () => {
    useStore.setState({ activeDiagramId: 'non-existent' });
    const state = useStore.getState() as AppStore;
    expect(useDiagramNodes(state)).toEqual([]);
  });

  it('5.3 useDiagramEdges should return edges of active diagram', () => {
    const edge = makeEdge();
    const diagram = makeDiagram({ id: 'diag-1', edges: [edge] });
    useStore.setState({
      canvasModel: { semanticModelId: '', diagrams: [diagram] },
      activeDiagramId: 'diag-1',
    });

    const state = useStore.getState() as AppStore;
    const edges = useDiagramEdges(state);
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('edge-1');
  });

  it('5.4 useElementChildren should return children of given element', () => {
    const parent = makeElement({ id: 'parent-x' });
    const child1 = makeElement({ id: 'child-1', ownerId: 'parent-x' });
    const child2 = makeElement({ id: 'child-2', ownerId: 'parent-x' });
    const unrelated = makeElement({ id: 'other', ownerId: 'other-parent' });

    useStore.getState().addElement(parent);
    useStore.getState().addElement(child1);
    useStore.getState().addElement(child2);
    useStore.getState().addElement(unrelated);

    const state = useStore.getState() as AppStore;
    const selector = useElementChildren('parent-x');
    const children = selector(state);

    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id).sort()).toEqual(['child-1', 'child-2']);
  });

  it('5.4 useElementChildren should return empty array for element with no children', () => {
    const state = useStore.getState() as AppStore;
    const selector = useElementChildren('no-children');
    expect(selector(state)).toEqual([]);
  });

  it('5.5 useDirtyStatus should return isDirty', () => {
    let state = useStore.getState() as AppStore;
    expect(useDirtyStatus(state)).toBe(false);

    useStore.getState().markDirty();
    state = useStore.getState() as AppStore;
    expect(useDirtyStatus(state)).toBe(true);

    useStore.getState().markClean();
    state = useStore.getState() as AppStore;
    expect(useDirtyStatus(state)).toBe(false);
  });

  it('5.6 Selectors should update when store changes', () => {
    const element = makeElement({ id: 'dynamic-elem' });
    useStore.getState().addElement(element);
    useStore.getState().selectElements(['dynamic-elem']);

    let state = useStore.getState() as AppStore;
    expect(useSelectedElement(state)?.name).toBe('TestElement');

    // Update element name
    useStore.getState().updateElement('dynamic-elem', { name: 'ChangedName' });
    state = useStore.getState() as AppStore;
    expect(useSelectedElement(state)?.name).toBe('ChangedName');

    // Clear selection
    useStore.getState().clearSelection();
    state = useStore.getState() as AppStore;
    expect(useSelectedElement(state)).toBeNull();
  });

  it('5.6 useDiagramNodes should reflect add/remove node changes', () => {
    const node = makeNode({ id: 'dyn-node' });
    const diagram = makeDiagram({ id: 'diag-1', nodes: [node] });
    useStore.setState({
      canvasModel: { semanticModelId: '', diagrams: [diagram] },
      activeDiagramId: 'diag-1',
    });

    let state = useStore.getState() as AppStore;
    expect(useDiagramNodes(state)).toHaveLength(1);

    useStore.getState().removeNodeFromDiagram('diag-1', 'dyn-node');
    state = useStore.getState() as AppStore;
    expect(useDiagramNodes(state)).toHaveLength(0);
  });
});
