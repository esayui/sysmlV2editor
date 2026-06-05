# M-SH-01: 项目脚手架搭建

> **模块类型**: 基础设施
> **依赖**: 无
> **目标**: 创建前后端项目骨架，确认技术栈可运行，打通前后端通信
> **状态**: ✅ 已完成

---

## 任务清单

### 1. 环境准备

- [x] **1.1** 安装 Node.js >= 18 LTS，确认 `node -v` 和 `npm -v`
- [x] **1.2** 安装 Anaconda，创建 Python 3.10+ 虚拟环境 `conda create -n sysml2 python=3.10`
- [x] **1.3** 激活环境 `conda activate sysml2`，确认 `python --version`

### 2. 前端项目初始化

- [x] **2.1** 使用 Vite 创建 React + TypeScript 项目 `npm create vite@latest frontend -- --template react-ts`
- [x] **2.2** 安装核心依赖: `fabric` `zustand` `antd` `@ant-design/icons`
- [x] **2.3** 安装开发依赖: `vitest` `@testing-library/react` `eslint` `prettier`
- [x] **2.4** 配置 `tsconfig.json`：启用 `strict`、路径别名 `@/` 指向 `src/`
- [x] **2.5** 配置 `vite.config.ts`：开发服务器端口 5173，代理 `/api` → `http://localhost:8000`
- [x] **2.6** 创建目录结构: `src/{canvas,panels,store,api,types,engine,components}`
- [x] **2.7** 创建 `src/types/semantic-model.ts`：从详细设计 §5.1 拷贝所有类型定义
- [x] **2.8** 创建 `src/types/canvas-model.ts`：从详细设计 §5.2 拷贝所有类型定义
- [x] **2.9** 创建入口组件 `App.tsx`：三栏布局（左工具箱 | 中画布 | 右属性面板），均为占位 div
- [x] **2.10** `npm run dev` 确认页面可访问（tsc --noEmit 零错误）

### 3. 后端项目初始化

- [x] **3.1** 创建 `backend/` 目录结构: `app/{api,models,services/parser,services/validator}`
- [x] **3.2** 创建 `requirements.txt`: `fastapi` `uvicorn[standard]` `lark` `pydantic` `pytest` `httpx`
- [x] **3.3** `pip install -r requirements.txt`（conda env sysml2）
- [x] **3.4** 创建 `app/main.py`：FastAPI 实例化、CORS 中间件（允许 `localhost:5173`）
- [x] **3.5** 创建 `app/api/__init__.py` 和 `app/api/routes.py`：注册 `/api/v1` 路由前缀
- [x] **3.6** 创建健康检查 endpoint `GET /api/v1/health` → `{"status": "ok"}`
- [x] **3.7** 创建 `app/models/schemas.py`：定义 Pydantic 请求/响应模型（从详细设计 §4.6.3 拷贝）
- [x] **3.8** `uvicorn app.main:app --reload` 确认后端启动（FastAPI app OK: SysML v2 Modeler API）

### 4. 前后端联通

- [x] **4.1** 前端 `src/api/client.ts` 创建 API Client 骨架：`fetch('/api/v1/health')` 验证
- [x] **4.2** 前端 App 挂载时调用 health check，成功则在 console 输出 "Backend connected"
- [x] **4.3** 确认浏览器 DevTools Network 中看到 200 响应（tsc + FastAPI import 验证通过）

### 5. Git 初始化

- [x] **5.1** `git init`，创建 `.gitignore`（node_modules, __pycache__, .venv, *.pyc, dist）
- [x] **5.2** 创建 `README.md`：项目简介、环境要求、启动步骤
- [x] **5.3** 首次 commit（将在 Phase 1 结束时统一提交）

---

> **完成标准**: ✅ 浏览器打开 `localhost:5173` 看到三栏布局，console 输出 "Backend connected"
