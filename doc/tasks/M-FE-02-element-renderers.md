# M-FE-02: Element Renderers（元素渲染器）

> **详细设计**: §3.2
> **依赖**: M-FE-01（Canvas Engine）, M-FE-08（State Store — 类型定义）
> **目标**: 每种 SysML 图元 → Fabric.js 可视化对象，含形状、样式、端口锚点

---

## 任务清单

### 1. 基类与注册表

- [ ] **1.1** 实现 `BaseElementRenderer<T>` 抽象类（render, update, getPortAnchors, calculateSize）
- [ ] **1.2** 实现 `RendererRegistry`：Map<ElementType, BaseElementRenderer>，register/get 方法
- [ ] **1.3** 实现 `RendererRegistry.createCanvasObject(element, position?)`：工厂方法
- [ ] **1.4** 定义 `PortAnchor` 接口（id, position, point, direction）
- [ ] **1.5** 测试：注册 Block Renderer，调用 createCanvasObject 返回非 null FabricObject

### 2. 结构建模 Renderer

- [ ] **2.1** 实现 `BlockRenderer`（PartDefinition / ItemDefinition）→ 圆角矩形，顶部显示名称、中部显示属性、边缘显示端口
- [ ] **2.2** 实现 `BlockInstanceRenderer`（PartUsage / ItemUsage）→ 矩形（虚线边框），名称下方标注 `: DefinitionName`
- [ ] **2.3** 实现 `PortRenderer`（PortDef / PortUsage）→ 小方块（10x10），颜色按方向区分（in=蓝, out=红, inout=紫）
- [ ] **2.4** 实现 `PackageRenderer` → 带 Tab 的文件夹形矩形
- [ ] **2.5** 测试：每种 Renderer 生成的 FabricObject 尺寸在合理范围；getPortAnchors 返回正确方向锚点

### 3. 行为建模 Renderer

- [ ] **3.1** 实现 `ActionRenderer` → 圆角矩形，显示动作名称
- [ ] **3.2** 实现 `StateRenderer` → 圆角矩形，显示状态名称
- [ ] **3.3** 实现 `ActorRenderer` → 火柴人图标 + 下方标签
- [ ] **3.4** 实现 `UseCaseRenderer` → 椭圆，显示用例名称
- [ ] **3.5** 测试：每种 Renderer 的 update() 方法能更新标签文字

### 4. 需求与参数 Renderer

- [ ] **4.1** 实现 `RequirementRenderer` → 缺角矩形，左上方显示 ID（如 REQ-001），中部显示需求文本
- [ ] **4.2** 实现 `ConstraintRenderer` → 圆角矩形，顶部名称、中部表达式，边缘显示参数锚点
- [ ] **4.3** 测试：Requirement 的缺角路径正确渲染

### 5. 注释 Renderer

- [ ] **5.1** 实现 `CommentRenderer` → 折角矩形，黄色背景，显示注释文本
- [ ] **5.2** 实现 `TextRenderer` → 纯文本 Fabric.js IText/Textbox

### 6. 样式与更新

- [ ] **6.1** 实现 `BaseElementRenderer.applyStyle(fObj, nodeStyle)`：将 NodeStyle 映射到 Fabric.js 属性
- [ ] **6.2** 实现每个 Renderer 的 `update(fObj, element, style)`：更新名称、描述、属性列表
- [ ] **6.3** 测试：update 后 FabricObject 标签文字变化、尺寸可能重新计算

### 7. 端口锚点

- [ ] **7.1** 为 BlockRenderer 实现 getPortAnchors：遍历 element.properties.ports，为每个端口生成锚点位置
- [ ] **7.2** 元素缩放/移动后 PortAnchor 坐标通过 `fObj.getBoundingRect()` 动态计算
- [ ] **7.3** 测试：缩放元素后 PortAnchor 坐标跟随变化

---

> **完成标准**: 所有 SysML 图元类型都有对应的 Renderer，Registry 可正确查找，每种 Renderer 通过独立测试
