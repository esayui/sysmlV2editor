// ===========================================================================
// Model Tree Panel — 模型树面板
// 来源: 详细设计 §3.7
// ===========================================================================

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Tree, Input, Dropdown, Modal, message } from 'antd';
import type { DataNode, EventDataNode } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import {
  SearchOutlined,
  FolderOutlined,
  BlockOutlined,
  ApiOutlined,
  CodeOutlined,
  NumberOutlined,
  ThunderboltOutlined,
  NodeIndexOutlined,
  SwapOutlined,
  UserOutlined,
  AimOutlined,
  FileTextOutlined,
  LockOutlined,
  MessageOutlined,
  AppstoreOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import useStore from '@/store';
import type {
  SemanticElement,
  ElementType,
  Relationship,
} from '@/types/semantic-model';

// ===========================================================================
// Icon & Label Mappings
// ===========================================================================

const ELEMENT_TYPE_ICON_MAP: Record<ElementType, React.ReactNode> = {
  Package: <FolderOutlined style={{ color: '#FAAD14' }} />,
  PartDefinition: <BlockOutlined style={{ color: '#1677FF' }} />,
  PartUsage: <BlockOutlined style={{ color: '#1677FF' }} />,
  ItemDefinition: <AppstoreOutlined style={{ color: '#1677FF' }} />,
  ItemUsage: <AppstoreOutlined style={{ color: '#1677FF' }} />,
  PortDefinition: <ApiOutlined style={{ color: '#722ED1' }} />,
  PortUsage: <ApiOutlined style={{ color: '#722ED1' }} />,
  InterfaceDefinition: <PartitionOutlined style={{ color: '#1677FF' }} />,
  InterfaceUsage: <PartitionOutlined style={{ color: '#1677FF' }} />,
  AttributeDefinition: <CodeOutlined style={{ color: '#52C41A' }} />,
  AttributeUsage: <CodeOutlined style={{ color: '#52C41A' }} />,
  EnumerationDefinition: <NumberOutlined style={{ color: '#EB2F96' }} />,
  ActionDefinition: <ThunderboltOutlined style={{ color: '#FA8C16' }} />,
  ActionUsage: <ThunderboltOutlined style={{ color: '#FA8C16' }} />,
  StateDefinition: <NodeIndexOutlined style={{ color: '#13C2C2' }} />,
  StateUsage: <NodeIndexOutlined style={{ color: '#13C2C2' }} />,
  Transition: <SwapOutlined style={{ color: '#13C2C2' }} />,
  Actor: <UserOutlined style={{ color: '#2F54EB' }} />,
  UseCase: <AimOutlined style={{ color: '#2F54EB' }} />,
  RequirementDefinition: <FileTextOutlined style={{ color: '#F5222D' }} />,
  RequirementUsage: <FileTextOutlined style={{ color: '#F5222D' }} />,
  StakeholderRequirement: <FileTextOutlined style={{ color: '#F5222D' }} />,
  ConstraintDefinition: <LockOutlined style={{ color: '#EB2F96' }} />,
  ConstraintUsage: <LockOutlined style={{ color: '#EB2F96' }} />,
  Comment: <MessageOutlined style={{ color: '#8C8C8C' }} />,
};

const ELEMENT_TYPE_SUFFIX_MAP: Record<ElementType, string> = {
  Package: '[Package]',
  PartDefinition: '[PartDef]',
  PartUsage: '[Part]',
  ItemDefinition: '[ItemDef]',
  ItemUsage: '[Item]',
  PortDefinition: '[PortDef]',
  PortUsage: '[Port]',
  InterfaceDefinition: '[IfaceDef]',
  InterfaceUsage: '[Iface]',
  AttributeDefinition: '[AttrDef]',
  AttributeUsage: '[Attr]',
  EnumerationDefinition: '[EnumDef]',
  ActionDefinition: '[ActionDef]',
  ActionUsage: '[Action]',
  StateDefinition: '[StateDef]',
  StateUsage: '[State]',
  Transition: '[Trans]',
  Actor: '[Actor]',
  UseCase: '[UC]',
  RequirementDefinition: '[ReqDef]',
  RequirementUsage: '[Req]',
  StakeholderRequirement: '[StkReq]',
  ConstraintDefinition: '[ConstrDef]',
  ConstraintUsage: '[Constr]',
  Comment: '[Comment]',
};

// Child type ordering: Package first, then structural, behavioral, requirements, etc.
const CHILD_TYPE_ORDER: Record<ElementType, number> = {
  Package: 0,
  PartDefinition: 1,
  PartUsage: 2,
  ItemDefinition: 3,
  ItemUsage: 4,
  PortDefinition: 5,
  PortUsage: 6,
  InterfaceDefinition: 7,
  InterfaceUsage: 8,
  AttributeDefinition: 9,
  AttributeUsage: 10,
  EnumerationDefinition: 11,
  ActionDefinition: 12,
  ActionUsage: 13,
  StateDefinition: 14,
  StateUsage: 15,
  Transition: 16,
  Actor: 17,
  UseCase: 18,
  RequirementDefinition: 19,
  RequirementUsage: 20,
  StakeholderRequirement: 21,
  ConstraintDefinition: 22,
  ConstraintUsage: 23,
  Comment: 24,
};

// ===========================================================================
// Helper: UUID generation (works in jsdom)
// ===========================================================================

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ===========================================================================
// Model TreeNode Type
// ===========================================================================

export interface ModelTreeNode extends DataNode {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: ModelTreeNode[];
  isLeaf: boolean;
  selectable: boolean;
  data: {
    element: SemanticElement;
    hasDiagramRepresentation: boolean;
  };
}

// ===========================================================================
// Tree Building
// ===========================================================================

function sortElements(a: SemanticElement, b: SemanticElement): number {
  const aOrder = CHILD_TYPE_ORDER[a.type] ?? 99;
  const bOrder = CHILD_TYPE_ORDER[b.type] ?? 99;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.name.localeCompare(b.name);
}

/**
 * Convert flat SemanticElement[] + Relationship[] into a hierarchical
 * ModelTreeNode[] tree.  Hierarchy is determined by:
 *   1. child.ownerId === parent.id  (primary)
 *   2. Relationship type 'Containment' (additional)
 */
export function buildTree(
  elements: SemanticElement[],
  relationships: Relationship[],
  diagramNodeElementIds: Set<string>,
): ModelTreeNode[] {
  // Build parent -> children map
  const childrenMap = new Map<string, SemanticElement[]>();

  const ensureBucket = (parentId: string): SemanticElement[] => {
    const existing = childrenMap.get(parentId);
    if (existing) return existing;
    const bucket: SemanticElement[] = [];
    childrenMap.set(parentId, bucket);
    return bucket;
  };

  // 1. ownerId-based hierarchy
  for (const elem of elements) {
    const parentId = elem.ownerId;
    if (parentId !== null) {
      ensureBucket(parentId).push(elem);
    }
  }

  // 2. Containment relationships as additional parent-child links
  for (const rel of relationships) {
    if (rel.type === 'Containment') {
      const target = elements.find((e) => e.id === rel.targetId);
      if (target) {
        const bucket = ensureBucket(rel.sourceId);
        if (!bucket.some((e) => e.id === target.id)) {
          bucket.push(target);
        }
      }
    }
  }

  // Find root elements (ownerId === null)
  const rootElements = elements.filter((e) => e.ownerId === null);

  function convertToNode(element: SemanticElement): ModelTreeNode {
    const children = childrenMap.get(element.id) ?? [];
    children.sort(sortElements);

    // Package elements are always expandable (may contain elements later)
    const isPackage = element.type === 'Package';
    const hasChildren = children.length > 0 || isPackage;

    return {
      key: element.id,
      title: (
        <span className="model-tree-node-title">
          {element.name}
          <span
            style={{ color: '#8C8C8C', fontSize: '0.85em', marginLeft: 6 }}
          >
            {ELEMENT_TYPE_SUFFIX_MAP[element.type]}
          </span>
        </span>
      ),
      icon: ELEMENT_TYPE_ICON_MAP[element.type],
      children: children.map(convertToNode),
      isLeaf: !hasChildren,
      selectable: true,
      data: {
        element,
        hasDiagramRepresentation: diagramNodeElementIds.has(element.id),
      },
    };
  }

  rootElements.sort(sortElements);
  return rootElements.map(convertToNode);
}

// ===========================================================================
// Tree Utilities
// ===========================================================================

/**
 * Check whether `descendantId` is a descendant of `ancestorId`
 * by walking the ownerId chain.  Used to prevent circular refs on drag.
 */
export function isDescendantOf(
  elements: SemanticElement[],
  descendantId: string,
  ancestorId: string,
): boolean {
  const visited = new Set<string>();
  let current: string | null = descendantId;

  while (current !== null && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    const elem = elements.find((e) => e.id === current);
    current = elem?.ownerId ?? null;
  }

  return false;
}

/**
 * Find all node keys that should be expanded to show search results.
 * Returns keys of nodes that match the search text *and* all ancestors
 * of those nodes (so the matching paths are visible).
 * Also always includes paths to currently-selected elements.
 */
export function findMatchingPaths(
  nodes: ModelTreeNode[],
  searchText: string,
  selectedIds: string[],
): string[] {
  const lower = searchText.toLowerCase();
  const matchingKeys = new Set<string>();

  // Walk the tree and find matching nodes + their ancestors
  function walk(list: ModelTreeNode[]): boolean {
    let hasMatch = false;
    for (const node of list) {
      const element = node.data.element;
      const nameMatches =
        element.name.toLowerCase().includes(lower) ||
        element.qualifiedName.toLowerCase().includes(lower);
      const childMatches =
        node.children.length > 0 ? walk(node.children) : false;

      if (nameMatches || childMatches) {
        matchingKeys.add(node.key as string);
        hasMatch = true;
      }
    }
    return hasMatch;
  }

  walk(nodes);

  // Include ancestors of selected elements so they stay visible
  function collectAncestors(
    list: ModelTreeNode[],
    targetId: string,
    ancestors: string[],
  ): string[] | null {
    for (const node of list) {
      if (node.key === targetId) {
        return [...ancestors, node.key as string];
      }
      if (node.children.length > 0) {
        const result = collectAncestors(node.children, targetId, [
          ...ancestors,
          node.key as string,
        ]);
        if (result) return result;
      }
    }
    return null;
  }

  for (const selectedId of selectedIds) {
    const path = collectAncestors(nodes, selectedId, []);
    if (path) {
      path.forEach((k) => matchingKeys.add(k));
    }
  }

  return [...matchingKeys];
}

// ===========================================================================
// Context Menu Builder
// ===========================================================================

const CHILD_ELEMENT_TYPES: { label: string; type: ElementType }[] = [
  { label: 'Package', type: 'Package' },
  { label: 'Part Definition', type: 'PartDefinition' },
  { label: 'Part Usage', type: 'PartUsage' },
  { label: 'Port Definition', type: 'PortDefinition' },
  { label: 'Port Usage', type: 'PortUsage' },
  { label: 'Attribute Definition', type: 'AttributeDefinition' },
  { label: 'Requirement', type: 'RequirementDefinition' },
  { label: 'Constraint', type: 'ConstraintDefinition' },
  { label: 'Comment', type: 'Comment' },
];

function getContextMenuItems(
  element: SemanticElement,
  hasDiagramRep: boolean,
  onCreateChild: (parentId: string, type: ElementType) => void,
  onRename: (id: string) => void,
  onDelete: (id: string) => void,
  onLocateInDiagram: (id: string) => void,
): MenuProps['items'] {
  const isRequirement =
    element.type === 'RequirementDefinition' ||
    element.type === 'RequirementUsage' ||
    element.type === 'StakeholderRequirement';

  const items: MenuProps['items'] = [
    {
      key: 'rename',
      label: 'Rename',
      onClick: () => onRename(element.id),
    },
    {
      key: 'create-child',
      label: 'New Child',
      children: CHILD_ELEMENT_TYPES.map((ct) => ({
        key: `create-${ct.type}`,
        label: ct.label,
        icon: ELEMENT_TYPE_ICON_MAP[ct.type],
        onClick: () => onCreateChild(element.id, ct.type),
      })),
    },
  ];

  if (isRequirement) {
    items.push({
      key: 'add-satisfy',
      label: 'Add Satisfy Relationship',
    });
  }

  items.push({ type: 'divider' });

  if (hasDiagramRep) {
    items.push({
      key: 'locate',
      label: 'Locate in Diagram',
      onClick: () => onLocateInDiagram(element.id),
    });
  }

  items.push({ type: 'divider' });

  items.push({
    key: 'delete',
    label: 'Delete',
    danger: true,
    onClick: () => onDelete(element.id),
  });

  return items;
}

// ===========================================================================
// Component
// ===========================================================================

export const ModelTreePanel: React.FC = () => {
  // ---- Store selectors ----
  const semanticModel = useStore((s) => s.semanticModel);
  const canvasModel = useStore((s) => s.canvasModel);
  const selectedElementIds = useStore((s) => s.selectedElementIds);
  const treeFilter = useStore((s) => s.treeFilter);

  // ---- Store actions ----
  const selectElements = useStore((s) => s.selectElements);
  const updateElement = useStore((s) => s.updateElement);
  const removeElement = useStore((s) => s.removeElement);
  const moveElement = useStore((s) => s.moveElement);
  const addElement = useStore((s) => s.addElement);
  const setTreeFilter = useStore((s) => s.setTreeFilter);

  // ---- Local state ----
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [previousExpandedKeys, setPreviousExpandedKeys] = useState<string[]>(
    [],
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    element: SemanticElement;
    hasDiagramRep: boolean;
  } | null>(null);

  // ---- Derived: set of element IDs that have diagram nodes ----
  const diagramNodeElementIds = useMemo(() => {
    const ids = new Set<string>();
    for (const diagram of canvasModel.diagrams) {
      for (const node of diagram.nodes) {
        ids.add(node.semanticElementId);
      }
    }
    return ids;
  }, [canvasModel.diagrams]);

  // ---- Build tree data ----
  const treeData: ModelTreeNode[] = useMemo(() => {
    return buildTree(
      semanticModel.elements,
      semanticModel.relationships,
      diagramNodeElementIds,
    );
  }, [semanticModel.elements, semanticModel.relationships, diagramNodeElementIds]);

  // ---- Search filter effect: auto-expand matching paths ----
  useEffect(() => {
    if (treeFilter) {
      const matchingKeys = findMatchingPaths(
        treeData,
        treeFilter,
        selectedElementIds,
      );
      if (matchingKeys.length > 0) {
        setExpandedKeys(matchingKeys);
      }
    }
  }, [treeFilter, treeData, selectedElementIds]);

  // ---- Handlers ----

  /** Click: select element */
  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      selectElements(keys.map((k) => String(k)));
    },
    [selectElements],
  );

  /** Double-click: select element + switch to its diagram */
  const handleDoubleClick = useCallback(
    (_e: React.MouseEvent, node: ModelTreeNode) => {
      const elementId = node.data.element.id;
      selectElements([elementId]);

      // Switch active diagram to the one containing this element
      for (const diagram of canvasModel.diagrams) {
        if (
          diagram.nodes.some((n) => n.semanticElementId === elementId)
        ) {
          useStore.setState({ activeDiagramId: diagram.id });
          break;
        }
      }
    },
    [selectElements, canvasModel.diagrams],
  );

  /** Right-click: open context menu at mouse position */
  const handleRightClick = useCallback(
    ({
      event,
      node,
    }: {
      event: React.MouseEvent;
      node: EventDataNode<ModelTreeNode>;
    }) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        element: node.data.element,
        hasDiagramRep: node.data.hasDiagramRepresentation,
      });
    },
    [],
  );

  /** Context menu: create child element */
  const handleCreateChild = useCallback(
    (parentId: string, childType: ElementType) => {
      const childId = generateId();
      const newElement: SemanticElement = {
        id: childId,
        name: `New${childType}`,
        qualifiedName: `New${childType}`,
        type: childType,
        ownerId: parentId,
        description: '',
        properties: {},
      };
      addElement(newElement);
      message.success(`Created ${childType}`);
    },
    [addElement],
  );

  /** Context menu: open rename dialog */
  const handleRenameStart = useCallback(
    (id: string) => {
      const element = semanticModel.elements.find((e) => e.id === id);
      if (element) {
        setRenamingId(id);
        setRenameValue(element.name);
      }
    },
    [semanticModel.elements],
  );

  /** Context menu: confirm rename */
  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      updateElement(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
  }, [renamingId, renameValue, updateElement]);

  /** Context menu: delete element */
  const handleDelete = useCallback(
    (id: string) => {
      removeElement(id);
      message.success('Element deleted');
    },
    [removeElement],
  );

  /** Context menu: locate element in diagram */
  const handleLocateInDiagram = useCallback(
    (elementId: string) => {
      for (const diagram of canvasModel.diagrams) {
        if (
          diagram.nodes.some((n) => n.semanticElementId === elementId)
        ) {
          useStore.setState({ activeDiagramId: diagram.id });
          selectElements([elementId]);
          message.info(`Located in diagram: ${diagram.name}`);
          return;
        }
      }
      message.warning('Element not found in any diagram');
    },
    [canvasModel.diagrams, selectElements],
  );

  /** Drag & drop: move element to new owner */
  const handleDrop = useCallback(
    (info: {
      node: EventDataNode<ModelTreeNode>;
      dragNode: EventDataNode<ModelTreeNode>;
      dropPosition: number;
      dropToGap: boolean;
    }) => {
      // Only handle dropping ONTO a node (making it a child), not between siblings
      if (info.dropToGap) return;

      const dragElementId = info.dragNode.key as string;
      const targetElementId = info.node.key as string;

      if (dragElementId === targetElementId) return;

      // Prevent circular references
      if (
        isDescendantOf(
          semanticModel.elements,
          targetElementId,
          dragElementId,
        )
      ) {
        message.error('Cannot move element into its own descendant');
        return;
      }

      moveElement(dragElementId, targetElementId);
      message.success('Element moved');
    },
    [semanticModel.elements, moveElement],
  );

  /** Tree expand/collapse */
  const handleExpand = useCallback((keys: React.Key[]) => {
    setExpandedKeys(keys.map((k) => String(k)));
  }, []);

  /** Search input change */
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (!value && treeFilter) {
        // Restore previous expand state when clearing
        setExpandedKeys(previousExpandedKeys);
      }
      if (value && !treeFilter) {
        // Save expand state before filtering
        setPreviousExpandedKeys(expandedKeys);
      }
      setTreeFilter(value);
    },
    [setTreeFilter, treeFilter, expandedKeys, previousExpandedKeys],
  );

  /** Close context menu */
  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ---- Context menu items (memoised) ----
  const contextMenuItems: MenuProps['items'] | undefined = useMemo(() => {
    if (!contextMenu) return undefined;
    const { element, hasDiagramRep } = contextMenu;
    return getContextMenuItems(
      element,
      hasDiagramRep,
      handleCreateChild,
      handleRenameStart,
      handleDelete,
      handleLocateInDiagram,
    );
  }, [
    contextMenu,
    handleCreateChild,
    handleRenameStart,
    handleDelete,
    handleLocateInDiagram,
  ]);

  // ---- Render ----

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Search box */}
      <div style={{ padding: 8 }}>
        <Input
          placeholder="Search elements..."
          value={treeFilter}
          onChange={handleSearchChange}
          allowClear
          size="small"
          prefix={<SearchOutlined />}
        />
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        <Tree<ModelTreeNode>
          treeData={treeData}
          selectedKeys={selectedElementIds}
          expandedKeys={expandedKeys}
          onSelect={handleSelect}
          onExpand={handleExpand}
          onDoubleClick={(e, node) =>
            handleDoubleClick(e, node as ModelTreeNode)
          }
          onRightClick={handleRightClick}
          draggable
          blockNode
          showIcon
          onDrop={handleDrop}
        />
      </div>

      {/* Context menu Dropdown — positioned at click coordinates */}
      {contextMenu && contextMenuItems && (
        <Dropdown
          open
          onOpenChange={(open) => {
            if (!open) handleContextMenuClose();
          }}
          menu={{ items: contextMenuItems }}
          destroyOnHidden
        >
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              width: 1,
              height: 1,
            }}
          />
        </Dropdown>
      )}

      {/* Rename modal */}
      <Modal
        title="Rename Element"
        open={renamingId !== null}
        onOk={handleRenameSubmit}
        onCancel={() => setRenamingId(null)}
        okText="Rename"
        destroyOnHidden
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameSubmit}
          autoFocus
        />
      </Modal>
    </div>
  );
};

export default ModelTreePanel;
