# M-FE-05: Toolbox Panel（工具箱面板）

> **详细设计**: §3.5
> **依赖**: M-FE-01（Canvas Engine）, M-FE-04（Interaction Handler）, M-FE-08（State Store）
> **目标**: 左侧面板展示 SysML 元素分类列表，支持拖拽到画布创建元素

---

## 任务清单

### 1. 面板布局

- [ ] **1.1** 实现 `ToolboxPanel` React 组件：固定在左侧的可折叠面板（Ant Design Sider 或自定义）
- [ ] **1.2** 顶部搜索框：实时过滤 Toolbox item，支持中英文模糊匹配
- [ ] **1.3** 分类折叠展示：结构/行为/需求/参数/关系/注释 六个分类组，每组可展开/折叠
- [ ] **1.4** 测试：搜索 "block" 只显示 "部件定义" 和 "部件使用"

### 2. 数据定义

- [ ] **2.1** 定义 `ToolboxCategory` 和 `ToolboxItem` 类型
- [ ] **2.2** 创建 `defaultToolboxItems` 常量数组：按分类列出所有 SysML 元素类型
- [ ] **2.3** 每个 ToolboxItem 包含：id, elementType, label, icon, hotkey, defaultStyle
- [ ] **2.4** 测试：defaultToolboxItems 中每种 ElementType 都有对应的 item

### 3. 拖拽交互

- [ ] **3.1** Toolbox item 设为 `draggable`，`onDragStart` 设置 `dataTransfer`（JSON: elementType, label）
- [ ] **3.2** 拖拽开始时显示拖拽预览（半透明图标跟随光标）
- [ ] **3.3** 拖拽到 Canvas 区域释放 → Canvas 的 drop 事件接收数据 → InteractionHandler 触发 `drop:from-toolbox`
- [ ] **3.4** 拖拽到画布外区域（Toolbox / Properties / 浏览器外）→ 不创建元素
- [ ] **3.5** 测试：从 Toolbox 拖 "Part Definition" 到画布，Canvas drop 事件 dataTransfer 包含 elementType='PartDefinition'

### 4. 点击交互

- [ ] **4.1** 点击 Toolbox item → 高亮选中状态（蓝色边框/背景）
- [ ] **4.2** 选中后移动鼠标到画布 → 光标显示放置预览
- [ ] **4.3** 点击画布空白处 → 在点击位置创建选中类型的元素
- [ ] **4.4** 按 Escape 或再次点击 Toolbox item → 取消选中
- [ ] **4.5** 测试：点击 "Port Definition" → 画布光标变为 crosshair+预览 → 点击画布 → 创建端口

### 5. 快捷键

- [ ] **5.1** 为常用元素绑定快捷键：B=PartDef, P=PortDef, R=Requirement, C=Connection, 等
- [ ] **5.2** 快捷键显示在 Toolbox item 右侧（灰色小字）
- [ ] **5.3** 测试：按 B 键 → InteractionHandler 切换到 create-block 模式

---

> **完成标准**: 六个分类正确展示，搜索过滤正常，拖拽元素到画布触发正确的 drop 事件，快捷键生效
