// ===========================================================================
// Model Tree Panel Tests — 模型树面板测试
// 来源: 任务清单 M-FE-07
// ===========================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ModelTreePanel,
  buildTree,
  isDescendantOf,
  findMatchingPaths,
} from '../model-tree-panel';
import type { ModelTreeNode } from '../model-tree-panel';
import useStore from '@/store';
import type { AppStore } from '@/store/types';
import type {
  SemanticElement,
  Relationship,
} from '@/types/semantic-model';
import type {
  Diagram,
  DiagramNode,
} from '@/types/canvas-model';

// ===========================================================================
// jsdom polyfills (missing APIs in jsdom)
// ===========================================================================

// Polyfill getComputedStyle — needed by antd Modal/RcPortal
if (typeof window !== 'undefined' && !window.getComputedStyle) {
  Object.defineProperty(window, 'getComputedStyle', {
    value: (_elt: Element) => ({
      getPropertyValue: () => '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as unknown as typeof window.getComputedStyle,
  });
}

// ===========================================================================
// Test Helpers
// ===========================================================================

function makeElement(
  overrides: Partial<SemanticElement> = {},
): SemanticElement {
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

function makeDiagram(
  overrides: Partial<Diagram> = {},
): Diagram {
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

function makeNode(
  overrides: Partial<DiagramNode> = {},
): DiagramNode {
  return {
    id: 'node-1',
    semanticElementId: 'elem-1',
    x: 100,
    y: 200,
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

/** Reset the Zustand store to a clean state */
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

/** Populate the store with elements and optionally relationships & diagrams */
function populateStore(
  elements: SemanticElement[],
  relationships: Relationship[] = [],
  diagrams: Diagram[] = [],
): void {
  useStore.setState({
    semanticModel: {
      id: 'model-1',
      name: 'TestModel',
      elements,
      relationships,
      packages: [],
    },
    canvasModel: {
      semanticModelId: 'model-1',
      diagrams,
    },
    activeDiagramId: diagrams.length > 0 ? diagrams[0].id : null,
  });
}

// ===========================================================================
// 1. buildTree — Unit Tests
// ===========================================================================

describe('buildTree', () => {
  it('1.1 returns empty array for empty elements', () => {
    const result = buildTree([], [], new Set());
    expect(result).toEqual([]);
  });

  it('1.2 returns single root node for single element', () => {
    const elem = makeElement({ id: 'root', name: 'Root' });
    const result = buildTree([elem], [], new Set());

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('root');
    expect(result[0].data.element.name).toBe('Root');
    expect(result[0].children).toEqual([]);
  });

  it('1.3 builds 3-level nested hierarchy (PartDef)', () => {
    const grandparent = makeElement({
      id: 'gp',
      name: 'Grandparent',
      ownerId: null,
    });
    const parent = makeElement({
      id: 'p',
      name: 'Parent',
      ownerId: 'gp',
    });
    const child = makeElement({
      id: 'c',
      name: 'Child',
      ownerId: 'p',
    });

    const result = buildTree([grandparent, parent, child], [], new Set());

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('gp');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].key).toBe('p');
    expect(result[0].children[0].children).toHaveLength(1);
    expect(result[0].children[0].children[0].key).toBe('c');
    expect(result[0].children[0].children[0].isLeaf).toBe(true);
  });

  it('1.4 packages appear before other elements at same level', () => {
    const pkg = makeElement({
      id: 'pkg',
      name: 'MyPackage',
      type: 'Package',
      ownerId: null,
    });
    const part = makeElement({
      id: 'part',
      name: 'MyPart',
      type: 'PartDefinition',
      ownerId: null,
    });
    const attr = makeElement({
      id: 'attr',
      name: 'Attribute',
      type: 'AttributeDefinition',
      ownerId: null,
    });

    const result = buildTree([attr, part, pkg], [], new Set());
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe('pkg');
    expect(result[0].data.element.type).toBe('Package');
    expect(result[1].key).toBe('part');
    expect(result[2].key).toBe('attr');
  });

  it('1.5 sorts children by type order then name', () => {
    const root = makeElement({ id: 'root', name: 'Root' });
    const childB = makeElement({
      id: 'b',
      name: 'B',
      type: 'PartDefinition',
      ownerId: 'root',
    });
    const childA = makeElement({
      id: 'a',
      name: 'A',
      type: 'PartDefinition',
      ownerId: 'root',
    });
    const pkg = makeElement({
      id: 'pkg',
      name: 'SubPkg',
      type: 'Package',
      ownerId: 'root',
    });

    const result = buildTree([root, childB, childA, pkg], [], new Set());

    expect(result[0].children).toHaveLength(3);
    expect(result[0].children[0].key).toBe('pkg');
    expect(result[0].children[1].key).toBe('a');
    expect(result[0].children[2].key).toBe('b');
  });

  it('1.6 handles multiple root elements', () => {
    const root1 = makeElement({ id: 'r1', name: 'Root1' });
    const root2 = makeElement({ id: 'r2', name: 'Root2' });
    const root3 = makeElement({ id: 'r3', name: 'Root3', type: 'Package' });

    const result = buildTree([root2, root3, root1], [], new Set());
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe('r3'); // Package first
    expect(result[1].key).toBe('r1');
    expect(result[2].key).toBe('r2');
  });

  it('1.7 elements with ownerId !== null are NOT roots', () => {
    const root = makeElement({ id: 'root' });
    const child = makeElement({ id: 'child', ownerId: 'root' });

    const result = buildTree([root, child], [], new Set());
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('root');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].key).toBe('child');
  });

  it('1.8 handles Containment relationships as additional parent-child links', () => {
    const pkg = makeElement({
      id: 'pkg',
      name: 'Pkg',
      type: 'Package',
    });
    const element = makeElement({
      id: 'elem',
      name: 'Elem',
      type: 'PartDefinition',
    });
    const containmentRel = makeRelationship({
      id: 'cont-1',
      type: 'Containment',
      sourceId: 'pkg',
      targetId: 'elem',
    });

    const result = buildTree([pkg, element], [containmentRel], new Set());

    expect(result).toHaveLength(2);
    const pkgNode = result.find((n) => n.key === 'pkg')!;
    expect(pkgNode.children).toHaveLength(1);
    expect(pkgNode.children[0].key).toBe('elem');
  });

  it('1.9 marks hasDiagramRepresentation for elements with diagram nodes', () => {
    const elemInDiag = makeElement({ id: 'diag-elem' });
    const elemNoDiag = makeElement({ id: 'no-diag-elem' });

    const result = buildTree(
      [elemInDiag, elemNoDiag],
      [],
      new Set(['diag-elem']),
    );

    expect(result).toHaveLength(2);
    const diagNode = result.find((n) => n.key === 'diag-elem')!;
    const noDiagNode = result.find((n) => n.key === 'no-diag-elem')!;
    expect(diagNode.data.hasDiagramRepresentation).toBe(true);
    expect(noDiagNode.data.hasDiagramRepresentation).toBe(false);
  });

  it('1.10 Package type elements are never leaf (isLeaf=false)', () => {
    const pkg = makeElement({
      id: 'pkg',
      type: 'Package',
      name: 'EmptyPackage',
    });

    const result = buildTree([pkg], [], new Set());
    expect(result[0].isLeaf).toBe(false);
  });

  it('1.11 non-Package elements without children are leaf (isLeaf=true)', () => {
    const part = makeElement({
      id: 'part',
      type: 'PartDefinition',
      name: 'LeafPart',
    });

    const result = buildTree([part], [], new Set());
    expect(result[0].isLeaf).toBe(true);
  });
});

// ===========================================================================
// 2. isDescendantOf — Unit Tests
// ===========================================================================

describe('isDescendantOf', () => {
  const elements: SemanticElement[] = [
    makeElement({ id: 'root' }),
    makeElement({ id: 'child', ownerId: 'root' }),
    makeElement({ id: 'grandchild', ownerId: 'child' }),
    makeElement({ id: 'unrelated' }),
  ];

  it('2.1 returns true for direct child', () => {
    expect(isDescendantOf(elements, 'child', 'root')).toBe(true);
  });

  it('2.2 returns true for grandchild', () => {
    expect(isDescendantOf(elements, 'grandchild', 'root')).toBe(true);
    expect(isDescendantOf(elements, 'grandchild', 'child')).toBe(true);
  });

  it('2.3 returns false for unrelated element', () => {
    expect(isDescendantOf(elements, 'unrelated', 'root')).toBe(false);
    expect(isDescendantOf(elements, 'root', 'unrelated')).toBe(false);
  });

  it('2.4 returns true for self', () => {
    expect(isDescendantOf(elements, 'root', 'root')).toBe(true);
  });

  it('2.5 returns false for non-existent element', () => {
    expect(isDescendantOf(elements, 'non-existent', 'root')).toBe(false);
  });

  it('2.6 handles deep nesting', () => {
    const deepElements: SemanticElement[] = [];
    let prevId: string | null = null;
    for (let i = 0; i < 10; i++) {
      const id = `level-${i}`;
      deepElements.push(makeElement({ id, ownerId: prevId }));
      prevId = id;
    }

    expect(isDescendantOf(deepElements, 'level-9', 'level-0')).toBe(true);
    expect(isDescendantOf(deepElements, 'level-0', 'level-9')).toBe(false);
  });
});

// ===========================================================================
// 3. findMatchingPaths — Unit Tests
// ===========================================================================

describe('findMatchingPaths', () => {
  function buildTestTree(): ModelTreeNode[] {
    return buildTree(
      [
        makeElement({ id: 'root', name: 'Vehicle', type: 'Package' }),
        makeElement({
          id: 'engine',
          name: 'Engine',
          type: 'PartDefinition',
          ownerId: 'root',
        }),
        makeElement({
          id: 'piston',
          name: 'Piston',
          type: 'PartDefinition',
          ownerId: 'engine',
        }),
        makeElement({
          id: 'wheel',
          name: 'Wheel',
          type: 'PartDefinition',
          ownerId: 'root',
        }),
      ],
      [],
      new Set(),
    );
  }

  it('3.1 finds nodes matching by name', () => {
    const tree = buildTestTree();
    const result = findMatchingPaths(tree, 'Engine', []);
    expect(result).toContain('engine');
    expect(result).toContain('root'); // ancestor
  });

  it('3.2 includes ancestors of matching nodes', () => {
    const tree = buildTestTree();
    const result = findMatchingPaths(tree, 'Piston', []);
    expect(result).toContain('piston');
    expect(result).toContain('engine');
    expect(result).toContain('root');
  });

  it('3.3 returns empty array for no matches', () => {
    const tree = buildTestTree();
    const result = findMatchingPaths(tree, 'NotExist', []);
    expect(result).toEqual([]);
  });

  it('3.4 search is case-insensitive', () => {
    const tree = buildTestTree();
    const result = findMatchingPaths(tree, 'engine', []);
    expect(result).toContain('engine');
    expect(result).toContain('root');
  });

  it('3.5 matches by qualifiedName', () => {
    const tree = buildTree(
      [
        makeElement({
          id: 'r',
          name: 'R',
          type: 'Package',
          qualifiedName: 'Model::Subsys::Target',
        }),
      ],
      [],
      new Set(),
    );
    const result = findMatchingPaths(tree, 'Subsys', []);
    expect(result).toContain('r');
  });

  it('3.6 includes ancestors of selected elements', () => {
    const tree = buildTestTree();
    const result = findMatchingPaths(tree, 'Wheel', ['piston']);
    expect(result).toContain('wheel');
    expect(result).toContain('root');
    expect(result).toContain('piston');
    expect(result).toContain('engine');
  });
});

// ===========================================================================
// 4. ModelTreePanel Component — Integration Tests
// ===========================================================================

describe('ModelTreePanel', () => {
  beforeEach(() => {
    resetStore();
  });

  // ===== 4.1 Rendering =====

  it('4.1 renders root elements in tree', async () => {
    const pkg = makeElement({
      id: 'pkg-1',
      name: 'MyPackage',
      type: 'Package',
    });
    const part = makeElement({
      id: 'part-1',
      name: 'Engine',
      type: 'PartDefinition',
    });
    populateStore([pkg, part]);

    render(<ModelTreePanel />);

    // Both root elements should be visible
    await waitFor(() => {
      expect(screen.getByText(/MyPackage/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Engine/)).toBeInTheDocument();
    });
  });

  it('4.2 renders search input', () => {
    render(<ModelTreePanel />);
    const searchInput = screen.getByPlaceholderText('Search elements...');
    expect(searchInput).toBeInTheDocument();
  });

  it('4.3 shows type suffix on visible nodes', async () => {
    const pkg = makeElement({
      id: 'pkg-1',
      name: 'MyPackage',
      type: 'Package',
    });
    const part = makeElement({
      id: 'part-1',
      name: 'Engine',
      type: 'PartDefinition',
    });
    populateStore([pkg, part]);

    render(<ModelTreePanel />);

    await waitFor(() => {
      // Both root elements have visible suffixes
      expect(screen.getByText('[包]')).toBeInTheDocument();
      expect(screen.getByText('[部件定义]')).toBeInTheDocument();
    });
  });

  // ===== 4.2 Click Selection =====

  it('4.4 single click selects element', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'TestElement' });
    populateStore([elem]);

    render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/TestElement/)).toBeInTheDocument();
    });

    const titleSpan = screen.getByText(/TestElement/);
    fireEvent.click(titleSpan);

    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toContain('elem-1');
  });

  it('4.5 single click on a visible root element selects it', async () => {
    const root = makeElement({ id: 'root', name: 'Root' });
    const child = makeElement({
      id: 'child',
      name: 'Child',
      ownerId: 'root',
    });
    populateStore([root, child]);

    render(<ModelTreePanel />);

    // Root is initially visible; child is collapsed
    await waitFor(() => {
      expect(screen.getByText(/Root/)).toBeInTheDocument();
    });

    // Expand the root node to reveal the child
    const expander = document.querySelector(
      '.ant-tree-switcher',
    ) as HTMLElement;
    if (expander) {
      fireEvent.click(expander);
    }

    // Wait for child to appear
    await waitFor(() => {
      expect(screen.getByText(/Child/)).toBeInTheDocument();
    });

    // Now click the child
    fireEvent.click(screen.getByText(/Child/));

    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toEqual(['child']);
  });

  // ===== 4.3 Double-Click =====

  it('4.6 double-click selects element and sets active diagram', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'DblClickElem' });
    const diagram = makeDiagram({
      id: 'diag-a',
      name: 'BDD Diagram',
      nodes: [makeNode({ id: 'node-1', semanticElementId: 'elem-1' })],
    });
    populateStore([elem], [], [diagram]);
    useStore.setState({ activeDiagramId: null });

    render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/DblClickElem/)).toBeInTheDocument();
    });

    const titleSpan = screen.getByText(/DblClickElem/);
    fireEvent.doubleClick(titleSpan);

    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toEqual(['elem-1']);
    expect(state.activeDiagramId).toBe('diag-a');
  });

  it('4.7 double-click selects element even if not in any diagram', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'NoDiagElem' });
    populateStore([elem]);

    render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/NoDiagElem/)).toBeInTheDocument();
    });

    const titleSpan = screen.getByText(/NoDiagElem/);
    fireEvent.doubleClick(titleSpan);

    const state = useStore.getState() as AppStore;
    expect(state.selectedElementIds).toEqual(['elem-1']);
    expect(state.activeDiagramId).toBeNull();
  });

  // ===== 4.4 Bidirectional Selection Sync =====

  it('4.8 tree highlights node when store selection changes', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'SyncedElem' });
    populateStore([elem]);

    render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/SyncedElem/)).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().selectElements(['elem-1']);
    });

    await waitFor(() => {
      const selectedNode = document.querySelector(
        '.ant-tree-node-selected',
      );
      expect(selectedNode).toBeInTheDocument();
    });
  });

  // ===== 4.5 Context Menu (Right-Click) =====

  it('4.9 right-click opens context menu', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'ContextElem' });
    populateStore([elem]);

    const { baseElement } = render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/ContextElem/)).toBeInTheDocument();
    });

    const titleSpan = screen.getByText(/ContextElem/);
    fireEvent.contextMenu(titleSpan);

    await waitFor(() => {
      const menuItems = baseElement.querySelectorAll(
        '.ant-dropdown-menu-item',
      );
      expect(menuItems.length).toBeGreaterThan(0);
    });
  });

  it('4.10 context menu includes Rename, New Child, Delete', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'MenuElem' });
    populateStore([elem]);

    const { baseElement } = render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/MenuElem/)).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText(/MenuElem/));

    await waitFor(() => {
      expect(
        baseElement.querySelector('.ant-dropdown'),
      ).toBeInTheDocument();
    });

    const menuTexts = baseElement.textContent ?? '';
    expect(menuTexts).toContain('重命名');
    expect(menuTexts).toContain('新建子元素');
    expect(menuTexts).toContain('删除');
  });

  it('4.11 right-click on package with diagram rep shows Locate in Diagram', async () => {
    const pkg = makeElement({
      id: 'pkg-1',
      name: 'DiagPackage',
      type: 'Package',
    });
    const diagram = makeDiagram({
      id: 'diag-1',
      nodes: [makeNode({ id: 'n1', semanticElementId: 'pkg-1' })],
    });
    populateStore([pkg], [], [diagram]);

    const { baseElement } = render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/DiagPackage/)).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText(/DiagPackage/));

    await waitFor(() => {
      const menuTexts = baseElement.textContent ?? '';
      expect(menuTexts).toContain('在图定位');
    });
  });

  // ===== 4.6 Rename =====

  it('4.12 rename opens modal and updates element name', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'OldName' });
    populateStore([elem]);

    const { baseElement } = render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/OldName/)).toBeInTheDocument();
    });

    // Right-click to open menu
    fireEvent.contextMenu(screen.getByText(/OldName/));

    // Wait for the dropdown to render, then find and click "Rename"
    await waitFor(() => {
      const renameItem = baseElement.querySelector(
        '.ant-dropdown-menu-item',
      );
      expect(renameItem).toBeInTheDocument();
    });

    const renameItems = baseElement.querySelectorAll(
      '.ant-dropdown-menu-item',
    );
    if (renameItems[0]) {
      fireEvent.click(renameItems[0]);
    }

    // Wait for the rename Modal to open
    await waitFor(() => {
      expect(screen.getByText('重命名元素')).toBeInTheDocument();
    });

    // The modal has an input — find it and change the value
    const modal = document.querySelector('.ant-modal');
    expect(modal).toBeInTheDocument();
    const input = modal?.querySelector('input');
    expect(input).toBeInTheDocument();
    if (input) {
      fireEvent.change(input, { target: { value: 'NewName' } });
    }

    // Click the OK button
    const okButton = screen.getByRole('button', { name: /Rename/i });
    fireEvent.click(okButton);

    // Verify the store was updated
    await waitFor(() => {
      const state = useStore.getState() as AppStore;
      const updated = state.semanticModel.elements.find(
        (e) => e.id === 'elem-1',
      );
      expect(updated?.name).toBe('NewName');
    });
  });

  // ===== 4.7 Delete =====

  it('4.13 delete removes element from store', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'DeleteMe' });
    populateStore([elem]);

    const { baseElement } = render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/DeleteMe/)).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText(/DeleteMe/));

    await waitFor(() => {
      expect(
        baseElement.querySelector('.ant-dropdown'),
      ).toBeInTheDocument();
    });

    const dangerItem = baseElement.querySelector(
      '.ant-dropdown-menu-item-danger',
    );
    expect(dangerItem).toBeInTheDocument();
    if (dangerItem) {
      fireEvent.click(dangerItem);
    }

    await waitFor(() => {
      const state = useStore.getState() as AppStore;
      expect(state.semanticModel.elements).toHaveLength(0);
    });
  });

  // ===== 4.8 Create Child =====

  it('4.14 create child via context menu adds element to store', async () => {
    const pkg = makeElement({
      id: 'pkg-1',
      name: 'ParentPkg',
      type: 'Package',
    });
    populateStore([pkg]);

    const { baseElement } = render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/ParentPkg/)).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText(/ParentPkg/));

    await waitFor(() => {
      expect(
        baseElement.querySelector('.ant-dropdown'),
      ).toBeInTheDocument();
    });

    // Hover over "New Child" submenu to reveal sub-items
    const submenuTrigger = baseElement.querySelector(
      '.ant-dropdown-menu-submenu-title',
    );
    expect(submenuTrigger).toBeInTheDocument();

    if (submenuTrigger) {
      fireEvent.mouseEnter(submenuTrigger);
    }

    // Wait for the submenu to appear, then click on a sub-item
    await waitFor(() => {
      // Submenus are rendered in separate dropdowns;
      // find "Part Definition" in any visible dropdown
      const allDropdowns = baseElement.querySelectorAll(
        '.ant-dropdown-menu-item',
      );
      const partDefItems = Array.from(allDropdowns).filter((el) =>
        el.textContent?.includes('Part Definition'),
      );
      expect(partDefItems.length).toBeGreaterThan(0);
    });

    const allItems = baseElement.querySelectorAll(
      '.ant-dropdown-menu-item',
    );
    const partDefItem = Array.from(allItems).find((el) =>
      el.textContent?.includes('Part Definition'),
    );
    if (partDefItem) {
      fireEvent.click(partDefItem);
    }

    // Wait for store to have the new child element
    await waitFor(() => {
      const state = useStore.getState() as AppStore;
      const newChild = state.semanticModel.elements.find(
        (e) => e.ownerId === 'pkg-1',
      );
      expect(newChild).toBeDefined();
      expect(newChild?.type).toBe('PartDefinition');
    });
  });

  // ===== 4.9 Search Filter =====

  it('4.15 search sets treeFilter in store', async () => {
    const root = makeElement({
      id: 'root',
      name: 'Vehicle',
      type: 'Package',
    });
    const engine = makeElement({
      id: 'engine',
      name: 'Engine',
      type: 'PartDefinition',
      ownerId: 'root',
    });
    populateStore([root, engine]);

    render(<ModelTreePanel />);

    const searchInput = screen.getByPlaceholderText('Search elements...');
    fireEvent.change(searchInput, { target: { value: 'Engine' } });

    await waitFor(() => {
      const state = useStore.getState() as AppStore;
      expect(state.treeFilter).toBe('Engine');
    });
  });

  it('4.16 clearing search restores tree filter to empty', async () => {
    populateStore([makeElement()]);

    render(<ModelTreePanel />);

    const searchInput = screen.getByPlaceholderText('Search elements...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(useStore.getState().treeFilter).toBe('test');
    });

    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(useStore.getState().treeFilter).toBe('');
    });
  });

  // ===== 4.10 Drag & Drop (circular ref prevention) =====

  it('4.17 circular reference check blocks invalid moves', () => {
    const root = makeElement({ id: 'root', name: 'Root' });
    const child = makeElement({ id: 'child', name: 'Child', ownerId: 'root' });

    // Trying to drop 'root' onto 'child' should be blocked — child IS a descendant of root
    expect(isDescendantOf([root, child], 'child', 'root')).toBe(true);

    // 'root' is NOT a descendant of 'child', so moving child under root is fine
    expect(isDescendantOf([root, child], 'root', 'child')).toBe(false);
  });

  // ===== 4.11 Empty State =====

  it('4.18 renders empty tree when no elements', () => {
    render(<ModelTreePanel />);

    // The tree should have no visible (non-hidden) tree nodes
    const visibleNodes = document.querySelectorAll(
      '.ant-tree-treenode:not([style*="visibility: hidden"])',
    );
    expect(visibleNodes.length).toBe(0);
  });
});

