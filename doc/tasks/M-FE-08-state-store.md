# M-FE-08: State Store（状态管理）

> **详细设计**: §3.8
> **依赖**: 无（被所有前端模块依赖，需先完成类型定义部分）
> **目标**: Zustand Store，管理语义模型、画布模型、UI 状态，提供不可变更新操作
> **状态**: ✅ 已完成 — 49 tests passed, tsc zero errors

---

## 任务清单

### 1. Store 骨架

- [x] **1.1** 安装 Zustand，创建 `src/store/index.ts`：组合三个 Slice
- [x] **1.2** 定义 `AppStore` 接口（所有 actions 和 state 字段）
- [x] **1.3** 创建 `src/store/slices/` 目录结构
- [x] **1.4** 测试：create store 返回的对象包含所有期望的 state 默认值

### 2. 语义模型 Slice

- [x] **2.1** 实现 `createSemanticSlice`：semanticModel 初始值（空模型）
- [x] **2.2** 实现 `addElement(element)`：追加到 elements 数组，isDirty=true
- [x] **2.3** 实现 `updateElement(id, patch)`：找到元素，合并 patch，isDirty=true
- [x] **2.4** 实现 `removeElement(id)`：删除元素 + 级联删除所有子元素（ownerId===id） + 删除所有关联 relationship
- [x] **2.5** 实现 `addRelationship(rel)`：追加到 relationships 数组
- [x] **2.6** 实现 `removeRelationship(id)`：从 relationships 数组中删除
- [x] **2.7** 实现 `moveElement(elementId, newOwnerId)`：修改 ownerId
- [x] **2.8** 测试：add → update → remove 完整流程；remove 后子元素和关系也消失

### 3. 画布模型 Slice

- [x] **3.1** 实现 `createCanvasSlice`：canvasModel 初始值 + activeDiagramId
- [x] **3.2** 实现 `addNodeToDiagram(diagramId, node)`：在指定 Diagram 中添加节点
- [x] **3.3** 实现 `updateNodePosition(nodeId, x, y)`：更新节点坐标
- [x] **3.4** 实现 `updateNodeStyle(nodeId, partialStyle)`：合并样式
- [x] **3.5** 实现 `removeNodeFromDiagram(diagramId, nodeId)`：从 Diagram 中移除节点
- [x] **3.6** 实现 `addEdgeToDiagram(diagramId, edge)`：添加连线
- [x] **3.7** 实现 `updateEdgeWaypoints(edgeId, waypoints)`：更新路径点
- [x] **3.8** 实现 `removeEdgeFromDiagram(diagramId, edgeId)`：移除连线
- [x] **3.9** 测试：addNode → updatePosition → 坐标变化；removeNode → 节点不再存在

### 4. UI 状态 Slice

- [x] **4.1** 实现 `createUISlice`：selectedElementIds, interactionMode, toolboxFilter, treeFilter, isDirty
- [x] **4.2** 实现 `selectElements(ids)`：设置 selectedElementIds
- [x] **4.3** 实现 `clearSelection()`：清空 selectedElementIds
- [x] **4.4** 实现 `setInteractionMode(mode)`：更新 interactionMode
- [x] **4.5** 实现 `markDirty()` / `markClean()`：控制 isDirty
- [x] **4.6** 测试：selectElements(['a','b']) → selectedElementIds = ['a','b']

### 5. 选择器 (Selectors)

- [x] **5.1** 实现 `useSelectedElement(state)`：从 semanticModel 中按 ID 获取选中元素
- [x] **5.2** 实现 `useDiagramNodes(state)`：获取当前活动 Diagram 的节点列表
- [x] **5.3** 实现 `useDiagramEdges(state)`：获取当前活动 Diagram 的连线列表
- [x] **5.4** 实现 `useElementChildren(elementId)(state)`：获取某元素的子元素
- [x] **5.5** 实现 `useDirtyStatus(state)`：返回 isDirty
- [x] **5.6** 测试：Selector 返回的数据随 Store 更新而变化

---

> **完成标准**: 所有 Slice 通过单元测试，Selectors 返回正确派生数据，Store 可作为其他模块的唯一数据源
