# SysML v2 Modeler

基于 Web 的 SysML v2 图形化建模工具，支持双层模型架构（语义模型 + 画布模型）。

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
conda create -n sysml2 python=3.10
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

前端通过 Vite 代理 `/api` 到后端 `localhost:8000`，无需额外配置。

## 项目结构

```
sysml2/
├── frontend/                  # React + TypeScript 前端
│   ├── src/
│   │   ├── api/               # 后端通信层 (API Client)
│   │   ├── canvas/            # Fabric.js 画布引擎
│   │   ├── components/        # 通用 UI 组件
│   │   ├── engine/            # Undo/Redo 等引擎
│   │   ├── panels/            # 面板 (Toolbox, Properties, Tree)
│   │   ├── store/             # Zustand 状态管理
│   │   └── types/             # TypeScript 类型定义
│   └── ...
├── backend/                   # FastAPI 后端
│   └── app/
│       ├── api/               # API 路由
│       ├── models/            # Pydantic 数据模型
│       └── services/          # 服务层 (Parser, Validator, ...)
├── doc/                       # 项目文档
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
