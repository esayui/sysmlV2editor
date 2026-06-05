// ===========================================================================
// Model Tree Panel — 模型树面板（中文界面 + 9 视图创建）
// ===========================================================================

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Tree, Input, Dropdown, Modal, message } from 'antd';
import type { DataNode, EventDataNode } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import {
  SearchOutlined,
  FolderOutlined, BlockOutlined, ApiOutlined,
  CodeOutlined, NumberOutlined, ThunderboltOutlined,
  NodeIndexOutlined, SwapOutlined, UserOutlined,
  AimOutlined, FileTextOutlined, LockOutlined,
  MessageOutlined, AppstoreOutlined, PartitionOutlined,
  PlusSquareOutlined, ApartmentOutlined, FunctionOutlined,
  SafetyOutlined, DeploymentUnitOutlined, FieldTimeOutlined,
  AccountBookOutlined,
} from '@ant-design/icons';
import useStore from '@/store';
import type { SemanticElement, ElementType, Relationship } from '@/types/semantic-model';
import type { Diagram, DiagramType } from '@/types/canvas-model';

// ===========================================================================
// Icon Mappings
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
  Package: '[包]', PartDefinition: '[部件定义]', PartUsage: '[部件]',
  ItemDefinition: '[项定义]', ItemUsage: '[项]',
  PortDefinition: '[端口定义]', PortUsage: '[端口]',
  InterfaceDefinition: '[接口定义]', InterfaceUsage: '[接口]',
  AttributeDefinition: '[属性]', AttributeUsage: '[属性实例]',
  EnumerationDefinition: '[枚举]',
  ActionDefinition: '[动作定义]', ActionUsage: '[动作]',
  StateDefinition: '[状态定义]', StateUsage: '[状态]', Transition: '[转换]',
  Actor: '[参与者]', UseCase: '[用例]',
  RequirementDefinition: '[需求]', RequirementUsage: '[需求实例]',
  StakeholderRequirement: '[干系人需求]',
  ConstraintDefinition: '[约束定义]', ConstraintUsage: '[约束]',
  Comment: '[注释]',
};

// ===========================================================================
// 9 SysML 视图类型 (v1.6 中文名 → v2 内部类型)
// ===========================================================================

interface DiagramTypeDef {
  type: DiagramType;
  label: string;         // 中文名
  description: string;   // 说明
  icon: React.ReactNode;
  ownerElementTypes: ElementType[];  // 哪些元素下可以创建该视图
}

const DIAGRAM_TYPES: DiagramTypeDef[] = [
  { type: 'BDD', label: '块定义图 (BDD)', description: '展示系统模块、部件及其层级分类关系',
    icon: <BlockOutlined />, ownerElementTypes: ['Package', 'PartDefinition'] },
  { type: 'IBD', label: '内部块图 (IBD)', description: '展示模块内部结构、端口和连接',
    icon: <ApartmentOutlined />, ownerElementTypes: ['Package', 'PartDefinition'] },
  { type: 'PKG', label: '包图 (PKG)', description: '展示模型包的组织结构和依赖关系',
    icon: <FolderOutlined />, ownerElementTypes: ['Package'] },
  { type: 'PAR', label: '参数图 (PAR)', description: '展示参数约束方程和绑定关系',
    icon: <FunctionOutlined />, ownerElementTypes: ['Package', 'PartDefinition', 'ConstraintDefinition'] },
  { type: 'REQ', label: '需求图 (REQ)', description: '展示需求层级、分解和追溯关系',
    icon: <SafetyOutlined />, ownerElementTypes: ['Package', 'RequirementDefinition'] },
  { type: 'ACT', label: '活动图 (ACT)', description: '展示行为流程、动作、控制流和对象流',
    icon: <DeploymentUnitOutlined />, ownerElementTypes: ['Package', 'ActionDefinition', 'PartDefinition'] },
  { type: 'STM', label: '状态机图 (STM)', description: '展示状态、转换事件和守卫条件',
    icon: <FieldTimeOutlined />, ownerElementTypes: ['Package', 'StateDefinition', 'PartDefinition'] },
  { type: 'SD', label: '序列图 (SD)', description: '展示生命线、消息交互和时间顺序',
    icon: <SwapOutlined />, ownerElementTypes: ['Package', 'ActionDefinition', 'PartDefinition'] },
  { type: 'UC', label: '用例图 (UC)', description: '展示参与者、用例和边界关系',
    icon: <AccountBookOutlined />, ownerElementTypes: ['Package'] },
];

// ===========================================================================
// 图类型对应图标
// ===========================================================================

