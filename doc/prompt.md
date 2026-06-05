# Vibe Coding Prompt — SysML v2 图形化建模软件

> **目标**: 全自动完成 SysML v2 建模软件 V1 MVP 的全部 17 个模块开发
> **人工参与**: 零（全程自动）
> **启动方式**: 将此 prompt 交给 Claude Code Agent 执行

---

## 一、你的角色

你是一个**全栈工程主管 Agent**。你的任务是：

1. 按照预定义的 Phase 顺序，**逐个 Phase** 完成所有模块的开发
2. 每个模块 spawn 一个独立的**子 Agent** 负责实现和测试
3. **跟踪进度**：每完成一个模块，更新 `./doc/tasks/progress.md` 和对应模块的 `.md` 文件
4. **质量把控**：每个模块必须通过测试 + lint 检查才算完成
5. **失败处理**：失败模块最多重试 3 次，仍失败则标记跳过，继续下一个
6. **版本管理**：每个 Phase 完成后执行 `git commit`
7. **全程无人干预**：你不能停下来问问题，所有决策自行判断

---

## 二、项目背景

你正在构建一个**基于 SysML v2 标准的图形化系统建模软件**（MBSE 工具）。

### 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18+ / TypeScript 5+ |
| 图形引擎 | Fabric.js 6+ |
| 状态管理 | Zustand 4+ |
| UI 组件 | Ant Design 5+ |
| 构建 | Vite 5+ |
| 后端 | Python 3.10+ / FastAPI |
| 解析器 | Lark |
| 环境 | Windows + Anaconda |
| 测试(前端) | Vitest |
| 测试(后端) | pytest |
| Lint(前端) | ESLint |
| Lint(后端) | Ruff (代替 flake8) |

### 核心架构

```
浏览器 (React + Fabric.js)
    ├── UI Panels (Toolbox / Properties / ModelTree)
    ├── Canvas Layer (Fabric.js + Element Renderers + Connection Manager)
    ├── State Layer (Zustand: Semantic Store + Canvas Store)
    ├── Undo/Redo Engine
    └── API Client
          │
    ══════╪══════ HTTP
          │
Python Backend (FastAPI)
    ├── SysML v2 Parser (Lark)
    ├── Model Manager
    ├── Model Validator
    ├── File Service
    ├── Export Service
    └── API Layer
```

### 双层模型

- **语义模型**：SysML v2 语句（PartDef, PortDef, Requirement, Connection...），存为 JSON
- **画布模型**：图形坐标、样式、连线路径，通过 UUID 关联语义模型

---

## 三、项目文件结构（目标状态）

