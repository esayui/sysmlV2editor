# M-FE-01: Canvas Engine（画布引擎）

> **详细设计**: §3.1
> **依赖**: M-SH-01（项目脚手架）
> **目标**: 封装 Fabric.js 画布实例，提供视口控制、对象增删、序列化、事件系统

---

## 任务清单

### 1. 画布实例生命周期

- [x] **1.1** 实现 `initialize(container, config)`：创建 Fabric.js Canvas，绑定到 DOM 容器
- [x] **1.2** 实现 `destroy()`：释放 Fabric.js 实例，清理事件监听
- [x] **1.3** 在 `ICanvasEngine` 接口中定义 `CanvasConfig` 类型（width, height, backgroundColor, gridSize, snapToGrid, zoomMin/Max）
- [x] **1.4** 创建 React Hook `useCanvasEngine(containerRef, config)` → 返回 engine 实例，自动管理生命周期

### 2. 视口控制

- [x] **2.1** 实现 `zoom(factor, center?)`：以指定点为中心缩放，限制在 [zoomMin, zoomMax] 范围内
- [x] **2.2** 实现 `zoomToFit()`：自动计算所有对象包围盒，缩放至全部可见
- [x] **2.3** 实现 `pan(delta)`：平移画布视口
- [x] **2.4** 实现 `getViewport()` / `setViewport(state)`：获取/恢复视口状态（zoom, panX, panY）
- [x] **2.5** 鼠标滚轮缩放 + 按住空格键拖拽平移（协调 Interaction Handler）
- [x] **2.6** 测试：zoom 到 2x 后 viewport.zoom === 2，zoom 到 0.1 以下被限制

### 3. 对象操作

- [x] **3.1** 实现 `addObject(obj)`：将 FabricObject 添加到画布，触发布局更新
- [x] **3.2** 实现 `removeObject(obj)`：从画布移除对象
- [x] **3.3** 实现 `getObjectById(id)`：按自定义 ID 查找画布对象（通过 `obj.data.id` 映射）
- [x] **3.4** 实现 `getSelectedObjects()`：返回当前选中的对象列表
- [x] **3.5** 测试：add → getObjectById 可查到，remove → getObjectById 返回 null

### 4. 序列化

- [x] **4.1** 实现 `toJSON()`：序列化画布为 CanvasJSON（包含视口、对象、样式），保留自定义属性
- [x] **4.2** 实现 `loadFromJSON(json)`：从 CanvasJSON 恢复画布（含异步图片加载处理）
- [x] **4.3** 测试：roundtrip — toJSON → loadFromJSON → toJSON 两次结果一致

### 5. 画布配置

- [x] **5.1** 实现网格背景渲染（点状或线状网格），`setGridVisible(bool)` 切换
- [x] **5.2** 实现吸附到网格 `setSnapToGrid(bool)`：对象移动时坐标对齐到 gridSize 的整数倍
- [x] **5.3** 实现 `setBackground(color)` 修改画布背景色

### 6. 事件系统

- [x] **6.1** 实现 `on(event, handler)` / `off(event, handler)` 事件注册/注销
- [x] **6.2** 桥接 Fabric.js 原生事件 → CanvasEvent 枚举（object:selected, object:moving, mouse:down, canvas:drop, viewport:change 等）
- [x] **6.3** 测试：addObject 后触发 `canvas:drop` → handler 被调用且参数正确

### 7. 性能

- [x] **7.1** 对象数 > 100 时自动启用 `objectCaching: true`
- [x] **7.2** 实现帧率监控：requestAnimationFrame 统计 FPS，console 输出

---

> **完成标准**: Canvas 在页面可见，支持滚轮缩放 + 空格平移，add/remove 正常，toJSON/loadFromJSON roundtrip 一致