const DIAGRAM_ICON_MAP: Record<DiagramType, React.ReactNode> = {
  BDD: <BlockOutlined style={{ color: '#1677FF' }} />,
  IBD: <ApartmentOutlined style={{ color: '#1890FF' }} />,
  PKG: <FolderOutlined style={{ color: '#FAAD14' }} />,
  PAR: <FunctionOutlined style={{ color: '#722ED1' }} />,
  REQ: <SafetyOutlined style={{ color: '#F5222D' }} />,
  ACT: <DeploymentUnitOutlined style={{ color: '#FA8C16' }} />,
  STM: <FieldTimeOutlined style={{ color: '#13C2C2' }} />,
  SD: <SwapOutlined style={{ color: '#EB2F96' }} />,
  UC: <AccountBookOutlined style={{ color: '#2F54EB' }} />,
};

const DIAGRAM_TYPE_NAME: Record<DiagramType, string> = {
  BDD: 'BDD', IBD: 'IBD', PKG: 'PKG', PAR: 'PAR', REQ: 'REQ',
  ACT: 'ACT', STM: 'STM', SD: 'SD', UC: 'UC',
};

// ===========================================================================
// Tree Building (unchanged logic)
// ===========================================================================

function genId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CHILD_TYPE_ORDER: Record<ElementType, number> = {
  Package: 0, PartDefinition: 1, PartUsage: 2, ItemDefinition: 3, ItemUsage: 4,
  PortDefinition: 5, PortUsage: 6, InterfaceDefinition: 7, InterfaceUsage: 8,
  AttributeDefinition: 9, AttributeUsage: 10, EnumerationDefinition: 11,
  ActionDefinition: 12, ActionUsage: 13, StateDefinition: 14, StateUsage: 15,
  Transition: 16, Actor: 17, UseCase: 18,
  RequirementDefinition: 19, RequirementUsage: 20, StakeholderRequirement: 21,
  ConstraintDefinition: 22, ConstraintUsage: 23, Comment: 24,
};

export interface ModelTreeNode extends DataNode {
  key: string; title: React.ReactNode; icon?: React.ReactNode;
  children: ModelTreeNode[]; isLeaf: boolean; selectable: boolean;
  data: {
    element: SemanticElement;
    hasDiagramRepresentation: boolean;
    diagram?: Diagram;              // 如果这是视图节点
    isDiagramNode?: boolean;        // 标记为视图节点
  };
}

function sortElements(a: SemanticElement, b: SemanticElement): number {
  const aO = CHILD_TYPE_ORDER[a.type] ?? 99;
  const bO = CHILD_TYPE_ORDER[b.type] ?? 99;
  if (aO !== bO) return aO - bO;
  return a.name.localeCompare(b.name);
}

export function buildTree(
  elements: SemanticElement[], relationships: Relationship[],
  diagramNodeElementIds: Set<string>,
  diagrams?: Diagram[],
): ModelTreeNode[] {
  const diagramList = diagrams ?? [];
  const childrenMap = new Map<string, SemanticElement[]>();
  const diagramMap = new Map<string, Diagram[]>();
  for (const d of diagramList) {
    const ownerId = d.ownerElementId ?? null;
    if (ownerId) {
      const list = diagramMap.get(ownerId) || [];
      list.push(d);
      diagramMap.set(ownerId, list);
    }
  }
  const ensureBucket = (parentId: string) => {
    const e = childrenMap.get(parentId);
    if (e) return e;
    const b: SemanticElement[] = [];
    childrenMap.set(parentId, b);
    return b;
  };
  for (const elem of elements) {
    if (elem.ownerId !== null) ensureBucket(elem.ownerId).push(elem);
  }
  for (const rel of relationships) {
    if (rel.type === 'Containment') {
      const target = elements.find((e) => e.id === rel.targetId);
      if (target) {
        const bucket = ensureBucket(rel.sourceId);
        if (!bucket.some((e) => e.id === target.id)) bucket.push(target);
      }
    }
  }
  const roots = elements.filter((e) => e.ownerId === null);
  function convert(element: SemanticElement): ModelTreeNode {
    const kids = childrenMap.get(element.id) ?? [];
    kids.sort(sortElements);
    // 视图节点作为子节点
    const diagNodes: ModelTreeNode[] = (diagramMap.get(element.id) ?? []).map((d) => ({
      key: `diagram:${d.id}`,
      title: <span>{DIAGRAM_ICON_MAP[d.type]} <span style={{ marginLeft: 4 }}>{d.name}</span><span style={{ color: '#8C8C8C', fontSize: '0.85em', marginLeft: 6 }}>[{DIAGRAM_TYPE_NAME[d.type]}]</span></span>,
      icon: DIAGRAM_ICON_MAP[d.type],
      children: [],
      isLeaf: true,
      selectable: true,
      data: { element, hasDiagramRepresentation: false, diagram: d, isDiagramNode: true },
    }));
    const isPkg = element.type === 'Package';
    const allChildren = [...diagNodes, ...kids.map(convert)];
    return {
      key: element.id,
      title: <span>{element.name}<span style={{ color: '#8C8C8C', fontSize: '0.85em', marginLeft: 6 }}>{ELEMENT_TYPE_SUFFIX_MAP[element.type]}</span></span>,
      icon: ELEMENT_TYPE_ICON_MAP[element.type],
      children: allChildren,
      isLeaf: !(allChildren.length > 0 || isPkg),
      selectable: true,
      data: { element, hasDiagramRepresentation: diagramNodeElementIds.has(element.id) },
    };
  }
  roots.sort(sortElements);
  return roots.map(convert);
}

