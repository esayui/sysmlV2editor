# SysML v2 图形化建模软件 —— 详细设计文档

> **文档版本**: v1.0
> **日期**: 2026-06-05
> **基于需求版本**: proposal.md v1.0
> **设计范围**: V1 MVP（单用户本地建模）

---

## 目录

1. [架构总览](#1-架构总览)
2. [模块分解](#2-模块分解)
3. [前端模块设计](#3-前端模块设计)
   - [3.1 Canvas Engine（画布引擎）](#31-canvas-engine画布引擎)
   - [3.2 Element Renderers（元素渲染器）](#32-element-renderers元素渲染器)
   - [3.3 Connection Manager（连线管理器）](#33-connection-manager连线管理器)
   - [3.4 Interaction Handler（交互处理器）](#34-interaction-handler交互处理器)
   - [3.5 Toolbox Panel（工具箱面板）](#35-toolbox-panel工具箱面板)
   - [3.6 Properties Panel（属性面板）](#36-properties-panel属性面板)
   - [3.7 Model Tree Panel（模型树面板）](#37-model-tree-panel模型树面板)
   - [3.8 State Store（状态管理）](#38-state-store状态管理)
   - [3.9 API Client（后端通信层）](#39-api-client后端通信层)
   - [3.10 Undo/Redo Engine（撤销重做引擎）](#310-undoredo-engine撤销重做引擎)
4. [后端模块设计](#4-后端模块设计)
   - [4.1 SysML v2 Parser（文本解析器）](#41-sysml-v2-parser文本解析器)
   - [4.2 Model Manager（模型管理器）](#42-model-manager模型管理器)
   - [4.3 Model Validator（模型校验器）](#43-model-validator模型校验器)
   - [4.4 File Service（文件服务）](#44-file-service文件服务)
   - [4.5 Export Service（导出服务）](#45-export-service导出服务)
   - [4.6 API Layer（接口层）](#46-api-layer接口层)
5. [数据模型定义](#5-数据模型定义)
   - [5.1 语义模型（Semantic Model）](#51-语义模型semantic-model)
   - [5.2 画布模型（Canvas Model）](#52-画布模型canvas-model)
   - [5.3 双层模型关联机制](#53-双层模型关联机制)
6. [API 接口设计](#6-api-接口设计)
7. [测试策略](#7-测试策略)
8. [附录](#8-附录)

---

## 1. 架构总览

### 1.1 分层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        浏览器 (Browser)                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    UI Layer (React)                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │   │
│  │  │Toolbox   │ │Properties│ │Model Tree│ │  Menu Bar   │  │   │
│  │  │Panel     │ │Panel     │ │Panel     │ │             │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                   Canvas Layer (Fabric.js)                │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │            Fabric.js Canvas Instance              │    │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │    │   │
│  │  │  │Element   │ │Connection│ │Interaction       │  │    │   │
│  │  │  │Renderers │ │Manager   │ │Handler           │  │    │   │
│  │  │  └──────────┘ └──────────┘ └──────────────────┘  │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                    State Layer (Zustand)                  │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │   │
│  │  │Semantic Store│ │Canvas Store  │ │  Undo/Redo Stack │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                    API Client Layer                       │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │           HTTP Client (fetch / axios)            │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────────┘
                           │  HTTP (JSON)
┌──────────────────────────┴───────────────────────────────────────┐
│                    Python Backend (FastAPI)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      API Layer                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │   │
│  │  │Model API │ │File API  │ │Export API│ │Validate API │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                    Service Layer                           │   │
│  │  ┌──────────────┐ ┌──────────┐ ┌──────────────────────┐  │   │
│  │  │SysML v2      │ │Model     │ │File / Export         │  │   │
│  │  │Parser (Lark) │ │Validator │ │Services              │  │   │
│  │  └──────────────┘ └──────────┘ └──────────────────────┘  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                    Persistence Layer                       │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │        File System (.sysml2 / .json)             │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **双层模型分离** | 语义模型（SysML v2 语句）与画布模型（图形坐标/样式）独立存储，通过 UUID 关联 |
| **单向数据流** | UI 事件 → Zustand Store 更新 → React 重渲染 / Fabric.js 命令式更新 |
| **Command 模式** | 所有可撤销操作封装为 Command，Undo/Redo 基于 Command 栈 |
| **模块独立性** | 每个前端面板、每个后端服务均可独立开发和测试 |
| **接口先行** | 模块间通过 TypeScript Interface / Python ABC 定义契约 |

### 1.3 技术栈确认

| 层次 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | ≥ 18.x |
| 语言 | TypeScript | ≥ 5.x |
| 图形引擎 | Fabric.js | ≥ 6.x |
| 状态管理 | Zustand | ≥ 4.x |
| UI 组件库 | Ant Design | ≥ 5.x |
| 构建工具 | Vite | ≥ 5.x |
| 后端框架 | FastAPI | ≥ 0.110 |
| Python | CPython | ≥ 3.10 |
| 语法解析 | Lark | ≥ 1.x |
| 环境管理 | Anaconda | latest stable |

---

## 2. 模块分解

### 2.1 模块总览与依赖

```
                    ┌──────────────────────────────┐
                    │         App Shell             │
                    │   (Layout, Menu, Routing)     │
                    └────────────┬─────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
  ┌───────▼───────┐    ┌────────▼────────┐    ┌────────▼────────┐
  │   Toolbox     │    │    Canvas       │    │   Panels        │
  │   Panel       │    │    Engine       │    │   (Properties,  │
  │               │    │                 │    │    Tree)        │
  └───────┬───────┘    └────────┬────────┘    └────────┬────────┘
          │                     │                      │
          │              ┌──────▼──────┐               │
          │              │  State Store │◄──────────────┘
          │              │  (Zustand)   │
          │              └──────┬──────┘
          │                     │
          │              ┌──────▼──────┐
          └──────────────►  API Client │
                         └──────┬──────┘
                                │
                         ═══════╪══════════  Network boundary
                                │
                         ┌──────▼──────┐
                         │  FastAPI     │
                         │  Router      │
                         └──────┬──────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
  ┌───────▼───────┐    ┌───────▼───────┐    ┌────────▼────────┐
  │  SysML v2     │    │  Model        │    │  File / Export  │
  │  Parser       │    │  Manager      │    │  Services       │
  └───────────────┘    └───────────────┘    └─────────────────┘
```

### 2.2 模块清单

| 编号 | 模块名称 | 所在层 | 职责 | 依赖 |
|------|----------|--------|------|------|
| **M-FE-01** | Canvas Engine | 前端·画布层 | Fabric.js 画布实例管理、渲染调度 | — |
| **M-FE-02** | Element Renderers | 前端·画布层 | SysML 元素的 Fabric.js 可视化对象 | M-FE-01 |
| **M-FE-03** | Connection Manager | 前端·画布层 | 连线创建、路径计算、路由更新 | M-FE-01 |
| **M-FE-04** | Interaction Handler | 前端·画布层 | 鼠标/键盘事件 → 操作命令 | M-FE-01 |
| **M-FE-05** | Toolbox Panel | 前端·UI层 | 建模元素拖拽源、分类展示 | M-FE-01 |
| **M-FE-06** | Properties Panel | 前端·UI层 | 选中元素属性编辑表单 | M-FE-01 |
| **M-FE-07** | Model Tree Panel | 前端·UI层 | 语义模型层级树导航 | — |
| **M-FE-08** | State Store | 前端·状态层 | 全局状态管理（语义+画布+UI状态） | — |
| **M-FE-09** | API Client | 前端·通信层 | HTTP 请求封装、错误处理 | — |
| **M-FE-10** | Undo/Redo Engine | 前端·状态层 | Command 栈、撤销/重做 | M-FE-08 |
| **M-BE-01** | SysML v2 Parser | 后端·服务层 | `.sysml2` 文本 ←→ AST ←→ 内部模型 | — |
| **M-BE-02** | Model Manager | 后端·服务层 | 模型 CRUD、语义查询 | M-BE-01 |
| **M-BE-03** | Model Validator | 后端·服务层 | 模型完整性/一致性检查 | M-BE-01 |
| **M-BE-04** | File Service | 后端·服务层 | 项目文件读写、自动保存 | M-BE-01 |
| **M-BE-05** | Export Service | 后端·服务层 | SVG/PNG 导出 | — |
| **M-BE-06** | API Layer | 后端·接口层 | REST API 路由、请求校验 | M-BE-02..05 |

---

## 3. 前端模块设计

### 3.1 Canvas Engine（画布引擎）

#### 3.1.1 职责

封装 Fabric.js 画布实例的创建、销毁、视口控制和渲染调度。作为画布层的唯一入口，所有图形操作必须通过本模块。

#### 3.1.2 对外接口

```typescript
// canvas/canvas-engine.ts

interface ICanvasEngine {
  // ---- 生命周期 ----
  initialize(container: HTMLDivElement, config: CanvasConfig): void;
  destroy(): void;
  
  // ---- 视口控制 ----
  zoom(factor: number, center?: Point): void;
  zoomToFit(): void;
  pan(delta: Point): void;
  getViewport(): ViewportState;
  setViewport(state: ViewportState): void;
  
  // ---- 对象操作 ----
  addObject(obj: FabricObject): void;
  removeObject(obj: FabricObject): void;
  getObjectById(id: string): FabricObject | null;
  getSelectedObjects(): FabricObject[];
  
  // ---- 批量操作 ----
  loadFromJSON(canvasJSON: CanvasJSON): Promise<void>;
  toJSON(): CanvasJSON;
  
  // ---- 画布配置 ----
  setGridVisible(visible: boolean): void;
  setSnapToGrid(enabled: boolean): void;
  setBackground(color: string): void;
  
  // ---- 事件 ----
  on(event: CanvasEvent, handler: CanvasEventHandler): void;
  off(event: CanvasEvent, handler: CanvasEventHandler): void;
}

interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor: string;
  gridSize: number;
  snapToGrid: boolean;
  zoomMin: number;      // 最小缩放比例
  zoomMax: number;      // 最大缩放比例
}

interface ViewportState {
  zoom: number;         // 当前缩放倍数
  panX: number;         // 水平平移量
  panY: number;         // 垂直平移量
}

type CanvasEvent = 
  | 'object:selected' | 'object:deselected'
  | 'object:moving' | 'object:modified'
  | 'mouse:down' | 'mouse:move' | 'mouse:up'
  | 'canvas:drop'      // 从工具箱拖入新元素
  | 'viewport:change'; // 视口变化
```

#### 3.1.3 实现要点

- 使用单例模式，全局只有一个 Fabric.js Canvas 实例
- 在 React `useEffect`（组件挂载）中初始化，在 cleanup 中销毁
- 画布坐标变换（视口平移/缩放）使用 Fabric.js 的 `viewportTransform`
- 渲染帧率监控：超过 100 个对象时启用对象缓存（`objectCaching: true`）

#### 3.1.4 测试要点

- 画布初始化后 container 内存在 `<canvas>` 元素
- zoom/pan 后视口状态值在合法范围内
- addObject 可以从 `getObjectById` 查询到
- loadFromJSON 能恢复画布对象及样式

---

### 3.2 Element Renderers（元素渲染器）

#### 3.2.1 职责

将 SysML 语义模型元素渲染为 Fabric.js 可视化对象。每种 SysML 图元有独立的 Renderer，负责该图元的形状、样式和端口锚点。

#### 3.2.2 类层次结构

```typescript
// canvas/elements/base-renderer.ts

abstract class BaseElementRenderer<T extends SemanticElement> {
  protected canvas: ICanvasEngine;
  
  constructor(canvas: ICanvasEngine) {
    this.canvas = canvas;
  }
  
  // 将语义元素转换为 Fabric.js 对象（抽象方法，子类实现）
  abstract render(element: T, style?: NodeStyle): FabricObject;
  
  // 更新已有 Fabric.js 对象的外观（样式或语义变更时调用）
  abstract update(fObj: FabricObject, element: T, style?: NodeStyle): void;
  
  // 获取该元素在图上的端口锚点位置（连线端点吸附用）
  abstract getPortAnchors(fObj: FabricObject): PortAnchor[];
  
  // 计算元素推荐尺寸
  abstract calculateSize(element: T): { width: number; height: number };
}

interface PortAnchor {
  id: string;
  position: 'top' | 'right' | 'bottom' | 'left' | 'center';
  point: Point;         // 相对于 Fabric.js 对象左上角的偏移
  direction: 'in' | 'out' | 'inout';  // 端口方向
}
```

#### 3.2.3 具体 Renderer 清单

```
canvas/elements/
├── base-renderer.ts          # 抽象基类
├── block-renderer.ts         # Part/Item Definition → 矩形（圆角）块
├── block-instance-renderer.ts # Part/Item Usage → 矩形块（虚线边框）
├── port-renderer.ts          # Port → 小方块/小圆圈
├── requirement-renderer.ts   # Requirement → 特殊形状（缺角矩形）
├── constraint-renderer.ts    # Constraint → 圆角矩形带参数
├── action-renderer.ts        # Action → 圆角矩形
├── state-renderer.ts         # State → 圆角矩形
├── actor-renderer.ts         # Actor → 火柴人图标
├── usecase-renderer.ts       # UseCase → 椭圆
├── package-renderer.ts       # Package → 文件夹形状/Tab 矩形
├── comment-renderer.ts       # Comment → 折角矩形
├── text-renderer.ts          # 纯文本/标签
└── renderer-registry.ts      # Renderer 注册表（Factory Pattern）
```

#### 3.2.4 Renderer Registry（工厂模式）

```typescript
// canvas/elements/renderer-registry.ts

class RendererRegistry {
  private renderers: Map<ElementType, BaseElementRenderer<any>> = new Map();
  
  register(type: ElementType, renderer: BaseElementRenderer<any>): void;
  get(type: ElementType): BaseElementRenderer<any>;
  
  // 从语义元素创建画布对象
  createCanvasObject(element: SemanticElement, position?: Point): FabricObject;
}
```

#### 3.2.5 渲染数据流

```
SemanticElement (from Store)
       │
       ▼
RendererRegistry.get(element.type)
       │
       ▼
renderer.render(element, style)
       │
       ▼
FabricObject (Fabric.js Group/Object)
       │
       ▼
canvas.addObject(fObj)
```

#### 3.2.6 测试要点

- 每种 Renderer 能生成正确尺寸的 Fabric.js 对象
- PortAnchor 坐标在元素缩放后仍正确更新
- 样式更新后 Fabric.js 对象属性变化正确
- RendererRegistry 对未知类型抛出明确异常

---

### 3.3 Connection Manager（连线管理器）

#### 3.3.1 职责

管理 SysML 图中所有连线（Connection、Binding、Flow、Satisfy、Verify 等）的创建、路径计算、路由更新和样式渲染。

#### 3.3.2 对外接口

```typescript
// canvas/connectors/connection-manager.ts

interface IConnectionManager {
  // ---- 连线生命周期 ----
  createConnection(
    sourceId: string,        // 源端口/元素 ID
    targetId: string,        // 目标端口/元素 ID
    type: RelationshipType,  // 关系类型
    style?: EdgeStyle
  ): FabricObject;
  
  removeConnection(connectionId: string): void;
  
  // ---- 路径 ----
  calculatePath(
    sourcePoint: Point, 
    targetPoint: Point, 
    obstacles: Rect[]       // 避让的障碍物（其他元素包围盒）
  ): Point[];               // 返回路径点序列
  
  updatePathsForElement(elementId: string): void;
  
  // ---- 样式 ----
  applyRelationshipStyle(connectionId: string, type: RelationshipType): void;
  
  // ---- 查询 ----
  getConnectionsForElement(elementId: string): FabricObject[];
  getConnectionById(id: string): FabricObject | null;
}

interface EdgeStyle {
  strokeColor: string;
  strokeWidth: number;
  dashPattern: number[];        // [] = 实线, [8,4] = 虚线
  startArrow: ArrowType;        // 'none' | 'filled' | 'open' | 'diamond'
  endArrow: ArrowType;
  lineType: 'straight' | 'orthogonal' | 'curved';
}

// 连线样式与关系类型的默认映射
const RELATIONSHIP_STYLE_MAP: Record<RelationshipType, EdgeStyle> = {
  'Connection':      { strokeColor: '#333333', strokeWidth: 2, dashPattern: [],   startArrow: 'none',  endArrow: 'none',  lineType: 'orthogonal' },
  'Binding':         { strokeColor: '#666666', strokeWidth: 1.5, dashPattern: [6,3], startArrow: 'none', endArrow: 'open', lineType: 'orthogonal' },
  'ObjectFlow':      { strokeColor: '#333333', strokeWidth: 2, dashPattern: [],   startArrow: 'none',  endArrow: 'open', lineType: 'orthogonal' },
  'ControlFlow':     { strokeColor: '#333333', strokeWidth: 2, dashPattern: [],   startArrow: 'none',  endArrow: 'open', lineType: 'orthogonal' },
  'Transition':      { strokeColor: '#333333', strokeWidth: 2, dashPattern: [],   startArrow: 'none',  endArrow: 'open', lineType: 'curved' },
  'Message':         { strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [], startArrow: 'none',  endArrow: 'open', lineType: 'straight' },
  'Satisfy':         { strokeColor: '#228B22', strokeWidth: 1.5, dashPattern: [8,4], startArrow: 'none', endArrow: 'filled', lineType: 'straight' },
  'Verify':          { strokeColor: '#1E90FF', strokeWidth: 1.5, dashPattern: [8,4], startArrow: 'none', endArrow: 'filled', lineType: 'straight' },
  'Subclassification': { strokeColor: '#333333', strokeWidth: 1.5, dashPattern: [], startArrow: 'none', endArrow: 'open', lineType: 'straight' },
  'Allocation':      { strokeColor: '#888888', strokeWidth: 1.5, dashPattern: [4,4], startArrow: 'none', endArrow: 'open', lineType: 'straight' },
};
```

#### 3.3.3 路径计算算法

**直角正交路由（Orthogonal Routing）**：

```
算法: A* 增强版直角路由

输入: sourcePoint, targetPoint, obstacles[]
输出: waypoints[]

步骤:
1. 从源点向四个方向（上下左右）扩展，生成候选线段
2. 每条线段遇到障碍物包围盒时折弯
3. 最小化转弯次数和总路径长度
4. 结果平滑：合并共线相邻线段
5. 用户可拖拽 waypoint 手动调整路径
```

#### 3.3.4 测试要点

- 连线端点跟随元素移动更新
- 拖动元素后所有关联连线路径重新计算
- 正交路由在障碍物密集场景不穿过元素
- 不同关系类型使用正确的默认样式

---

### 3.4 Interaction Handler（交互处理器）

#### 3.4.1 职责

将用户的鼠标、键盘和拖拽操作翻译为高层操作意图，分发给 Store 或 Canvas Engine。本模块不包含业务逻辑，只做事件转译。

#### 3.4.2 对外接口

```typescript
// canvas/interactions/interaction-handler.ts

interface IInteractionHandler {
  // ---- 模式切换 ----
  setMode(mode: InteractionMode): void;
  getMode(): InteractionMode;
  
  // ---- 注册操作意图回调 ----
  onIntent(intent: InteractionIntent, callback: IntentCallback): void;
  offIntent(intent: InteractionIntent, callback: IntentCallback): void;
}

type InteractionMode = 
  | 'select'        // 选择/移动模式（默认）
  | 'pan'           // 画布平移模式（空格+拖拽）
  | 'connect'       // 连线模式（点击端口拖到另一个端口）
  | 'create-block'  // 创建块模式（点击画布放置）
  | 'create-port'   // 创建端口模式（点击元素边缘放置）
  | 'delete';       // 删除模式（点击元素删除）

type InteractionIntent = 
  | 'canvas:click'          // 画布空白处点击
  | 'canvas:dblclick'       // 画布空白处双击
  | 'canvas:contextmenu'    // 右键菜单
  | 'element:click'         // 元素点击
  | 'element:dblclick'      // 元素双击
  | 'element:drag-start'    // 元素开始拖拽
  | 'element:drag-move'     // 元素拖拽中
  | 'element:drag-end'      // 元素拖拽结束
  | 'element:resize'        // 元素缩放
  | 'element:delete'        // 元素删除
  | 'port:connect-start'    // 从端口开始连线
  | 'port:connect-end'      // 连线到端口
  | 'connection:click'      // 连线点击
  | 'connection:add-waypoint' // 连线上添加路径点
  | 'connection:move-waypoint' // 移动路径点
  | 'selection:box'         // 框选
  | 'selection:clear'       // 取消选择
  | 'drop:from-toolbox'     // 从工具箱拖入
  | 'keyboard:undo'         // Ctrl+Z
  | 'keyboard:redo'         // Ctrl+Y / Ctrl+Shift+Z
  | 'keyboard:delete'       // Delete
  | 'keyboard:copy'         // Ctrl+C
  | 'keyboard:paste'        // Ctrl+V
  | 'keyboard:select-all';  // Ctrl+A
```

#### 3.4.3 模式切换流程

```
           Toolbox 点击 "选择"    →  mode = 'select'
           Toolbox 点击 "连线"    →  mode = 'connect'
           按住空格键              →  mode = 'pan'
           从 Toolbox 拖拽元素     →  mode = 'create-*'（临时,拖放后恢复）
           按下 Delete 键          →  删除选中对象 → mode 不变
```

#### 3.4.4 测试要点

- 不同模式下相同鼠标操作产生不同 Intent
- 拖拽后 element:drag-start → drag-move → drag-end 顺序正确
- 模式切换后上一模式的中间状态被清理
- 键盘快捷键映射正确（考虑 Mac/Win 差异）

---

### 3.5 Toolbox Panel（工具箱面板）

#### 3.5.1 职责

展示可用 SysML 建模元素的分类列表，支持拖拽到画布和点击创建。

#### 3.5.2 组件接口

```typescript
// panels/toolbox/types.ts

interface ToolboxCategory {
  id: string;
  label: string;                    // 显示名称（中文）
  icon?: React.ReactNode;
  expanded: boolean;
  items: ToolboxItem[];
}

interface ToolboxItem {
  id: string;
  elementType: ElementType;         // 对应的语义元素类型
  label: string;
  icon: React.ReactNode;
  hotkey?: string;                  // 快捷键（如 "B" 创建 Block）
  defaultStyle?: Partial<NodeStyle>;
}
```

#### 3.5.3 分类设计

```
工具箱
├── 结构 (Structure)
│   ├── 部件定义 (Part Definition)        [B]
│   ├── 部件使用 (Part Usage)             [Shift+B]
│   ├── 端口定义 (Port Definition)        [P]
│   ├── 端口使用 (Port Usage)             [Shift+P]
│   ├── 接口定义 (Interface Definition)
│   └── 包 (Package)
├── 行为 (Behavior)
│   ├── 动作 (Action)
│   ├── 状态 (State)
│   ├── 用例 (UseCase)
│   └── 参与者 (Actor)
├── 需求 (Requirement)
│   ├── 需求 (Requirement)
│   └── 利益相关方需求 (Stakeholder Requirement)
├── 参数 (Parametric)
│   └── 约束 (Constraint)
├── 关系 (Relationships)
│   ├── 连接 (Connection)
│   ├── 绑定 (Binding)
│   ├── 流 (Flow)
│   ├── 满足 (Satisfy)
│   └── 验证 (Verify)
└── 注释 (Annotation)
    └── 注释 (Comment)
```

#### 3.5.4 交互行为

- **拖拽**: 用户从 Toolbox 拖出一个 item → 光标变为 `+` 形状 → 释放到画布上 → 该位置创建元素
- **点击+画布**: 点击 Toolbox item（选中状态高亮）→ 移动鼠标到画布（光标显示放置预览）→ 点击放置
- **搜索**: 顶部搜索框实时过滤 ToolboxItem

#### 3.5.5 测试要点

- 拖拽开始后 Toolbox 状态不变（非临时隐藏）
- 拖拽到画布外区域不创建元素
- 搜索过滤正确匹配中英文
- 分类折叠/展开不影响已选中状态

---

### 3.6 Properties Panel（属性面板）

#### 3.6.1 职责

显示当前选中元素的属性，提供编辑表单。属性变更实时反映到画布和语义模型。

#### 3.6.2 组件接口

```typescript
// panels/properties/types.ts

interface PropertySection {
  id: string;
  label: string;
  fields: PropertyField[];
}

interface PropertyField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'color' | 'boolean' | 'reference';
  value: any;
  readonly: boolean;
  options?: SelectOption[];     // type='select' 时的选项
  validator?: (value: any) => string | null;  // 返回 null = 通过，返回 string = 错误消息
}

// 根据选中元素类型动态生成的属性表单
interface PropertyForm {
  elementId: string;
  elementType: ElementType;
  sections: PropertySection[];
}
```

#### 3.6.3 属性表单生成策略

```typescript
// PropertyFormFactory: 根据 ElementType 返回表单定义

class PropertyFormFactory {
  static createForm(
    element: SemanticElement, 
    canvasNode: DiagramNode
  ): PropertyForm {
    // 通用属性（所有元素共有）
    const commonSection: PropertySection = {
      id: 'common',
      label: '通用',
      fields: [
        { id: 'name',        label: '名称',     type: 'text',     value: element.name },
        { id: 'description', label: '描述',     type: 'textarea', value: element.description },
      ]
    };
    
    // 图形属性（画布层）
    const styleSection: PropertySection = {
      id: 'style',
      label: '样式',
      fields: [
        { id: 'fillColor',   label: '填充色',   type: 'color',   value: canvasNode.style.fillColor },
        { id: 'strokeColor', label: '边框色',   type: 'color',   value: canvasNode.style.strokeColor },
        { id: 'fontSize',    label: '字号',     type: 'number',  value: canvasNode.style.fontSize },
      ]
    };
    
    // 类型特有属性
    const specificSection = this.getSpecificSection(element.type, element);
    
    return {
      elementId: element.id,
      elementType: element.type,
      sections: [commonSection, styleSection, specificSection].filter(Boolean)
    };
  }
}
```

#### 3.6.4 数据流

```
选中元素变化
    │
    ▼
CanvasEngine 触发 'object:selected'
    │
    ▼
Store.selectedElementIds 更新
    │
    ▼
PropertiesPanel 订阅变化 → PropertyFormFactory.createForm(selectedElement)
    │
    ▼
渲染表单
    │
    ▼
用户编辑字段
    │
    ▼
Store 分发 updateElement / updateNodeStyle Action
    │
    ▼
语义模型 / 画布对象同步更新
```

#### 3.6.5 测试要点

- 选中不同元素类型时表单正确切换
- 编辑 name 后画布上标签文字同步更新
- 编辑颜色后画布对象样式同步更新
- 多选时显示"多个对象"提示而非空表单

---

### 3.7 Model Tree Panel（模型树面板）

#### 3.7.1 职责

以树形结构展示语义模型的完整层级，支持导航选择、拖拽重组和上下文菜单操作。

#### 3.7.2 组件接口

```typescript
// panels/tree/types.ts

interface ModelTreeNode {
  key: string;                       // = element.id
  title: string;                     // = element.name
  type: ElementType;
  icon: React.ReactNode;
  children: ModelTreeNode[];
  isLeaf: boolean;
  selectable: boolean;
  data: {
    element: SemanticElement;        // 原始语义元素引用
    hasDiagramRepresentation: boolean; // 是否在某个图中出现
  };
}

interface TreeSelectionEvent {
  selectedKeys: string[];
  node: ModelTreeNode;
  nativeEvent: MouseEvent;
}
```

#### 3.7.3 树构建算法

```
输入: SemanticModel.elements[]
输出: ModelTreeNode[]

算法:
1. 找出所有根元素（没有 ownerId 的元素 + 顶层 Package）
2. 对每个根元素，递归收集其子元素
   - 子元素判定: child.ownerId === parent.id
   - 包含关系(Containment)也视为父子
3. 按 element.type 的预定义顺序排序
4. Package 元素始终排在其内容之前
```

#### 3.7.4 交互行为

| 操作 | 行为 |
|------|------|
| 单击节点 | 选中该元素（Store.selectedElementIds 更新） |
| 双击节点 | 选中该元素 + 画布定位到该元素所在图 |
| 右键节点 | 上下文菜单（删除、重命名、新建子元素、定位到图） |
| 拖拽节点 | 将其移动到另一个 Package/元素下（修改 ownerId） |
| 搜索框输入 | 实时过滤树节点 |

#### 3.7.5 测试要点

- 树结构与语义模型一致
- 展开/折叠状态在模型更新后保持
- 拖拽改变父子关系后语义模型正确更新
- 搜索过滤后选中项仍在树上可见

---

### 3.8 State Store（状态管理）

#### 3.8.1 职责

全局状态管理中心（Zustand）。存储语义模型、画布模型、UI 状态，提供不可变更新操作。

#### 3.8.2 Store 结构

```typescript
// store/types.ts

interface AppStore {
  // ===== 语义模型 =====
  semanticModel: SemanticModel;
  
  // ===== 画布模型 =====
  canvasModel: CanvasModel;
  activeDiagramId: string | null;
  
  // ===== UI 状态 =====
  selectedElementIds: string[];
  interactionMode: InteractionMode;
  toolboxFilter: string;
  treeFilter: string;
  isDirty: boolean;                // 是否有未保存修改
  
  // ===== 操作 =====
  // 语义模型操作
  addElement(element: SemanticElement): void;
  updateElement(id: string, patch: Partial<SemanticElement>): void;
  removeElement(id: string): void;
  addRelationship(rel: Relationship): void;
  removeRelationship(id: string): void;
  moveElement(elementId: string, newOwnerId: string): void;
  
  // 画布模型操作
  addNodeToDiagram(diagramId: string, node: DiagramNode): void;
  updateNodePosition(nodeId: string, x: number, y: number): void;
  updateNodeStyle(nodeId: string, style: Partial<NodeStyle>): void;
  removeNodeFromDiagram(diagramId: string, nodeId: string): void;
  addEdgeToDiagram(diagramId: string, edge: DiagramEdge): void;
  updateEdgeWaypoints(edgeId: string, waypoints: Point[]): void;
  removeEdgeFromDiagram(diagramId: string, edgeId: string): void;
  
  // 选择操作
  selectElements(ids: string[]): void;
  clearSelection(): void;
  
  // 模式操作
  setInteractionMode(mode: InteractionMode): void;
  
  // 脏状态
  markDirty(): void;
  markClean(): void;
}
```

#### 3.8.3 Store 切片 (Slice Pattern)

```typescript
// store/index.ts — 使用 Zustand Slice 模式

import { create } from 'zustand';

const useStore = create<AppStore>()((...a) => ({
  ...createSemanticSlice(...a),
  ...createCanvasSlice(...a),
  ...createUISlice(...a),
}));

// store/slices/semantic-slice.ts
const createSemanticSlice: StateCreator<AppStore, [], [], SemanticSlice> = (set, get) => ({
  semanticModel: { id: '', name: '', elements: [], relationships: [], packages: [] },
  
  addElement: (element) => set((state) => ({
    semanticModel: {
      ...state.semanticModel,
      elements: [...state.semanticModel.elements, element]
    },
    isDirty: true,
  })),
  
  updateElement: (id, patch) => set((state) => ({
    semanticModel: {
      ...state.semanticModel,
      elements: state.semanticModel.elements.map((e) =>
        e.id === id ? { ...e, ...patch } : e
      )
    },
    isDirty: true,
  })),
  
  // ... 其余操作
});
```

#### 3.8.4 测试要点

- addElement 后 semanticModel.elements 长度 +1
- updateElement 只修改目标元素，其他元素不变（引用相等）
- 每次变更后 isDirty 自动设为 true
- 删除元素时同时删除其所有关联关系

---

### 3.9 API Client（后端通信层）

#### 3.9.1 职责

封装所有后端 HTTP 调用，提供类型安全的请求/响应接口，统一错误处理。

#### 3.9.2 接口定义

```typescript
// api/client.ts

interface IApiClient {
  // ---- 模型操作 ----
  parseSysML2(text: string): Promise<SemanticModel>;
  serializeToSysML2(model: SemanticModel): Promise<string>;
  
  // ---- 文件操作 ----
  openProject(filePath: string): Promise<ProjectData>;
  saveProject(filePath: string, data: ProjectData): Promise<void>;
  createProject(filePath: string, name: string): Promise<void>;
  
  // ---- 校验 ----
  validateModel(model: SemanticModel): Promise<ValidationResult>;
  
  // ---- 导出 ----
  exportToSVG(svgContent: string, filePath: string): Promise<void>;
  exportToPNG(imageData: Blob, filePath: string): Promise<void>;
}

interface ProjectData {
  semanticModel: SemanticModel;
  canvasModel: CanvasModel;
  metadata: ProjectMetadata;
}

interface ProjectMetadata {
  name: string;
  created: string;         // ISO 8601
  modified: string;
  version: string;         // 项目格式版本号
}
```

#### 3.9.3 错误处理

```typescript
// api/errors.ts

class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

// 统一错误映射
const errorHandler = (error: any): ApiError => {
  if (error instanceof ApiError) return error;
  if (error.response) {
    return new ApiError(
      error.response.status,
      error.response.data?.code || 'UNKNOWN',
      error.response.data?.message || '未知服务端错误',
      error.response.data
    );
  }
  return new ApiError(0, 'NETWORK_ERROR', '网络连接失败');
};
```

#### 3.9.4 测试要点

- 服务端返回 200 → 正确解析 JSON
- 服务端返回 4xx/5xx → 抛出 ApiError 含 code 和 message
- 网络断开 → 抛出 'NETWORK_ERROR'
- 请求超时 → 可配置超时时间，抛出超时错误

---

### 3.10 Undo/Redo Engine（撤销重做引擎）

#### 3.10.1 职责

实现完整的操作历史栈，支持撤销（Undo）、重做（Redo）和操作合并（如连续拖拽）。

#### 3.10.2 设计

```typescript
// engine/undo-redo.ts

interface IUndoRedoEngine {
  execute(command: ICommand): void;    // 执行命令并推入栈
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  getHistory(): HistoryEntry[];
}

interface ICommand {
  type: string;                       // 命令类型标识
  timestamp: number;
  
  execute(): void;                    // 执行操作
  undo(): void;                       // 撤销操作
  canMergeWith(other: ICommand): boolean;  // 是否可合并（连续拖拽等）
  merge(other: ICommand): ICommand;   // 合并两个命令
}

interface HistoryEntry {
  commandType: string;
  timestamp: number;
  description: string;               // 人类可读的描述（"移动 Block1"）
}
```

#### 3.10.3 典型 Command 实现

```typescript
// 示例：移动元素命令

class MoveElementsCommand implements ICommand {
  type = 'move-elements';
  timestamp: number;
  
  constructor(
    private store: AppStore,
    private moves: Array<{ nodeId: string; from: Point; to: Point }>,
  ) {
    this.timestamp = Date.now();
  }
  
  execute(): void {
    this.moves.forEach(m => {
      this.store.updateNodePosition(m.nodeId, m.to.x, m.to.y);
    });
  }
  
  undo(): void {
    this.moves.forEach(m => {
      this.store.updateNodePosition(m.nodeId, m.from.x, m.from.y);
    });
  }
  
  canMergeWith(other: ICommand): boolean {
    // 200ms 内的同类型连续拖拽合并
    return other instanceof MoveElementsCommand
      && (other.timestamp - this.timestamp) < 200;
  }
  
  merge(other: ICommand): ICommand {
    const otherMove = other as MoveElementsCommand;
    return new MoveElementsCommand(this.store, [
      ...this.moves.filter(m => !otherMove.moves.find(om => om.nodeId === m.nodeId)),
      ...otherMove.moves,
    ]);
  }
}
```

#### 3.10.4 测试要点

- execute 后 canUndo() 返回 true
- undo 后状态恢复到执行前
- redo 后状态恢复到执行后
- 合并逻辑：200ms 内两个 move 合并为一个 command
- undo 后执行新 command → redo 栈被清空

---

## 4. 后端模块设计

### 4.1 SysML v2 Parser（文本解析器）

#### 4.1.1 职责

实现 SysML v2 标准文本语法（2024 正式版）的完整解析，支持 **文本 → AST → 内部语义模型** 的反序列化 和 **内部语义模型 → 文本** 的序列化。

#### 4.1.2 架构层次

```
┌─────────────────────────────────────┐
│  .sysml2 文本字符串                   │
└──────────────┬──────────────────────┘
               │
      ┌────────▼────────┐
      │  Lark Parser     │  ← 基于 SysML v2 官方 EBNF 转换的 Lark 语法
      │  (词法+语法分析)  │
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │  Parse Tree      │  ← Lark 原始解析树 (lark.Tree)
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │  AST Builder     │  ← 语义化 AST：过滤无关 token，构建层级
      │  (Tree → AST)    │
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │  Model Builder   │  ← AST → SemanticModel (内部模型对象)
      │  (AST → Model)   │
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │  SemanticModel   │  ← 标准化的内部表示（JSON）
      └─────────────────┘
               │
               │ (反向: 序列化)
               ▼
      ┌─────────────────┐
      │  Text Generator  │  ← SemanticModel → 格式化 .sysml2 文本
      └─────────────────┘
```

#### 4.1.3 模块结构

```
backend/app/services/parser/
├── __init__.py
├── grammar/                      # Lark 语法定义
│   ├── sysml2.lark              # 完整的 SysML v2 语法（主文件）
│   ├── kernel.lark              # Kernel 核心语法
│   ├── declarations.lark        # 声明语法
│   ├── expressions.lark         # 表达式语法
│   └── common.lark              # 词法规则（关键字、标识符、注释等）
├── parser.py                    # Lark Parser 封装
├── ast_builder.py               # Parse Tree → AST 转换器
├── ast_nodes.py                 # AST 节点类定义
├── model_builder.py             # AST → SemanticModel 转换器
├── text_generator.py            # SemanticModel → .sysml2 文本生成器
└── errors.py                    # 解析错误类型定义
```

#### 4.1.4 核心类接口

```python
# parser/parser.py

class SysML2Parser:
    """SysML v2 文本解析器封装"""
    
    def __init__(self, grammar_path: str | None = None):
        """
        初始化 Lark parser。
        若 grammar_path 为 None，使用内置 sysml2.lark。
        """
        ...
    
    def parse(self, text: str) -> lark.Tree:
        """
        解析文本，返回 Lark ParseTree。
        
        Raises:
            SysML2SyntaxError: 语法错误时抛出，含行号、列号、错误上下文
        """
        ...
    
    def parse_to_model(self, text: str) -> SemanticModel:
        """
        一步到位: 文本 → SemanticModel。
        内部调用 parse() → ASTBuilder → ModelBuilder。
        """
        ...


class ASTBuilder:
    """Parse Tree → AST 转换器"""
    
    def build(self, tree: lark.Tree) -> ASTNode:
        """
        将 Lark ParseTree 转换为类型化 AST。
        
        - 去除无关标记（literal terminals）
        - 将语义上重要的子树映射为 ASTNode 子类
        - 保留源位置信息（行号、列号）
        """
        ...


class ModelBuilder:
    """AST → SemanticModel 转换器"""
    
    def build(self, ast: ASTNode) -> SemanticModel:
        """
        遍历 AST 构建内部语义模型。
        
        处理:
        - 命名空间解析（qualified name）
        - 隐式声明收集
        - 交叉引用建立（usage → definition）
        """
        ...


class TextGenerator:
    """SemanticModel → .sysml2 文本生成器"""
    
    def generate(self, model: SemanticModel, format: bool = True) -> str:
        """
        将语义模型序列化为 SysML v2 标准文本。
        
        Args:
            model: 内部语义模型
            format: 是否格式化输出（缩进、换行）
        
        Returns:
            合法的 .sysml2 格式字符串
        """
        ...
```

#### 4.1.5 AST 节点类

```python
# parser/ast_nodes.py

from dataclasses import dataclass, field
from typing import Optional

@dataclass
class SourceLocation:
    line: int
    column: int
    end_line: int
    end_column: int

class ASTNode:
    """AST 基类"""
    location: Optional[SourceLocation] = None

@dataclass
class PackageDecl(ASTNode):
    name: str
    members: list[ASTNode] = field(default_factory=list)

@dataclass
class PartDef(ASTNode):
    name: str
    short_name: Optional[str] = None
    supertypes: list[str] = field(default_factory=list)  # 继承/子分类
    features: list[ASTNode] = field(default_factory=list)  # 属性、端口等
    body: list[ASTNode] = field(default_factory=list)       # 内部结构

@dataclass
class PartUsage(ASTNode):
    name: str
    definition_ref: str              # 引用哪个 PartDef
    features: list[ASTNode] = field(default_factory=list)

@dataclass
class PortDef(ASTNode):
    name: str
    direction: str                   # 'in' | 'out' | 'inout'
    type_ref: Optional[str] = None   # 端口类型引用

@dataclass
class RequirementDef(ASTNode):
    name: str
    id: Optional[str] = None         # 需求 ID
    text: str                        # 需求正文
    attributes: dict[str, str] = field(default_factory=dict)

@dataclass
class ConnectionDef(ASTNode):
    name: Optional[str]
    source: str                      # 源端引用 (a.b.c 形式)
    target: str                      # 目标端引用
    connection_type: str             # 'connection' | 'binding' | 'flow' 等

@dataclass
class AttributeDef(ASTNode):
    name: str
    type_ref: Optional[str] = None
    default_value: Optional[str] = None

@dataclass
class ConstraintDef(ASTNode):
    name: str
    parameters: list[str]            # 约束参数名列表
    expression: str                  # 约束表达式文本
```

#### 4.1.6 语法覆盖策略

由于 SysML v2 完整语法庞大，**不要求第一周就实现 100% 语法**。遵循以下策略：

1. **先建骨架**：先创建完整的 `sysml2.lark`（包含所有语法规则），但大部分规则体先留空
2. **按需激活**：V1 开发过程中需要哪种语句类型，就激活对应的语法规则
3. **渐进测试**：每激活一条规则，补充对应的单元测试用例
4. **错误恢复**：解析器遇到未实现的语法规则时不崩溃，返回 "Unsupported: ..." 警告

#### 4.1.7 测试要点

```python
# tests/services/parser/test_parser.py

class TestSysML2Parser:
    
    def test_parse_part_definition(self):
        """解析: part def Vehicle { ... }"""
        text = '''
        part def Vehicle {
            attribute mass: Real;
            port pwr: Port;
        }
        '''
        model = parser.parse_to_model(text)
        assert len(model.elements) >= 1
        vehicle = next(e for e in model.elements if e.name == 'Vehicle')
        assert vehicle.type == 'PartDefinition'
    
    def test_parse_requirement(self):
        """解析: requirement 'REQ-001' { ... }"""
        ...
    
    def test_parse_connection(self):
        """解析: connect a::p1 to b::p2;"""
        ...
    
    def test_syntax_error_location(self):
        """语法错误时给出正确的行号和列号"""
        with pytest.raises(SysML2SyntaxError) as exc:
            parser.parse('part def { invalid }')
        assert exc.value.line is not None
    
    def test_roundtrip(self):
        """解析再序列化后语义等价"""
        text = 'part def Engine { attribute power: Real; }'
        model = parser.parse_to_model(text)
        regenerated = generator.generate(model)
        model2 = parser.parse_to_model(regenerated)
        assert model == model2  # 需实现 __eq__
```

---

### 4.2 Model Manager（模型管理器）

#### 4.2.1 职责

管理语义模型的 CRUD 操作、元素查询、命名空间解析和交叉引用维护。

#### 4.2.2 核心类接口

```python
# services/model_manager.py

class ModelManager:
    """语义模型管理器"""
    
    def __init__(self):
        self.model: SemanticModel | None = None
    
    # ---- 生命周期 ----
    def create_model(self, name: str) -> SemanticModel:
        """创建新的空模型"""
        ...
    
    def load_from_text(self, text: str) -> SemanticModel:
        """从 .sysml2 文本加载模型"""
        ...
    
    def export_to_text(self) -> str:
        """导出为 .sysml2 文本"""
        ...
    
    # ---- 查询 ----
    def get_element(self, element_id: str) -> ModelElement:
        """按 ID 获取元素"""
        ...
    
    def get_element_by_qualified_name(self, qname: str) -> ModelElement | None:
        """按限定名查找元素"""
        ...
    
    def get_children(self, element_id: str) -> list[ModelElement]:
        """获取元素的直接子元素"""
        ...
    
    def get_relationships(self, element_id: str) -> list[Relationship]:
        """获取与元素相关的所有关系"""
        ...
    
    def find_usages(self, definition_id: str) -> list[ModelElement]:
        """查找某 Definition 的所有 Usage"""
        ...
    
    def resolve_reference(self, ref_text: str, context_element_id: str) -> ModelElement | None:
        """解析引用文本（如 'a::b::c'）→ 实际元素"""
        ...
    
    # ---- 修改 ----
    def add_element(self, element: ModelElement, owner_id: str | None = None) -> ModelElement:
        """
        添加元素。
        - 自动分配 ID（若未提供）
        - 若 owner_id 不为空，设置 ownerId
        - 检测命名冲突
        """
        ...
    
    def update_element(self, element_id: str, patch: dict) -> ModelElement:
        """更新元素属性"""
        ...
    
    def delete_element(self, element_id: str) -> None:
        """
        删除元素。
        - 级联删除所有子元素
        - 删除所有关联关系
        - 清除所有 usage 引用
        """
        ...
    
    def add_relationship(self, rel: Relationship) -> Relationship:
        """添加关系"""
        ...
    
    def delete_relationship(self, rel_id: str) -> None:
        """删除关系"""
        ...
    
    def move_element(self, element_id: str, new_owner_id: str) -> None:
        """移动元素到新的所有者下"""
        ...
    
    # ---- 校验 ----
    def check_name_conflict(self, name: str, parent_id: str) -> bool:
        """检查命名冲突"""
        ...
    
    def get_dangling_references(self) -> list[str]:
        """获取所有悬空引用"""
        ...
```

#### 4.2.3 测试要点

- 添加子元素后 get_children 包含该元素
- 删除父元素后子元素一并删除
- 命名冲突检测正确（同父下不可重名）
- 移动元素后 resolve_reference 结果更新
- 删除被引用的 Definition 后 find_usages 反映悬空

---

### 4.3 Model Validator（模型校验器）

#### 4.3.1 职责

对语义模型执行完整性检查和一致性检查，返回警告和错误列表。

#### 4.3.2 核心类接口

```python
# services/validator.py

class ModelValidator:
    """模型校验器"""
    
    def __init__(self, model_manager: ModelManager):
        self.mm = model_manager
    
    def validate(self) -> ValidationResult:
        """执行所有校验规则"""
        ...
    
    def validate_element(self, element_id: str) -> ValidationResult:
        """对单个元素执行校验"""
        ...


@dataclass
class ValidationResult:
    is_valid: bool                                     # 整体是否通过
    errors: list[ValidationIssue] = field(default_factory=list)    # 阻塞性错误
    warnings: list[ValidationIssue] = field(default_factory=list)  # 警告

@dataclass
class ValidationIssue:
    code: str             # 错误码 (如 'E001', 'W002')
    message: str          # 人类可读消息
    element_id: str | None
    severity: str         # 'error' | 'warning'
    source_location: str | None  # 源文本中的位置引用
```

#### 4.3.3 V1 校验规则清单

```python
# services/validation_rules.py

# E = Error (阻塞), W = Warning (非阻塞)

VALIDATION_RULES = [
    # 完整性检查
    ('E001', '元素名称为空',        lambda e: not e.name),
    ('E002', '限定名重复',          lambda m: _find_duplicate_qnames(m)),
    ('E003', '悬空引用—Usage 引用不存在的 Definition', lambda m: _find_dangling_usages(m)),
    ('E004', '关系源端元素不存在',    lambda r: not _element_exists(r.sourceId)),
    ('E005', '关系目标端元素不存在',  lambda r: not _element_exists(r.targetId)),
    
    # 一致性检查
    ('W001', '元素无描述信息',  lambda e: not e.description and e.type != 'Comment'),
    ('W002', 'PartDef 无端口定义',  lambda e: e.type == 'PartDefinition' and not _has_ports(e)),
    ('W003', '孤岛元素—无任何关系连接',  lambda e: not _has_relationships(e)),
    ('W004', '缺少需求追溯—设计元素未关联需求', lambda e: e.type in DESIGN_TYPES and not _has_requirement_links(e)),
]
```

#### 4.3.4 测试要点

- 空名称检出 E001
- 重复 qname 检出 E002
- 悬空引用检出 E003/E004/E005
- 规范性警告不影响 is_valid 判定

---

### 4.4 File Service（文件服务）

#### 4.4.1 职责

管理项目文件的创建、打开、保存和自动保存。

#### 4.4.2 核心类接口

```python
# services/file_service.py

class FileService:
    """项目文件管理服务"""
    
    # ---- 文件格式 ----
    # 项目文件采用 JSON 格式 (.sysml2proj)
    # 内部结构:
    # {
    #   "formatVersion": "1.0",
    #   "metadata": { "name": "...", "created": "...", "modified": "..." },
    #   "semanticModel": { ... },   // SemanticModel 的 JSON 序列化
    #   "canvasModel": { ... }      // CanvasModel 的 JSON 序列化
    # }
    # 同时导出 .sysml2 纯文本文件（作为模型交换格式）
    
    def create_project(self, dir_path: str, name: str) -> ProjectData:
        """
        创建新项目。
        - 在 dir_path 下创建 <name>/ 目录
        - 创建 <name>.sysml2proj（项目 JSON 文件）
        - 创建 model.sysml2（初始空模型文本文件）
        """
        ...
    
    def open_project(self, file_path: str) -> ProjectData:
        """打开项目文件"""
        ...
    
    def save_project(self, file_path: str, data: ProjectData) -> None:
        """
        保存项目。
        1. 备份当前文件 → <name>.sysml2proj.bak
        2. 写入新文件
        3. 删除备份（写入成功后）
        """
        ...
    
    def auto_save(self, data: ProjectData) -> None:
        """
        自动保存（每隔 5 分钟或编辑暂停 3 秒时触发）。
        使用临时文件写入 → 原子 rename 策略。
        """
        ...
    
    def export_sysml2_text(self, dir_path: str, model: SemanticModel) -> str:
        """导出独立的 .sysml2 文本文件"""
        ...
```

#### 4.4.3 文件布局

```
my-project/
├── my-project.sysml2proj    # 主项目文件（JSON，包含语义模型+画布模型）
├── model.sysml2              # SysML v2 标准文本（自动同步，用于 Git diff）
├── auto-save/                # 自动保存临时文件
│   └── <timestamp>.tmp
└── exports/                  # 导出文件
    └── ...
```

#### 4.4.4 测试要点

- save 后 open 得到完全一致的数据
- save 失败（磁盘满）时原始文件未被损坏
- auto_save 不阻塞用户操作
- 创建名称含非法字符的项目时给出明确错误

---

### 4.5 Export Service（导出服务）

#### 4.5.1 职责

将画布内容导出为 SVG 和 PNG 格式。

#### 4.5.2 核心类接口

```python
# services/export_service.py

class ExportService:
    """图表导出服务"""
    
    def export_svg(self, svg_markup: str, output_path: str) -> None:
        """
        将前端生成的 SVG 字符串写入文件。
        
        SVG 由前端 Fabric.js 生成（canvas.toSVG()），
        后端仅负责文件写入和可能的 SVG 优化（压缩、嵌入字体等）。
        """
        ...
    
    def export_png(self, image_data: bytes, output_path: str) -> None:
        """
        将前端生成的 PNG 数据写入文件。
        
        前端通过 canvas.toDataURL() 生成 PNG 的 Base64，
        后端解码并写入文件。
        """
        ...
    
    def export_multiple(self, exports: list[ExportTask]) -> list[ExportTaskResult]:
        """批量导出多个图表"""
        ...


@dataclass
class ExportTask:
    diagram_id: str
    format: str         # 'svg' | 'png'
    output_path: str
    width: int | None   # None = 原始尺寸
    height: int | None

@dataclass
class ExportTaskResult:
    task: ExportTask
    success: bool
    error_message: str | None = None
    file_size: int = 0
```

#### 4.5.3 测试要点

- SVG 文件可被浏览器正确渲染
- PNG 分辨率与请求尺寸一致
- 导出路径不存在时自动创建目录
- 批量导出中单个失败不影响其他

---

### 4.6 API Layer（接口层）

#### 4.6.1 职责

定义 FastAPI 路由，请求参数校验，响应格式化。Controller 层，不含业务逻辑。

#### 4.6.2 API 路由定义

```python
# api/routes.py

from fastapi import APIRouter, UploadFile, File

router = APIRouter(prefix="/api/v1")

# ===== 模型解析 =====

@router.post("/model/parse")
async def parse_model(request: ParseRequest) -> ParseResponse:
    """
    解析 .sysml2 文本，返回内部模型 JSON。
    
    POST /api/v1/model/parse
    Body: { "text": "part def Vehicle { ... }" }
    Response: { "model": { ... } }
    """
    ...

# ===== 文件操作 =====

@router.post("/project/create")
async def create_project(request: CreateProjectRequest) -> CreateProjectResponse:
    """
    POST /api/v1/project/create
    Body: { "dirPath": "C:/projects", "name": "MyModel" }
    Response: { "projectData": { ... } }
    """
    ...

@router.post("/project/open")
async def open_project(request: OpenProjectRequest) -> OpenProjectResponse:
    """
    POST /api/v1/project/open
    Body: { "filePath": "C:/projects/MyModel/MyModel.sysml2proj" }
    Response: { "projectData": { ... } }
    """
    ...

@router.post("/project/save")
async def save_project(request: SaveProjectRequest) -> SaveProjectResponse:
    """
    POST /api/v1/project/save
    Body: { "filePath": "...", "projectData": { ... } }
    Response: { "success": true }
    """
    ...

# ===== 模型操作 =====

@router.post("/model/validate")
async def validate_model(request: ValidateRequest) -> ValidateResponse:
    """
    POST /api/v1/model/validate
    Body: { "model": { ... } }
    Response: ValidationResult
    """
    ...

# ===== 导出 =====

@router.post("/export/svg")
async def export_svg(request: ExportSVGRequest) -> ExportResponse:
    """
    POST /api/v1/export/svg
    Body: { "svgMarkup": "...", "outputPath": "..." }
    Response: { "success": true }
    """
    ...

@router.post("/export/png")
async def export_png(request: ExportPNGRequest) -> ExportResponse:
    """
    POST /api/v1/export/png
    Body: { "imageData": "<base64>", "outputPath": "..." }
    Response: { "success": true }
    """
    ...
```

#### 4.6.3 请求/响应模型

```python
# api/schemas.py

from pydantic import BaseModel, Field

class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1, description="SysML v2 文本内容")

class ParseResponse(BaseModel):
    model: SemanticModelDict
    warnings: list[str] = []

class CreateProjectRequest(BaseModel):
    dir_path: str = Field(..., description="项目目录路径")
    name: str = Field(..., min_length=1, max_length=128)

class OpenProjectRequest(BaseModel):
    file_path: str = Field(..., description=".sysml2proj 文件路径")

class SaveProjectRequest(BaseModel):
    file_path: str
    project_data: ProjectDataDict

class ValidateRequest(BaseModel):
    model: SemanticModelDict

class ValidateResponse(BaseModel):
    is_valid: bool
    errors: list[ValidationIssueDict]
    warnings: list[ValidationIssueDict]

class ExportSVGRequest(BaseModel):
    svg_markup: str
    output_path: str

class ExportPNGRequest(BaseModel):
    image_data: str = Field(..., description="Base64 编码的 PNG 数据")
    output_path: str
```

#### 4.6.4 测试要点

- 请求 body 不符合 Schema 时返回 422 含字段级错误
- 文件路径不存在时返回明确的错误响应
- 解析含语法错误的文本时返回 400 含错误位置

---

## 5. 数据模型定义

### 5.1 语义模型（Semantic Model）

#### 5.1.1 顶层结构

```typescript
// types/semantic-model.ts

interface SemanticModel {
  /** 模型唯一标识 (UUID v4) */
  id: string;
  
  /** 模型名称 */
  name: string;
  
  /** 所有语义元素 */
  elements: SemanticElement[];
  
  /** 所有关系 */
  relationships: Relationship[];
  
  /** 顶层包（命名空间） */
  packages: Package[];
}

interface SemanticElement {
  /** 唯一标识 (UUID v4) */
  id: string;
  
  /** 元素名称（在所属命名空间内唯一） */
  name: string;
  
  /** 限定名（如 'Vehicle::Engine::Piston'） */
  qualifiedName: string;
  
  /** 元素类型 */
  type: ElementType;
  
  /** 简短名称/别名 */
  shortName?: string;
  
  /** 所属元素/包的 ID（顶级元素为 null） */
  ownerId: string | null;
  
  /** 人类可读描述 */
  description: string;
  
  /** 类型特有属性（不同 element type 有不同字段） */
  properties: Record<string, unknown>;
}

type ElementType =
  // 结构
  | 'PartDefinition' | 'PartUsage'
  | 'ItemDefinition' | 'ItemUsage'
  | 'PortDefinition' | 'PortUsage'
  | 'InterfaceDefinition' | 'InterfaceUsage'
  | 'AttributeDefinition' | 'AttributeUsage'
  | 'EnumerationDefinition'
  
  // 行为
  | 'ActionDefinition' | 'ActionUsage'
  | 'StateDefinition' | 'StateUsage'
  | 'Transition'
  | 'Actor'
  | 'UseCase'
  
  // 需求
  | 'RequirementDefinition' | 'RequirementUsage'
  | 'StakeholderRequirement'
  
  // 参数
  | 'ConstraintDefinition' | 'ConstraintUsage'
  
  // 组织
  | 'Package'
  
  // 注释
  | 'Comment';

interface Relationship {
  /** 唯一标识 */
  id: string;
  
  /** 关系名称（可选） */
  name?: string;
  
  /** 关系类型 */
  type: RelationshipType;
  
  /** 源端元素 ID */
  sourceId: string;
  
  /** 源端端口 ID（若通过端口连接） */
  sourcePortId?: string;
  
  /** 目标端元素 ID */
  targetId: string;
  
  /** 目标端端口 ID */
  targetPortId?: string;
  
  /** 关系类型特有属性 */
  properties: Record<string, unknown>;
}

type RelationshipType =
  | 'Connection'        // 结构连接
  | 'Binding'           // 参数绑定
  | 'ObjectFlow'        // 对象流（活动图）
  | 'ControlFlow'       // 控制流（活动图）
  | 'Transition'        // 状态转换
  | 'Message'           // 序列图消息
  | 'Satisfy'           // 满足关系（需求）
  | 'Verify'            // 验证关系（需求）
  | 'Subclassification' // 分类关系（BDD 继承）
  | 'Subsetting'        // 子集关系
  | 'Redefinition'      // 重定义
  | 'Containment'       // 包含
  | 'Composition'       // 组合
  | 'Allocation';       // 分配

interface Package {
  id: string;
  name: string;
  qualifiedName: string;
  ownerId: string | null;
  elementIds: string[];   // 包内顶层元素 ID 列表
}
```

#### 5.1.2 类型特有属性（properties 字段内容）

```typescript
// PartDefinition 的 properties
interface PartDefProperties {
  isAbstract: boolean;
  superTypes: string[];        // 父类型的 qualifiedName 列表
  attributes: AttributeDef[];
  ports: PortRef[];
}

interface AttributeDef {
  name: string;
  type: string;                // 类型 qualifiedName (Real, Integer, String, 或自定义)
  multiplicity: string;        // 如 "1", "0..1", "*"
  defaultValue?: string;
}

interface PortRef {
  id: string;
  name: string;
  direction: 'in' | 'out' | 'inout';
  type: string;                // 端口类型
}

// Requirement 的 properties
interface RequirementProperties {
  requirementId: string;       // 如 "REQ-001"
  text: string;                // 需求正文
  category: 'functional' | 'non-functional' | 'performance' | 'interface' | 'constraint';
  priority: 'high' | 'medium' | 'low';
  verifiedBy: string[];        // 验证方法
}

// Constraint 的 properties
interface ConstraintProperties {
  expression: string;          // 约束表达式
  parameters: ConstraintParameter[];
}

interface ConstraintParameter {
  name: string;
  type: string;
  unit?: string;
}
```

### 5.2 画布模型（Canvas Model）

```typescript
// types/canvas-model.ts

interface CanvasModel {
  /** 关联的语义模型 ID */
  semanticModelId: string;
  
  /** 所有图 */
  diagrams: Diagram[];
}

interface Diagram {
  /** 唯一标识 */
  id: string;
  
  /** 图名称 */
  name: string;
  
  /** 图类型 */
  type: DiagramType;
  
  /** 图中所有节点 */
  nodes: DiagramNode[];
  
  /** 图中所有连线 */
  edges: DiagramEdge[];
  
  /** 视口状态 */
  viewport: ViewportState;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 最后修改时间 */
  modifiedAt: string;
}

type DiagramType =
  | 'BDD'                     // Block Definition Diagram
  | 'IBD'                     // Internal Block Diagram
  | 'ACT'                     // Activity Diagram
  | 'STM'                     // State Machine Diagram
  | 'SD'                      // Sequence Diagram
  | 'UC'                      // Use Case Diagram
  | 'REQ'                     // Requirement Diagram
  | 'PAR';                    // Parametric Diagram

interface DiagramNode {
  /** 节点唯一 ID（= canvas_node:<semanticElementId>） */
  id: string;
  
  /** 关联的语义元素 ID */
  semanticElementId: string;
  
  /** 画布坐标 */
  x: number;
  y: number;
  
  /** 节点尺寸（像素） */
  width: number;
  height: number;
  
  /** 可视样式 */
  style: NodeStyle;
  
  /** 是否折叠（显示缩略模式） */
  collapsed: boolean;
  
  /** Z 序 */
  zIndex: number;
  
  /** 自定义标签位置偏移 */
  labelOffset?: Point;
  
  /** 是否锁定（不可移动/编辑） */
  locked: boolean;
}

interface NodeStyle {
  fillColor: string;          // 填充色 (#RRGGBB)
  strokeColor: string;        // 边框色
  strokeWidth: number;        // 边框线宽
  fontSize: number;           // 字号
  fontFamily: string;
  fontColor: string;
  opacity: number;            // 不透明度 (0.0 ~ 1.0)
  borderRadius: number;       // 圆角半径
  showShadow: boolean;        // 是否显示阴影
}

interface DiagramEdge {
  /** 连线唯一 ID（= canvas_edge:<semanticRelationshipId>） */
  id: string;
  
  /** 关联的语义关系 ID */
  semanticRelationshipId: string;
  
  /** 源端节点 ID */
  sourceNodeId: string;
  
  /** 目标端节点 ID */
  targetNodeId: string;
  
  /** 路径点序列（相对于画布坐标） */
  waypoints: Point[];
  
  /** 连线样式 */
  style: EdgeStyle;
  
  /** 标签位置（null = 自动放置在线中点） */
  label?: LabelPosition;
  
  /** Z 序 */
  zIndex: number;
}

interface Point {
  x: number;
  y: number;
}

interface LabelPosition {
  offset: Point;              // 相对于连线中点的偏移
  rotation: number;           // 标签旋转角度
}
```

### 5.3 双层模型关联机制

```
┌──────────────────────┐         UUID         ┌──────────────────────┐
│   Semantic Model     │◄────────────────────►│   Canvas Model       │
│                      │                      │                      │
│  SemanticElement     │   semanticElementId  │  DiagramNode         │
│    id: "elem-001"    │◄────────────────────►│    semanticElementId │
│    name: "Engine"    │                      │      = "elem-001"   │
│    type: "PartDef"   │                      │    x: 150, y: 200   │
│                      │                      │    width: 180       │
│  Relationship        │ semanticRelationship│  DiagramEdge         │
│    id: "rel-001"     │◄────────────────────►│    sem...shipId      │
│    type: "Connection"│                      │      = "rel-001"    │
│    sourceId/portId   │                      │    waypoints: [...] │
│    targetId/portId   │                      │    style: {...}     │
└──────────────────────┘                      └──────────────────────┘

关键规则:
1. 每个 DiagramNode 必须对应一个 SemanticElement（1:1）
2. 每个 DiagramEdge 必须对应一个 Relationship（1:1）
3. 同一个 SemanticElement 可以出现在多个 Diagram 中（多视图）
4. 同一个 Relationship 可以出现在多个 Diagram 中
5. 删除 SemanticElement → 所有 Diagram 中对应的 Node 同步删除
6. 删除 Relationship → 所有 Diagram 中对应的 Edge 同步删除
7. 在画布上创建元素 → 同时创建 SemanticElement + DiagramNode
8. Canvas Model 可以独立于 Semantic Model 序列化（支持仅交换语义模型）
```

---

## 6. API 接口设计

### 6.1 接口总览

| 方法 | 路径 | 说明 | V1 |
|------|------|------|:--:|
| POST | `/api/v1/model/parse` | 解析 .sysml2 文本 → 内部模型 | ✓ |
| POST | `/api/v1/project/create` | 创建新项目 | ✓ |
| POST | `/api/v1/project/open` | 打开项目文件 | ✓ |
| POST | `/api/v1/project/save` | 保存项目 | ✓ |
| POST | `/api/v1/model/validate` | 校验模型 | ✓ |
| POST | `/api/v1/export/svg` | 导出 SVG | ✓ |
| POST | `/api/v1/export/png` | 导出 PNG | ✓ |

### 6.2 接口详细定义

#### POST /api/v1/model/parse

```
Request:
{
  "text": "part def Vehicle {\n    attribute mass: Real;\n}"
}

Response 200:
{
  "model": {
    "id": "auto-generated-uuid",
    "name": "Unnamed",
    "elements": [
      {
        "id": "elem-001",
        "name": "Vehicle",
        "type": "PartDefinition",
        "qualifiedName": "Vehicle",
        "ownerId": null,
        "description": "",
        "properties": {
          "isAbstract": false,
          "superTypes": [],
          "attributes": [
            { "name": "mass", "type": "Real", "multiplicity": "1" }
          ],
          "ports": []
        }
      }
    ],
    "relationships": [],
    "packages": []
  },
  "warnings": []
}

Response 400:
{
  "error": {
    "code": "SYNTAX_ERROR",
    "message": "语法错误: Unexpected token at line 3, column 5",
    "location": { "line": 3, "column": 5 }
  }
}
```

#### POST /api/v1/project/save

```
Request:
{
  "filePath": "C:/projects/MyModel/MyModel.sysml2proj",
  "projectData": {
    "metadata": { "name": "MyModel", "created": "2026-06-05T10:00:00Z", "modified": "2026-06-05T14:30:00Z", "version": "1.0" },
    "semanticModel": { ... },
    "canvasModel": { ... }
  }
}

Response 200:
{
  "success": true,
  "filePath": "C:/projects/MyModel/MyModel.sysml2proj",
  "fileSize": 12345
}

Response 500:
{
  "error": {
    "code": "IO_ERROR",
    "message": "无法写入文件: Permission denied"
  }
}
```

#### POST /api/v1/model/validate

```
Request:
{
  "model": { ... }
}

Response 200:
{
  "isValid": false,
  "errors": [
    {
      "code": "E003",
      "message": "悬空引用: PartUsage 'engine' 引用了不存在的 PartDefinition 'Engine_V2'",
      "elementId": "elem-005",
      "severity": "error",
      "sourceLocation": null
    }
  ],
  "warnings": [
    {
      "code": "W001",
      "message": "元素 'Pump' 缺少描述信息",
      "elementId": "elem-008",
      "severity": "warning",
      "sourceLocation": null
    }
  ]
}
```

---

## 7. 测试策略

### 7.1 测试分层

```
┌─────────────────────────────────┐
│        E2E Tests (Playwright)    │  ← 少量，覆盖核心用户场景
│        前端+后端集成测试          │
├─────────────────────────────────┤
│    Integration Tests             │  ← 模块间接口测试
│    API 集成测试 (pytest + httpx) │
├────────────────┬────────────────┤
│  Frontend UT   │  Backend UT    │  ← 大量单元测试
│  (Vitest)      │  (pytest)      │
│                │                │
│  - Components  │  - Parser      │
│  - Store       │  - Validator   │
│  - Engine      │  - Services    │
│  - Renderers   │                │
└────────────────┴────────────────┘
```

### 7.2 前端测试 (Vitest)

| 模块 | 测试类型 | 测试内容 | 目标覆盖率 |
|------|----------|----------|:----------:|
| Canvas Engine | 单元 | 初始化、视口操作、对象增删、序列化 | ≥ 80% |
| Element Renderers | 单元 + 快照 | 每种 Renderer 的渲染输出 | ≥ 90% |
| Connection Manager | 单元 | 路径计算、样式映射、动态更新 | ≥ 80% |
| Interaction Handler | 单元 | 模式切换、事件翻译 | ≥ 80% |
| State Store | 单元 | 每个 Slice 的 action 和状态变更 | ≥ 95% |
| Undo/Redo Engine | 单元 | Command 执行/撤销/合并 | ≥ 95% |
| UI Panels | 组件 | 渲染、交互、状态联动 | ≥ 70% |

### 7.3 后端测试 (pytest)

| 模块 | 测试类型 | 测试内容 | 目标覆盖率 |
|------|----------|----------|:----------:|
| SysML v2 Parser | 单元 + 回归 | 每种语法结构解析、错误定位、往返测试 | ≥ 90% |
| Model Manager | 单元 | CRUD、查询、引用解析、级联删除 | ≥ 90% |
| Model Validator | 单元 | 每条校验规则独立测试 + 组合场景 | ≥ 95% |
| File Service | 单元 | 读写、备份恢复、自动保存 | ≥ 80% |
| Export Service | 单元 | SVG/PNG 导出 | ≥ 70% |
| API Layer | 集成 | 每个 endpoint 的成功/错误路径 | ≥ 85% |

### 7.4 E2E 核心场景 (Playwright)

```
1. 启动应用 → 创建新项目 → 创建 PartDef → 添加属性 → 保存 → 关闭 → 重新打开 → 模型一致
2. 从工具箱拖拽 Block 到画布 → 调整位置和大小 → 更改颜色 → 撤销 → 重做
3. 创建两个 Block → 创建 Connection → 拖动 Block → 连线路径更新
4. 导入 .sysml2 文件 → 模型树正确显示 → 图形视图正确渲染
```

### 7.5 测试独立性

- 每个模块的单元测试可独立运行，不依赖其他模块的测试通过
- 后端测试使用临时文件/fixture，不依赖特定文件系统状态
- 前端组件测试使用 mock Store，不依赖后端运行
- 集成测试在 CI 中按模块分组，失败模块不影响其他组的执行

---

## 8. 附录

### 8.1 关键设计决策记录

| 决策编号 | 决策 | 理由 | 日期 |
|----------|------|------|------|
| D-001 | 前端框架选 React 18+ | 图形编辑器生态最成熟 | 2026-06-05 |
| D-002 | 图形引擎选 Fabric.js | 对象模型适合编辑器、内置序列化 | 2026-06-05 |
| D-003 | 双层模型架构 | 语义与图形分离，支持多视图、独立演化 | 2026-06-05 |
| D-004 | 直接实现完整 SysML v2 语法解析 | 避免后期重构，基于官方 EBNF | 2026-06-05 |
| D-005 | 状态管理选 Zustand | 轻量、无模板代码、支持 Slice 模式 | 2026-06-05 |
| D-006 | UI 组件库选 Ant Design 5 | 树、表单、面板组件丰富 | 2026-06-05 |
| D-007 | 语法解析选 Lark | Python 原生、EBNF 定义、轻量 | 2026-06-05 |

### 8.2 参考资源

- OMG SysML v2 Specification (2024): https://www.omg.org/spec/SysML/
- SysML v2 Textual Notation EBNF Grammar
- Fabric.js Documentation: http://fabricjs.com/docs/
- Lark Parser Documentation: https://lark-parser.readthedocs.io/
- Zustand Documentation: https://docs.pmnd.rs/zustand/
- SysON (开源 SysML v2 建模工具参考): https://github.com/eclipse-syson/syson

### 8.3 术语对照

| 缩写 | 英文 | 中文 |
|------|------|------|
| AST | Abstract Syntax Tree | 抽象语法树 |
| BDD | Block Definition Diagram | 块定义图 |
| EBNF | Extended Backus-Naur Form | 扩展巴科斯范式 |
| IBD | Internal Block Diagram | 内部块图 |
| MBSE | Model-Based Systems Engineering | 基于模型的系统工程 |
| OT | Operational Transformation | 操作转换算法 |
| SLA | Service Level Agreement | 服务等级协议 |
| UUID | Universally Unique Identifier | 通用唯一标识符 |

---

> **文档状态**: 待评审
> **下一步**: 基于本详细设计进行 V1 开发任务拆分（创建 GitHub Issues / 开发计划表）