```
E:/sysml2/
├── frontend/
│   ├── src/
│   │   ├── canvas/
│   │   │   ├── canvas-engine.ts          # M-FE-01
│   │   │   ├── elements/
│   │   │   │   ├── base-renderer.ts
│   │   │   │   ├── block-renderer.ts
│   │   │   │   ├── port-renderer.ts
│   │   │   │   ├── requirement-renderer.ts
│   │   │   │   ├── constraint-renderer.ts
│   │   │   │   ├── action-renderer.ts
│   │   │   │   ├── state-renderer.ts
│   │   │   │   ├── actor-renderer.ts
│   │   │   │   ├── usecase-renderer.ts
│   │   │   │   ├── package-renderer.ts
│   │   │   │   ├── comment-renderer.ts
│   │   │   │   ├── text-renderer.ts
│   │   │   │   └── renderer-registry.ts
│   │   │   ├── connectors/
│   │   │   │   └── connection-manager.ts  # M-FE-03
│   │   │   └── interactions/
│   │   │       └── interaction-handler.ts # M-FE-04
│   │   ├── panels/
│   │   │   ├── toolbox/
│   │   │   │   └── toolbox-panel.tsx      # M-FE-05
│   │   │   ├── properties/
│   │   │   │   └── properties-panel.tsx   # M-FE-06
│   │   │   └── tree/
│   │   │       └── model-tree-panel.tsx   # M-FE-07
│   │   ├── store/
│   │   │   ├── index.ts                   # M-FE-08
│   │   │   └── slices/
│   │   │       ├── semantic-slice.ts
│   │   │       ├── canvas-slice.ts
│   │   │       └── ui-slice.ts
│   │   ├── engine/
│   │   │   └── undo-redo.ts               # M-FE-10
│   │   ├── api/
│   │   │   └── client.ts                  # M-FE-09
│   │   ├── types/
│   │   │   ├── semantic-model.ts
│   │   │   └── canvas-model.ts
│   │   ├── components/
│   │   │   └── app-shell.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── backend/
│   ├── app/
│   │   ├── main.py                         # M-BE-06
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes.py                   # M-BE-06
│   │   │   └── schemas.py                  # M-BE-06
│   │   ├── models/
│   │   │   └── semantic_model.py
│   │   └── services/
│   │       ├── parser/
│   │       │   ├── grammar/
│   │       │   │   ├── sysml2.lark
│   │       │   │   ├── kernel.lark
│   │       │   │   ├── declarations.lark
│   │       │   │   ├── expressions.lark
│   │       │   │   └── common.lark
│   │       │   ├── parser.py               # M-BE-01
│   │       │   ├── ast_builder.py
│   │       │   ├── ast_nodes.py
│   │       │   ├── model_builder.py
│   │       │   ├── text_generator.py
│   │       │   └── errors.py
│   │       ├── model_manager.py            # M-BE-02
│   │       ├── validator.py                # M-BE-03
│   │       ├── file_service.py             # M-BE-04
│   │       └── export_service.py           # M-BE-05
│   ├── tests/
│   │   ├── services/
│   │   │   ├── test_parser.py
│   │   │   ├── test_model_manager.py
│   │   │   ├── test_validator.py
│   │   │   ├── test_file_service.py
│   │   │   └── test_export_service.py
│   │   └── api/
│   │       └── test_routes.py
│   └── requirements.txt
├── doc/
│   ├── proposal.md
│   ├── detailed-design.md
│   ├── prompt.md                           # 本文件
│   └── tasks/
│       ├── progress.md
│       ├── M-SH-01-project-scaffolding.md
│       ├── M-FE-01-canvas-engine.md
│       ├── M-FE-02-element-renderers.md
│       ├── M-FE-03-connection-manager.md
│       ├── M-FE-04-interaction-handler.md
│       ├── M-FE-05-toolbox-panel.md
│       ├── M-FE-06-properties-panel.md
│       ├── M-FE-07-model-tree-panel.md
│       ├── M-FE-08-state-store.md
│       ├── M-FE-09-api-client.md
│       ├── M-FE-10-undo-redo-engine.md
│       ├── M-BE-01-sysmlv2-parser.md
│       ├── M-BE-02-model-manager.md
│       ├── M-BE-03-model-validator.md
│       ├── M-BE-04-file-service.md
│       ├── M-BE-05-export-service.md
│       └── M-BE-06-api-layer.md
└── README.md
```

---

## 四、执行协议

### 4.1 Phase 执行顺序

严格按照以下 7 个 Phase 顺序执行。每个 Phase 内的模块可以**并行 spawn 子 Agent**（无相互依赖）。

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6 ──→ Phase 7
```

**关键规则**：
- 必须等当前 Phase 的**所有模块全部完成（或跳过）**后，才能进入下一 Phase
- 进入下一 Phase 前，检查 `progress.md` 确认当前 Phase 所有模块状态为 ✅ 或 ⏸️

### 4.2 每个模块的执行流程

对于每个模块，执行以下步骤：

```
1. 读取任务文件: ./doc/tasks/<module-id>.md
2. 读取详细设计: ./doc/detailed-design.md 中对应章节
3. 读取需求文档: ./doc/proposal.md 中相关功能需求
4. Spawn 子 Agent，Prompt 包含:
   - 模块编号和名称
   - 该模块的任务清单（从任务文件读取）
   - 该模块的详细设计接口定义
   - 依赖模块的接口（已完成的模块）
   - 完成标准
   - 测试要求（≥80% 覆盖率）
5. 子 Agent 完成后，主 Agent 验证:
   a. 所有子任务 checkbox 已勾选？
   b. 单元测试全部通过？(npm test / pytest)
   c. Lint 检查通过？(npx eslint / ruff check)
   d. 测试覆盖率 ≥ 80%？
   e. Git working tree 干净（无遗留文件）？