export function isDescendantOf(elements: SemanticElement[], descendantId: string, ancestorId: string): boolean {
  const visited = new Set<string>();
  let cur: string | null = descendantId;
  while (cur !== null && !visited.has(cur)) {
    if (cur === ancestorId) return true;
    visited.add(cur);
    cur = elements.find((e) => e.id === cur)?.ownerId ?? null;
  }
  return false;
}

export function findMatchingPaths(nodes: ModelTreeNode[], searchText: string, selectedIds: string[]): string[] {
  const lower = searchText.toLowerCase();
  const matchingKeys = new Set<string>();
  function walk(list: ModelTreeNode[]): boolean {
    let hasMatch = false;
    for (const node of list) {
      const el = node.data.element;
      const nameMatch = el.name.toLowerCase().includes(lower) || el.qualifiedName.toLowerCase().includes(lower);
      const childMatch = node.children.length > 0 ? walk(node.children) : false;
      if (nameMatch || childMatch) { matchingKeys.add(node.key as string); hasMatch = true; }
    }
    return hasMatch;
  }
  walk(nodes);
  function collectAncestors(list: ModelTreeNode[], targetId: string, ancestors: string[]): string[] | null {
    for (const node of list) {
      if (node.key === targetId) return [...ancestors, node.key as string];
      if (node.children.length > 0) {
        const r = collectAncestors(node.children, targetId, [...ancestors, node.key as string]);
        if (r) return r;
      }
    }
    return null;
  }
  for (const sid of selectedIds) {
    const path = collectAncestors(nodes, sid, []);
    if (path) path.forEach((k) => matchingKeys.add(k));
  }
  return [...matchingKeys];
}

// ===========================================================================
// Context Menu — 全中文 + 新建视图
// ===========================================================================

const CHILD_ELEMENT_TYPES: { label: string; type: ElementType }[] = [
  { label: '包 (Package)', type: 'Package' },
  { label: '部件定义 (Part)', type: 'PartDefinition' },
  { label: '部件实例 (Part Usage)', type: 'PartUsage' },
  { label: '端口定义 (Port)', type: 'PortDefinition' },
  { label: '端口实例 (Port Usage)', type: 'PortUsage' },
  { label: '属性 (Attribute)', type: 'AttributeDefinition' },
  { label: '需求 (Requirement)', type: 'RequirementDefinition' },
  { label: '约束 (Constraint)', type: 'ConstraintDefinition' },
  { label: '动作 (Action)', type: 'ActionDefinition' },
  { label: '状态 (State)', type: 'StateDefinition' },
  { label: '注释 (Comment)', type: 'Comment' },
];

