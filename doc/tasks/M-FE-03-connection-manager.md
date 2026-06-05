# M-FE-03: Connection Manager（连线管理器）

> **详细设计**: §3.3
> **依赖**: M-FE-01（Canvas Engine）, M-FE-02（Element Renderers — PortAnchor）
> **目标**: 连线的创建、删除、路径计算、路由更新、样式管理

---

## 任务清单

### 1. 连线生命周期

- [ ] **1.1** 实现 `createConnection(sourceId, targetId, type, style?)` → FabricObject
  - 通过 PortAnchor 获取源/目标端点坐标
  - 生成初始路径（直线连接两端点）
  - 应用 RELATIONSHIP_STYLE_MAP 默认样式
  - 在 FabricObject.data 中存储 relationship 元数据
- [ ] **1.2** 实现 `removeConnection(connectionId)`：从画布移除连线对象
- [ ] **1.3** 测试：create → getConnectionById 可查到，remove → 返回 null

### 2. 连线样式

- [ ] **2.1** 定义 `RELATIONSHIP_STYLE_MAP`（Connection/Binding/Flow/Satisfy/Verify/Transition... → EdgeStyle）
- [ ] **2.2** 实现 `applyRelationshipStyle(connectionId, type)`：修改连线颜色、线型、箭头
- [ ] **2.3** 实现箭头渲染：Source/Target Port 端绘制箭头（filled/open/diamond/none）
- [ ] **2.4** 测试：Connection 为实线无箭头，Satisfy 为绿色虚线实心箭头

### 3. 路径计算

- [ ] **3.1** 实现直角正交路由（Orthogonal Routing）：
  - 输入 sourcePoint, targetPoint, obstacles[]
  - 算法：从源点向四方向扩展候选线段，遇障碍物折弯，最小化转弯次数
  - 输出 waypoints[]
- [ ] **3.2** 实现直线路由（Straight）：直接连接两端点
- [ ] **3.3** 实现曲线路由（Curved）：二次贝塞尔曲线
- [ ] **3.4** 实现 `updatePathsForElement(elementId)`：元素移动/缩放后重算所有关联连线路径
- [ ] **3.5** 测试：两元素中间有障碍物，正交路由自动绕行；元素移动后连线跟随

### 4. 路径点交互

- [ ] **4.1** 用户拖拽连线中间段 → 在该位置添加 waypoint，路径经过新 waypoint
- [ ] **4.2** 用户拖拽 waypoint → 更新该点坐标，重算相邻线段
- [ ] **4.3** 双击 waypoint → 删除该 waypoint（至少保留 2 个端点）
- [ ] **4.4** 测试：添加 waypoint 后路径经过该点；删除 waypoint 后路径恢复为直线

### 5. 查询

- [ ] **5.1** 实现 `getConnectionsForElement(elementId)`：查找所有以该元素为端点的连线
- [ ] **5.2** 实现 `getConnectionById(id)`：按 ID 查连线
- [ ] **5.3** 测试：元素通过 port 连接后，该方法返回正确的连线列表

---

> **完成标准**: 可在两个元素端口间创建连线，拖拽元素时连线路径自动更新，不同关系类型有正确视觉样式