// ===========================================================================
// 5. State Synchronisation Tests
// ===========================================================================

describe('ModelTreePanel State Sync', () => {
  beforeEach(() => {
    resetStore();
  });

  it('5.1 tree renders newly added element', async () => {
    // Render with empty store
    render(<ModelTreePanel />);

    // No visible nodes initially
    let visibleNodes = document.querySelectorAll(
      '.ant-tree-treenode:not([style*="visibility: hidden"])',
    );
    expect(visibleNodes.length).toBe(0);

    // Add element to store
    act(() => {
      useStore.getState().addElement(
        makeElement({ id: 'new-elem', name: 'NewElement' }),
      );
    });

    // Wait for the tree to update
    await waitFor(() => {
      expect(screen.getByText(/NewElement/)).toBeInTheDocument();
    });
  });

  it('5.2 tree updates when element name is changed in store', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'OldName' });
    populateStore([elem]);

    render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/OldName/)).toBeInTheDocument();
    });

    // Update name via store
    act(() => {
      useStore.getState().updateElement('elem-1', { name: 'UpdatedName' });
    });

    await waitFor(() => {
      expect(screen.getByText(/UpdatedName/)).toBeInTheDocument();
      expect(screen.queryByText(/OldName/)).not.toBeInTheDocument();
    });
  });

  it('5.3 tree updates when element is deleted from store', async () => {
    const elem = makeElement({ id: 'elem-1', name: 'WillBeDeleted' });
    populateStore([elem]);

    render(<ModelTreePanel />);

    await waitFor(() => {
      expect(screen.getByText(/WillBeDeleted/)).toBeInTheDocument();
    });

    act(() => {
      useStore.getState().removeElement('elem-1');
    });

    await waitFor(() => {
      expect(screen.queryByText(/WillBeDeleted/)).not.toBeInTheDocument();
    });
  });
});