function getContextMenuItems(
  element: SemanticElement,
  hasDiagramRep: boolean,
  _diagramCount: number,
  onCreateChild: (parentId: string, type: ElementType) => void,
  onRename: (id: string) => void,
  onDelete: (id: string) => void,
  onLocateInDiagram: (id: string) => void,
  onCreateDiagram: (parentId: string, diagramType: DiagramType) => void,
): MenuProps['items'] {
  const isReq = element.type === 'RequirementDefinition' || element.type === 'RequirementUsage' || element.type === 'StakeholderRequirement';

  // 该元素下可创建的视图类型
  const availableDiagrams = DIAGRAM_TYPES.filter((dt) =>
    dt.ownerElementTypes.includes(element.type),
  );

  const items: MenuProps['items'] = [
    { key: 'rename', label: '重命名', onClick: () => onRename(element.id) },
    {
      key: 'create-child',
      label: '新建子元素',
      children: CHILD_ELEMENT_TYPES.map((ct) => ({
        key: `create-${ct.type}`, label: ct.label,
        icon: ELEMENT_TYPE_ICON_MAP[ct.type],
        onClick: () => onCreateChild(element.id, ct.type),
      })),
    },
  ];

  // 新建视图（仅当该元素类型支持时）
  if (availableDiagrams.length > 0) {
    items.push({
      key: 'create-diagram',
      label: '新建视图',
      icon: <PlusSquareOutlined />,
      children: availableDiagrams.map((dt) => ({
        key: `diagram-${dt.type}`,
        label: dt.label,
        icon: DIAGRAM_ICON_MAP[dt.type],
        onClick: () => onCreateDiagram(element.id, dt.type),
      })),
    });
  }

  if (isReq) {
    items.push({ type: 'divider' });
    items.push({ key: 'add-satisfy', label: '添加满足关系' });
  }

  items.push({ type: 'divider' });

  if (hasDiagramRep) {
    items.push({ key: 'locate', label: '在图定位', onClick: () => onLocateInDiagram(element.id) });
  }

  items.push({ type: 'divider' });

  items.push({ key: 'delete', label: '删除', danger: true, onClick: () => onDelete(element.id) });

  return items;
}

// ===========================================================================
// Component
// ===========================================================================