6. 验证通过 → 更新 progress.md: 状态改为 ✅，填写完成日期
7. 验证失败 → 重试（最多 3 次）
```

### 4.3 失败重试协议

```
模块失败
    │
    ├── 第 1 次失败: 分析子 Agent 的错误日志，构造修复 Prompt，spawn 新子 Agent
    ├── 第 2 次失败: 换一个实现策略（如：简化部分边缘 case），spawn 新子 Agent
    ├── 第 3 次失败: 标记模块为 ⏸️（跳过），记录失败原因到 progress.md
    │
    └── 继续下一个模块
```

**记录格式**（在 progress.md 中添加注释）：
```
<!-- SKIP: M-FE-03 第3次重试仍失败。原因: Fabric.js 正交路由算法复杂度超预期。建议: 人工介入 -->
```

### 4.4 Git Commit 协议

每个 Phase 完成后，执行：

```bash
git add -A
git commit -m "feat(phase-N): <phase 名称> — <完成模块数>/<总模块数> modules

Completed: <模块列表>
Skipped: <跳过模块列表（如有）>"

# 示例:
# git commit -m "feat(phase-3): 画布交互 — 3/3 modules
#
# Completed: M-FE-02 Element Renderers, M-FE-04 Interaction Handler, M-FE-10 Undo/Redo Engine"
```

---

## 五、各模块子 Agent Prompt 模板

对于每个模块，主 Agent 使用以下模板生成子 Agent Prompt。**{}** 内的变量由主 Agent 根据当前模块填充。

---

### 子 Agent Prompt 模板

```
## 任务

你是 {module_id} {module_name} 的实现工程师。

### 背景

你正在参与构建一个 SysML v2 图形化建模软件。这是一个 Web 应用，前端 React+Fabric.js，后端 Python FastAPI。

### 你需要读取的文件

在开始编码前，请先阅读:
1. `./doc/detailed-design.md` 的 §{design_section} 章节 —— 了解本模块的详细设计
2. `./doc/tasks/{module_id}.md` —— 了解本模块的任务清单

### 已完成的依赖模块

以下模块已经实现并通过测试，你可以导入使用：{dependency_list}

### 你的任务

按照 `./doc/tasks/{module_id}.md` 中的任务清单，逐项完成所有子任务。

### 质量要求

1. **测试**: 所有测试必须通过。前端用 `npx vitest run`，后端用 `pytest`。
2. **覆盖率**: 本模块测试覆盖率 ≥ 80%。
3. **Lint**: 前端通过 `npx eslint`（零 error，warning 允许），后端通过 `ruff check`（零 E 类 error）。
4. **TypeScript**: strict 模式关闭，但禁止使用 `any` 类型。所有接口必须显式类型标注。
5. **Python**: 遵循 PEP 8，所有函数必须带 type hints。

### 完成标准

- 所有子任务 checkbox 可勾选
- 测试通过 + 覆盖率 ≥ 80%
- Lint 零 error
- 模块对外的接口与详细设计文档一致

### 约束

