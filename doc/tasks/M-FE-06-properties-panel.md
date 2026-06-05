# M-FE-06: Properties Panel（属性面板）

> **详细设计**: §3.6
> **依赖**: M-FE-01（Canvas Engine）, M-FE-02（Element Renderers）, M-FE-08（State Store）
> **目标**: 右侧面板显示选中元素的属性，提供编辑表单，变更实时同步

---

## 任务清单

### 1. 面板布局

- [ ] **1.1** 实现 `PropertiesPanel` React 组件：固定在右侧的可折叠面板
- [ ] **1.2** 选中状态显示：底部显示 "已选中 N 个元素" 或多选时 "N 个对象"
- [ ] **1.3** 面板标题区显示元素图标 + 类型名 + 元素名称
- [ ] **1.4** 测试：选中 Block → 面板标题显示 "▣ Part Definition: Engine"

### 2. 通用属性表单

- [ ] **2.1** 实现"通用" Section：名称（text input）、描述（textarea）、限定名（只读 text）
- [ ] **2.2** 名称修改 → 触发 `Store.updateElement(id, { name })`，画布上标签同步更新
- [ ] **2.3** 描述修改 → 触发 `Store.updateElement(id, { description })`
- [ ] **2.4** 测试：修改名称 "Engine" → "Motor" → 画布上标签变为 "Motor"

### 3. 样式属性表单

- [ ] **3.1** 实现"样式" Section：填充色（color picker）、边框色（color picker）、边框宽度（number）、字号（number）
- [ ] **3.2** 颜色修改 → 触发 `Store.updateNodeStyle(nodeId, { fillColor, strokeColor })`
- [ ] **3.3** 字号修改 → 触发 `Store.updateNodeStyle` + 重新计算元素尺寸
- [ ] **3.4** 测试：选颜色 → 画布对象颜色立即更新

### 4. 类型特有属性表单

- [ ] **4.1** 实现 `PropertyFormFactory.createForm(element, canvasNode)` 方法
- [ ] **4.2** PartDefinition 特有：isAbstract（checkbox）、superTypes（tag select）、attributes（动态列表表格：名称+类型+多重性）
- [ ] **4.3** PortDefinition 特有：direction（select: in/out/inout）、type（text）
- [ ] **4.4** Requirement 特有：requirementId（text）、category（select）、priority（select）、text（textarea）
- [ ] **4.5** Constraint 特有：expression（textarea）、parameters（动态列表表格：名称+类型+单位）
- [ ] **4.6** 测试：选中 Requirement → 显示 requirementId、category、priority 专属字段

### 5. 多选处理

- [ ] **5.1** 选中多个元素时，属性面板显示 "已选中 N 个元素"
- [ ] **5.2** 多选时样式 Section 仍然可见，修改会应用到所有选中元素
- [ ] **5.3** 多选时类型特有属性 Section 隐藏
- [ ] **5.4** 测试：选中 3 个 Block 改颜色 → 3 个都变色

### 6. 表单验证

- [ ] **6.1** 名称不能为空 → 为空时输入框变红 + 错误提示
- [ ] **6.2** 名称不能与同层级兄弟重名 → 前端做初步检查
- [ ] **6.3** 数字输入不能为负数（字号、边框宽度）
- [ ] **6.4** 测试：清空名称 → 红色错误提示

---

> **完成标准**: 选中不同类型元素显示对应属性表单，编辑属性实时同步到画布和语义模型
