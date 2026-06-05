# SysML v2 Modeler

基于 Web 的 SysML v2 图形化建模工具，支持双层模型架构（语义模型 + 画布模型）。

## 测试状态

| 层 | 测试框架 | 测试数 | 状态 |
|------|----------|:------:|:----:|
| 前端 | Vitest | 547 | ✅ All Pass |
| 后端 | pytest | 453 | ✅ All Pass |
| **合计** | | **1000** | ✅ |

## 环境要求

| 软件 | 版本 |
|------|------|
| Node.js | >= 18 LTS |
| npm | >= 9.x |
| Anaconda / Miniconda | latest stable |
| Python (via conda) | >= 3.10 |

## 快速启动

### 1. 环境准备

```bash
# 创建 Python 虚拟环境
conda create -n sysml2 python=3.10 -y
conda activate sysml2
```

### 2. 后端启动

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

后端启动后访问:
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/api/v1/health

### 3. 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端启动后访问: http://localhost:5173

### 4. 运行测试

```bash
# 后端测试
cd backend && pytest tests/ -v

# 前端测试
cd frontend && npx vitest run
```

## 项目结构

```
sysml2/
├── frontend/                  # React + TypeScript 前端
│   ├── src/
│   │   ├── api/               # 后端通信层 (API Client)
│   │   ├── canvas/            # Fabric.js 画布引擎 + 元素渲染器 + 连线管理 + 交互处理
│   │   ├── components/        # 通用 UI 组件
│   │   ├── engine/            # Undo/Redo 引擎
│   │   ├── panels/            # UI 面板 (Toolbox, Properties, Model Tree)
│   │   ├── store/             # Zustand 状态管理 (语义 + 画布 + UI)
│   │   └── types/             # TypeScript 类型定义 (语义模型 + 画布模型)
│   └── ...
├── backend/                   # FastAPI 后端
│   └── app/
│       ├── api/               # REST API 路由 (8 endpoints)
│       ├── models/            # Pydantic 请求/响应模型
│       └── services/          # 服务层
│           ├── parser/        # SysML v2 文本解析器 (Lark)
│           ├── validator/     # 模型校验器 (9 条规则)
│           ├── file_service   # 文件服务 (原子保存/自动保存/崩溃恢复)
│           └── export_service # 导出服务 (SVG/PNG)
├── doc/                       # 项目文档
│   ├── proposal.md           # 需求文档
│   ├── detailed-design.md    # 详细设计文档
│   ├── prompt.md             # Vibe Coding Prompt
│   └── tasks/                # 任务分解 (17 个模块)
├── .gitignore
└── README.md
```

## 技术栈

| 层次 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | >= 18.x |
| 类型语言 | TypeScript | >= 5.x |
| 图形引擎 | Fabric.js | >= 6.x |
| 状态管理 | Zustand | >= 4.x |
| UI 组件 | Ant Design | >= 5.x |
| 构建工具 | Vite | >= 5.x |
| 后端框架 | FastAPI | >= 0.110 |
| 语法解析 | Lark | >= 1.x |

## 已实现功能 (V1 MVP)

- **结构建模**: PartDef/PartUsage, PortDef, Interface, Package (BDD + IBD)
- **行为建模**: Action, State, Actor, UseCase
- **需求建模**: Requirement + Satisfy/Verify 关系
- **参数建模**: Constraint + Binding
- **图形编辑器**: Fabric.js 画布、拖拽、缩放、平移、网格吸附
- **连线管理**: 正交/直线/曲线路由、障碍物避让、路径点编辑
- **撤销/重做**: Command 模式栈、连续拖拽合并
- **模型树**: 层级导航、搜索、右键菜单、拖拽重组
- **属性面板**: 动态表单、类型特有字段、多选编辑
- **SysML v2 解析**: 双向转换 (文本 ↔ 语义模型)
- **文件管理**: 原子保存、自动保存、崩溃恢复
- **导出**: SVG + PNG
- **REST API**: 8 个端点 (解析、序列化、CRUD、校验、导出)