- 不要修改已完成模块的代码。如果发现依赖模块的接口有问题，在日志中报告，然后基于现有接口实现。
- 不要引入新的第三方依赖，除非任务清单明确要求。
- 保持代码风格与已完成模块一致。
```

---

## 六、Phase 定义

### Phase 1 — 基础（3 模块并行）

**目标**: 搭建项目骨架、定义数据核心、实现语法解析

| 模块 | 子 Agent Prompt 关键参数 |
|------|------------------------|
| **M-SH-01** 项目脚手架 | `{design_section}`: §1.1~1.3, `{dependency_list}`: 无 |
| **M-FE-08** State Store | `{design_section}`: §3.8, `{dependency_list}`: 无。需先创建 `src/types/semantic-model.ts` 和 `src/types/canvas-model.ts` 类型文件 |
| **M-BE-01** SysML v2 Parser | `{design_section}`: §4.1, `{dependency_list}`: 无 |

**Phase 1 完成检查**:
- [ ] `npm run dev` 前端启动成功
- [ ] `uvicorn app.main:app` 后端启动成功
- [ ] 前端 health check 成功
- [ ] Store 单元测试全部通过
- [ ] Parser 能解析 `part def Vehicle { }` 并返回 SemanticModel

---

### Phase 2 — 核心能力（4 模块并行）

**目标**: Canvas 画布、API 通信、模型管理、导出服务

| 模块 | 子 Agent Prompt 关键参数 |
|------|------------------------|
| **M-FE-01** Canvas Engine | `{design_section}`: §3.1, `{dependency_list}`: M-SH-01 (项目骨架), M-FE-08 (Store 类型) |
| **M-FE-09** API Client | `{design_section}`: §3.9, `{dependency_list}`: M-SH-01 (后端基础运行) |
| **M-BE-02** Model Manager | `{design_section}`: §4.2, `{dependency_list}`: M-BE-01 (Parser, 类型定义) |
| **M-BE-05** Export Service | `{design_section}`: §4.5, `{dependency_list}`: 无 |

---

### Phase 3 — 画布交互（3 模块并行）

**目标**: 元素可视化、用户交互、撤销重做

| 模块 | 子 Agent Prompt 关键参数 |
|------|------------------------|
| **M-FE-02** Element Renderers | `{design_section}`: §3.2, `{dependency_list}`: M-FE-01 (Canvas Engine), M-FE-08 (Store) |
| **M-FE-04** Interaction Handler | `{design_section}`: §3.4, `{dependency_list}`: M-FE-01 (Canvas Engine), M-FE-08 (Store) |
| **M-FE-10** Undo/Redo Engine | `{design_section}`: §3.10, `{dependency_list}`: M-FE-08 (Store) |

---

### Phase 4 — 连线（1 模块）

**目标**: 元素间连线创建、路径计算、样式

| 模块 | 子 Agent Prompt 关键参数 |
|------|------------------------|
| **M-FE-03** Connection Manager | `{design_section}`: §3.3, `{dependency_list}`: M-FE-01, M-FE-02 |

---

### Phase 5 — UI 面板（3 模块并行）

**目标**: 工具箱、属性编辑、模型树

| 模块 | 子 Agent Prompt 关键参数 |
|------|------------------------|
| **M-FE-05** Toolbox Panel | `{design_section}`: §3.5, `{dependency_list}`: M-FE-01, M-FE-04, M-FE-08 |
| **M-FE-06** Properties Panel | `{design_section}`: §3.6, `{dependency_list}`: M-FE-01, M-FE-02, M-FE-08 |
| **M-FE-07** Model Tree Panel | `{design_section}`: §3.7, `{dependency_list}`: M-FE-08 |

---

### Phase 6 — 后端集成（3 模块并行）

**目标**: 模型校验、文件持久化、API 路由

| 模块 | 子 Agent Prompt 关键参数 |
|------|------------------------|
| **M-BE-03** Model Validator | `{design_section}`: §4.3, `{dependency_list}`: M-BE-02 |
| **M-BE-04** File Service | `{design_section}`: §4.4, `{dependency_list}`: M-BE-01, M-BE-02 |
| **M-BE-06** API Layer | `{design_section}`: §4.6, `{dependency_list}`: M-BE-02, M-BE-03, M-BE-04, M-BE-05 |

---

### Phase 7 — 集成联调

**目标**: 前后端端到端测试，验证核心用户场景

这不是一个模块，而是验证任务。主 Agent 直接执行（不需要 spawn 子 Agent）：

1. **启动后端** (`uvicorn app.main:app &`)
2. **启动前端** (`npm run dev &`)
3. **执行 E2E 场景验证**（手动/脚本）:
   - [ ] 创建新项目 → 保存 → 关闭 → 重新打开 → 模型一致
   - [ ] 拖拽 Block 到画布 → 调整位置 → 修改属性 → 撤销 → 重做
   - [ ] 创建连接 → 拖拽元素 → 连线跟随更新
   - [ ] 解析 .sysml2 文本 → 模型树正确 → 图形正确
4. **更新 README.md**：完善项目说明、启动步骤、开发指南
5. **Final commit**: `git commit -m "feat(phase-7): 集成联调完成，V1 MVP 交付"`

---

## 七、启动指令

**作为主 Agent，你的第一件事是**：

1. 读取 `./doc/tasks/progress.md` 查看当前进度
2. 如果 Phase 1 未完成，从 Phase 1 开始
3. 按照 §4.2 的流程逐个模块执行
4. 每完成一个 Phase，执行 git commit
5. 直到 Phase 7 完成

**现在，请开始执行。从 Phase 1 的第一个模块开始。**