export const ModelTreePanel: React.FC = () => {
  const semanticModel = useStore((s) => s.semanticModel);
  const canvasModel = useStore((s) => s.canvasModel);
  const selectedElementIds = useStore((s) => s.selectedElementIds);
  const treeFilter = useStore((s) => s.treeFilter);
  const selectElements = useStore((s) => s.selectElements);
  const updateElement = useStore((s) => s.updateElement);
  const removeElement = useStore((s) => s.removeElement);
  const moveElement = useStore((s) => s.moveElement);
  const addElement = useStore((s) => s.addElement);
  const setTreeFilter = useStore((s) => s.setTreeFilter);
  const addDiagram = useStore((s) => s.addDiagram);

  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [previousExpandedKeys, setPreviousExpandedKeys] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; element: SemanticElement; hasDiagramRep: boolean; diagramCount: number;
  } | null>(null);

  // Derived
  const diagramNodeElementIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of canvasModel.diagrams) {
      for (const n of d.nodes) ids.add(n.semanticElementId);
    }
    return ids;
  }, [canvasModel.diagrams]);

  const treeData = useMemo(() =>
    buildTree(semanticModel.elements, semanticModel.relationships, diagramNodeElementIds, canvasModel.diagrams),
    [semanticModel.elements, semanticModel.relationships, diagramNodeElementIds, canvasModel.diagrams]);

  useEffect(() => {
    if (treeFilter) {
      const keys = findMatchingPaths(treeData, treeFilter, selectedElementIds);
      if (keys.length > 0) setExpandedKeys(keys);
    }
  }, [treeFilter, treeData, selectedElementIds]);

  // ---- Handlers ----

  const handleSelect = useCallback((keys: React.Key[], info: { node: EventDataNode<ModelTreeNode> }) => {
    // 点击视图节点 → 切换活跃图
    if (info.node?.data?.isDiagramNode && info.node.data.diagram) {
      const d = info.node.data.diagram;
      useStore.getState().openDiagram(d.id);
      return;
    }
    selectElements(keys.map((k) => String(k)));
  }, [selectElements]);

  const handleDoubleClick = useCallback((_e: React.MouseEvent, node: ModelTreeNode) => {
    const eid = node.data.element.id;
    selectElements([eid]);
    for (const d of canvasModel.diagrams) {
      if (d.nodes.some((n) => n.semanticElementId === eid)) {
        useStore.setState({ activeDiagramId: d.id });
        break;
      }
    }
  }, [selectElements, canvasModel.diagrams]);

  const handleRightClick = useCallback(({ event, node }: { event: React.MouseEvent; node: EventDataNode<ModelTreeNode> }) => {
    event.preventDefault();
    const eid = node.data.element.id;
    const dCount = canvasModel.diagrams.filter((d) =>
      d.nodes.some((n) => n.semanticElementId === eid)
    ).length;
    setContextMenu({
      x: event.clientX, y: event.clientY,
      element: node.data.element,
      hasDiagramRep: node.data.hasDiagramRepresentation,
      diagramCount: dCount,
    });
  }, [canvasModel.diagrams]);

  const handleCreateChild = useCallback((parentId: string, childType: ElementType) => {
    const childId = genId();
    const el: SemanticElement = {
      id: childId, name: `新${CHILD_ELEMENT_TYPES.find(c => c.type === childType)?.label.split(' ')[0] ?? childType}`,
      qualifiedName: `新元素`, type: childType, ownerId: parentId, description: '', properties: {},
    };
    addElement(el);
    message.success(`已创建 ${CHILD_ELEMENT_TYPES.find(c => c.type === childType)?.label ?? childType}`);
  }, [addElement]);

  const handleCreateDiagram = useCallback((parentId: string, diagramType: DiagramType) => {
    const def = DIAGRAM_TYPES.find((d) => d.type === diagramType);
    const diagId = genId();
    const newDiagram: Diagram = {
      id: diagId,
      name: `${def?.label ?? diagramType}`,
      type: diagramType,
      ownerElementId: parentId,
      isOpen: true,
      nodes: [], edges: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
    addDiagram(newDiagram);
    message.success(`已创建视图: ${def?.label ?? diagramType}`);
  }, [addDiagram]);

  const handleRenameStart = useCallback((id: string) => {
    const el = semanticModel.elements.find((e) => e.id === id);
    if (el) { setRenamingId(id); setRenameValue(el.name); }
  }, [semanticModel.elements]);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) updateElement(renamingId, { name: renameValue.trim() });
    setRenamingId(null);
  }, [renamingId, renameValue, updateElement]);

  const handleDelete = useCallback((id: string) => {
    removeElement(id);
    message.success('已删除元素');
  }, [removeElement]);

  const handleLocateInDiagram = useCallback((elementId: string) => {
    for (const d of canvasModel.diagrams) {
      if (d.nodes.some((n) => n.semanticElementId === elementId)) {
        useStore.setState({ activeDiagramId: d.id });
        selectElements([elementId]);
        message.info(`已定位到图: ${d.name}`);
        return;
      }
    }
    message.warning('该元素不在任何图中');
  }, [canvasModel.diagrams, selectElements]);

  const handleDrop = useCallback((info: {
    node: EventDataNode<ModelTreeNode>; dragNode: EventDataNode<ModelTreeNode>;
    dropPosition: number; dropToGap: boolean;
  }) => {
    if (info.dropToGap) return;
    const dragId = info.dragNode.key as string;
    const targetId = info.node.key as string;
    if (dragId === targetId) return;
    if (isDescendantOf(semanticModel.elements, targetId, dragId)) {
      message.error('不能将元素移动到自己的子孙节点下');
      return;
    }
    moveElement(dragId, targetId);
    message.success('已移动元素');
  }, [semanticModel.elements, moveElement]);

  const handleExpand = useCallback((keys: React.Key[]) => setExpandedKeys(keys.map(String)), []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val && treeFilter) setExpandedKeys(previousExpandedKeys);
    if (val && !treeFilter) setPreviousExpandedKeys(expandedKeys);
    setTreeFilter(val);
  }, [setTreeFilter, treeFilter, expandedKeys, previousExpandedKeys]);

  const handleContextMenuClose = useCallback(() => setContextMenu(null), []);

  const ctxMenuItems: MenuProps['items'] | undefined = useMemo(() => {
    if (!contextMenu) return undefined;
    const { element, hasDiagramRep, diagramCount } = contextMenu;
    return getContextMenuItems(element, hasDiagramRep, diagramCount,
      handleCreateChild, handleRenameStart, handleDelete, handleLocateInDiagram, handleCreateDiagram);
  }, [contextMenu, handleCreateChild, handleRenameStart, handleDelete, handleLocateInDiagram, handleCreateDiagram]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 8 }}>
        <Input placeholder="搜索元素..." value={treeFilter} onChange={handleSearchChange}
          allowClear size="small" prefix={<SearchOutlined />} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        <Tree<ModelTreeNode>
          treeData={treeData} selectedKeys={selectedElementIds}
          expandedKeys={expandedKeys} onSelect={handleSelect} onExpand={handleExpand}
          onDoubleClick={(e, node) => handleDoubleClick(e, node as ModelTreeNode)}
          onRightClick={handleRightClick} draggable blockNode showIcon onDrop={handleDrop}
        />
      </div>

      {contextMenu && ctxMenuItems && (
        <Dropdown open onOpenChange={(open) => { if (!open) handleContextMenuClose(); }}
          menu={{ items: ctxMenuItems }} destroyOnHidden>
          <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, width: 1, height: 1 }} />
        </Dropdown>
      )}

      <Modal title="重命名元素" open={renamingId !== null}
        onOk={handleRenameSubmit} onCancel={() => setRenamingId(null)} okText="确定" cancelText="取消" destroyOnHidden>
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameSubmit} autoFocus />
      </Modal>
    </div>
  );
};

export default ModelTreePanel;
