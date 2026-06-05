# M-FE-10: Undo/Redo Engine（撤销重做引擎）

> **详细设计**: §3.10
> **依赖**: M-FE-08（State Store）
> **目标**: Command 模式的撤销/重做栈，支持操作合并

---

## 任务清单

### 1. Command 接口与引擎

- [x] **1.1** 定义 `ICommand` 接口（type, timestamp, execute, undo, canMergeWith, merge）
- [x] **1.2** 实现 `UndoRedoEngine` 类：
  - `undoStack: ICommand[]` 和 `redoStack: ICommand[]`
  - `maxStackSize: number`（默认 200）
- [x] **1.3** 实现 `execute(command)`：执行 command.execute()，推入 undoStack，清空 redoStack
- [x] **1.4** 实现 `undo()`：弹出 undoStack 最后一个 command，调用 cmd.undo()，推入 redoStack
- [x] **1.5** 实现 `redo()`：弹出 redoStack 最后一个 command，调用 cmd.execute()，推入 undoStack
- [x] **1.6** 实现 `canUndo()` / `canRedo()`：检查栈非空
- [x] **1.7** 实现 `clear()`：清空两个栈
- [x] **1.8** 测试：execute → undo → canUndo=false；undo → redo → 状态回到 execute 后

### 2. 典型 Command 实现

- [x] **2.1** 实现 `MoveElementsCommand`：存储 {nodeId, from, to}[]，undo/execute 互相调用 updateNodePosition
  - canMergeWith：同类型 + 200ms 内
  - merge：合并 move 列表（相同 nodeId 用新的覆盖）
- [x] **2.2** 实现 `CreateElementCommand`：存储 {element, node}，execute=添加，undo=删除
- [x] **2.3** 实现 `DeleteElementCommand`：存储被删元素+子元素+关系+节点（完整快照），execute=执行删除，undo=恢复所有
- [x] **2.4** 实现 `ChangePropertyCommand`：存储 {elementId, property, oldValue, newValue}，execute/undo 切换值
- [x] **2.5** 实现 `CreateConnectionCommand`：存储 {edge, relationship}，execute=添加，undo=删除
- [x] **2.6** 测试：每种 Command 的 execute → undo → redo 循环验证

### 3. 合并逻辑

- [x] **3.1** execute 新 command 之前，检查栈顶 command 的 canMergeWith(new)
- [x] **3.2** 可合并 → 调用 merge，替换栈顶（不推入新 command）
- [x] **3.3** 不可合并 → 正常推入
- [x] **3.4** 测试：在 100ms 内连续拖拽 3 次 → undo 一次回到初始位置

### 4. 快捷键绑定

- [x] **4.1** 在 InteractionHandler 中绑定 Ctrl+Z → engine.undo()
- [x] **4.2** Ctrl+Y / Ctrl+Shift+Z → engine.redo()
- [x] **4.3** 工具栏显示 Undo/Redo 按钮，disabled 状态绑定 canUndo/canRedo
- [x] **4.4** 测试：创建元素 → Ctrl+Z → 元素消失 → Ctrl+Y → 元素恢复

### 5. 历史面板（可选）

- [x] **5.1** 实现 `getHistory(): HistoryEntry[]`：返回可读的操作历史列表
- [x] **5.2** 显示在 UI 中（可折叠的历史列表，点击可跳转到该状态）

---

> **完成标准**: 所有建模操作可撤销/重做，连续拖拽合并为一个 command，Ctrl+Z/Y 快捷键生效
